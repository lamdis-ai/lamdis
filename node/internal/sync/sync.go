// Package sync replicates threads between nodes. The protocol is two verbs
// over any transport: List (which threads can I, principal P, see?) and
// Pull (given my version vector for a thread, stream what I'm missing —
// filtered to the lanes my scopes allow). Serving is always evaluated *as a
// principal*; a peer holding only summary scope is never sent a content
// entry, so out-of-scope data never reaches its disk.
package sync

import (
	"context"
	"fmt"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/perm"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
)

// Head is one chain position in wire form.
type Head struct {
	Author string        `json:"author"`
	Lane   protolog.Lane `json:"lane"`
	Seq    uint64        `json:"seq"`
}

// PullRequest asks for everything after the caller's heads in one thread.
type PullRequest struct {
	Thread string `json:"thread"`
	Have   []Head `json:"have"`
}

// PullResponse carries missing entries in per-chain seq order.
type PullResponse struct {
	Entries []*protolog.Entry `json:"entries"`
}

// Transport is what a client needs from a remote peer.
type Transport interface {
	List(ctx context.Context) ([]string, error)
	Pull(ctx context.Context, req PullRequest) (*PullResponse, error)
}

// Server answers List/Pull against a local store, enforcing permissions.
type Server struct {
	Store store.Store
	Now   func() time.Time
}

func (s *Server) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// visibleLanes folds the thread's permissions and returns the lanes the
// principal may replicate (nil = thread invisible to them).
func (s *Server) visibleLanes(ctx context.Context, threadID, principal string) ([]protolog.Lane, error) {
	tl, err := s.Store.Thread(ctx, threadID)
	if err != nil {
		return nil, err
	}
	st := perm.Fold(threadID, tl.Entries())
	return st.Lanes(principal, s.now()), nil
}

// List returns the ids of threads the principal holds any scope on.
func (s *Server) List(ctx context.Context, principal string) ([]string, error) {
	ids, err := s.Store.Threads(ctx)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, id := range ids {
		lanes, err := s.visibleLanes(ctx, id, principal)
		if err != nil {
			return nil, err
		}
		if len(lanes) > 0 {
			out = append(out, id)
		}
	}
	return out, nil
}

// Pull returns entries the principal is missing, restricted to permitted
// lanes. Chains stream in ascending seq so receivers can verify as they go.
func (s *Server) Pull(ctx context.Context, principal string, req PullRequest) (*PullResponse, error) {
	lanes, err := s.visibleLanes(ctx, req.Thread, principal)
	if err != nil {
		return nil, err
	}
	if len(lanes) == 0 {
		// Indistinguishable from a nonexistent thread: no oracle for strangers.
		return nil, fmt.Errorf("thread %s not found", req.Thread)
	}
	permitted := map[protolog.Lane]bool{}
	for _, l := range lanes {
		permitted[l] = true
	}
	have := map[protolog.ChainKey]uint64{}
	for _, h := range req.Have {
		have[protolog.ChainKey{Thread: req.Thread, Author: h.Author, Lane: h.Lane}] = h.Seq
	}
	tl, err := s.Store.Thread(ctx, req.Thread)
	if err != nil {
		return nil, err
	}
	resp := &PullResponse{}
	for key := range tl.Heads() {
		if !permitted[key.Lane] {
			continue
		}
		for _, e := range tl.After(key, have[key]) {
			resp.Entries = append(resp.Entries, e)
		}
	}
	return resp, nil
}

// Client pulls threads from one remote peer into the local store.
type Client struct {
	Store store.Store
	Peer  Transport
}

// SyncAll lists remote-visible threads and pulls each. Returns per-thread
// entry counts. Unknown threads bootstrap from their control lane.
func (c *Client) SyncAll(ctx context.Context) (map[string]int, error) {
	ids, err := c.Peer.List(ctx)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, id := range ids {
		n, err := c.SyncThread(ctx, id)
		if err != nil {
			return counts, fmt.Errorf("thread %s: %w", id, err)
		}
		counts[id] = n
	}
	return counts, nil
}

// SyncThread pulls one thread. It sends our current heads and appends
// whatever comes back; the store re-validates every signature and chain
// position, so a malicious peer cannot inject an invalid entry.
func (c *Client) SyncThread(ctx context.Context, threadID string) (int, error) {
	var have []Head
	if tl, err := c.Store.Thread(ctx, threadID); err == nil {
		for key, seq := range tl.Heads() {
			have = append(have, Head{Author: key.Author, Lane: key.Lane, Seq: seq})
		}
	} // unknown thread: empty vector bootstraps from genesis
	resp, err := c.Peer.Pull(ctx, PullRequest{Thread: threadID, Have: have})
	if err != nil {
		return 0, err
	}
	if len(resp.Entries) == 0 {
		return 0, nil
	}
	// Order chains so the control lane (and each chain's low seqs) land
	// first: genesis must exist before other chains reference the thread.
	ordered := orderForAppend(resp.Entries, threadID)
	if err := c.Store.AppendEntries(ctx, ordered); err != nil {
		return 0, err
	}
	return len(ordered), nil
}

// orderForAppend sorts pulled entries so appends satisfy chain rules:
// genesis first, then per-chain ascending seq, control lanes before others
// (grants must be verifiable before content that relies on them).
func orderForAppend(entries []*protolog.Entry, threadID string) []*protolog.Entry {
	out := append([]*protolog.Entry(nil), entries...)
	laneRank := map[protolog.Lane]int{protolog.LaneControl: 0, protolog.LaneSummary: 1, protolog.LaneContent: 2}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && lessAppend(out[j], out[j-1], threadID, laneRank); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func lessAppend(a, b *protolog.Entry, threadID string, laneRank map[protolog.Lane]int) bool {
	if (a.ID == threadID) != (b.ID == threadID) {
		return a.ID == threadID // genesis first
	}
	if laneRank[a.Lane] != laneRank[b.Lane] {
		return laneRank[a.Lane] < laneRank[b.Lane]
	}
	if a.Author != b.Author {
		return a.Author < b.Author
	}
	return a.Seq < b.Seq
}
