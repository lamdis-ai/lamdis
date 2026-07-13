package api

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

// TestBidirectionalContribute: Bob holds contribute+read; his local posts
// flow back to Alice's node on sync. Charlie holds summary only; his locally
// authored content is rejected at Alice's door.
func TestBidirectionalContribute(t *testing.T) {
	ctx := context.Background()
	aliceStore, alicePriv, _ := newNode(t)
	tl, genesis, err := protolog.NewThread(alicePriv, "joint roadmap", nil)
	if err != nil {
		t.Fatal(err)
	}
	alice, err := protolog.NewAuthor(tl, alicePriv)
	if err != nil {
		t.Fatal(err)
	}
	bobStore, bobPriv, bobPid := newNode(t)
	charlieStore, charliePriv, charliePid := newNode(t)
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bobPid, "scopes": []string{"contribute", "read", "search"}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": charliePid, "scopes": []string{"summary"}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "kickoff notes from alice"}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&Server{Sync: &syncp.Server{Store: aliceStore}}).Handler())
	defer srv.Close()

	// Bob syncs, authors locally, syncs again: his entry reaches Alice.
	bob := &syncp.Client{Store: bobStore, Peer: NewHTTPTransport(srv.URL, bobPriv), Self: bobPid}
	if _, err := bob.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	btl, err := bobStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	ba, err := protolog.NewAuthor(btl, bobPriv)
	if err != nil {
		t.Fatal(err)
	}
	reply, err := ba.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "bob's reply from his own node"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := bobStore.AppendEntries(ctx, []*protolog.Entry{reply}); err != nil {
		t.Fatal(err)
	}
	if _, err := bob.SyncThread(ctx, genesis.ID); err != nil {
		t.Fatal(err)
	}
	atl, err := aliceStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if atl.Get(reply.ID) == nil {
		t.Fatal("bob's contribution did not reach alice's node")
	}

	// Idempotence: another sync round exchanges nothing.
	n, err := bob.SyncThread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("converged bidirectional sync still exchanged %d entries", n)
	}

	// Charlie (summary-only) syncs, then tries to smuggle content upstream.
	charlie := &syncp.Client{Store: charlieStore, Peer: NewHTTPTransport(srv.URL, charliePriv), Self: charliePid}
	if _, err := charlie.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	ctl, err := charlieStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	ca, err := protolog.NewAuthor(ctl, charliePriv)
	if err != nil {
		t.Fatal(err)
	}
	smuggled, err := ca.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "charlie's unauthorized summary"}})
	if err != nil {
		t.Fatal(err) // local append is legal; the boundary is the wire
	}
	if err := charlieStore.AppendEntries(ctx, []*protolog.Entry{smuggled}); err != nil {
		t.Fatal(err)
	}
	if _, err := charlie.SyncThread(ctx, genesis.ID); err == nil {
		t.Fatal("summary-only principal pushed content without contribute")
	} else if !strings.Contains(err.Error(), "push") {
		t.Fatalf("unexpected error: %v", err)
	}
	if atl, _ := aliceStore.Thread(ctx, genesis.ID); atl.Get(smuggled.ID) != nil {
		t.Fatal("unauthorized entry landed on alice's node")
	}
}

// evilTransport serves entries authored by a principal that never held
// contribute; the client must refuse to ingest them.
type evilTransport struct {
	inner syncp.Transport
	extra []*protolog.Entry
}

func (e *evilTransport) List(ctx context.Context) ([]string, error) { return e.inner.List(ctx) }
func (e *evilTransport) Push(ctx context.Context, req syncp.PushRequest) (*syncp.PushResponse, error) {
	return e.inner.Push(ctx, req)
}
func (e *evilTransport) Pull(ctx context.Context, req syncp.PullRequest) (*syncp.PullResponse, error) {
	resp, err := e.inner.Pull(ctx, req)
	if err != nil {
		return nil, err
	}
	resp.Entries = append(resp.Entries, e.extra...)
	return resp, nil
}

func TestClientRejectsUnauthorizedPeerData(t *testing.T) {
	ctx := context.Background()
	aliceStore, alicePriv, _ := newNode(t)
	tl, genesis, err := protolog.NewThread(alicePriv, "target thread", nil)
	if err != nil {
		t.Fatal(err)
	}
	alice, err := protolog.NewAuthor(tl, alicePriv)
	if err != nil {
		t.Fatal(err)
	}
	bobStore, bobPriv, bobPid := newNode(t)
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bobPid, "scopes": []string{"read", "search"}}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	// Mallory never held contribute; the evil peer appends her entries to
	// every pull response. Build them against a replica of the thread.
	_, malloryPriv, _ := newNode(t)
	replica := protolog.NewThreadLog(tl.Thread)
	for _, e := range tl.Entries() {
		if err := replica.Append(e); err != nil {
			t.Fatal(err)
		}
	}
	ma, err := protolog.NewAuthor(replica, malloryPriv)
	if err != nil {
		t.Fatal(err)
	}
	injected, err := ma.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "planted disinformation"}})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&Server{Sync: &syncp.Server{Store: aliceStore}}).Handler())
	defer srv.Close()
	bob := &syncp.Client{Store: bobStore, Self: bobPid,
		Peer: &evilTransport{inner: NewHTTPTransport(srv.URL, bobPriv), extra: []*protolog.Entry{injected}}}
	if _, err := bob.SyncThread(ctx, genesis.ID); err == nil {
		t.Fatal("client ingested entries from an author without contribute")
	}
	if btl, err := bobStore.Thread(ctx, genesis.ID); err == nil && btl.Get(injected.ID) != nil {
		t.Fatal("unauthorized entry persisted on the client")
	}
}
