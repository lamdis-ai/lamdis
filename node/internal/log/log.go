package log

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/oklog/ulid/v2"
)

// ChainKey identifies one hash chain: entries by one author in one lane of one thread.
type ChainKey struct {
	Thread string
	Author string
	Lane   Lane
}

// ChainHead is the replicated position of a chain: last seq and last entry hash.
type ChainHead struct {
	Seq  uint64
	Hash string
}

// ThreadLog is the in-memory model of one thread: every entry received so
// far, indexed by chain. Persistence lives in the store package; this type
// owns the protocol invariants and is the single place append rules exist.
type ThreadLog struct {
	Thread  string
	heads   map[ChainKey]ChainHead
	byID    map[string]*Entry
	entries []*Entry // maintained in (lamport, author, id) order
	lamport uint64   // max lamport observed
}

func NewThreadLog(thread string) *ThreadLog {
	return &ThreadLog{
		Thread: thread,
		heads:  map[ChainKey]ChainHead{},
		byID:   map[string]*Entry{},
	}
}

// MaxLamport returns the highest lamport clock observed in this thread.
func (l *ThreadLog) MaxLamport() uint64 { return l.lamport }

// Get returns an entry by id, or nil.
func (l *ThreadLog) Get(id string) *Entry { return l.byID[id] }

// Len returns the number of entries.
func (l *ThreadLog) Len() int { return len(l.entries) }

// Entries returns all entries in the protocol's total order (lamport, author, id).
// The returned slice is shared; callers must not mutate it.
func (l *ThreadLog) Entries() []*Entry { return l.entries }

// Heads returns the version vector of this log: for each chain, the highest
// contiguous seq held. This is what sync exchanges.
func (l *ThreadLog) Heads() map[ChainKey]uint64 {
	vv := make(map[ChainKey]uint64, len(l.heads))
	for k, h := range l.heads {
		vv[k] = h.Seq
	}
	return vv
}

// HeadHashes returns each chain's full head: seq and last entry hash. Heads
// carries only seq because that is all sync needs; artifacts that commit to a
// thread's exact position — attestations — need the hashes too.
func (l *ThreadLog) HeadHashes() map[ChainKey]ChainHead {
	hh := make(map[ChainKey]ChainHead, len(l.heads))
	for k, h := range l.heads {
		hh[k] = h
	}
	return hh
}

// Missing returns, for each chain the remote holds, the seq after which we
// need entries. Chains we've never seen are requested from 0.
func (l *ThreadLog) Missing(remote map[ChainKey]uint64) map[ChainKey]uint64 {
	need := map[ChainKey]uint64{}
	for k, rs := range remote {
		if have := l.heads[k].Seq; rs > have {
			need[k] = have
		}
	}
	return need
}

// After returns the entries of one chain with seq > since, ascending.
func (l *ThreadLog) After(k ChainKey, since uint64) []*Entry {
	var out []*Entry
	for _, e := range l.entries {
		if e.Thread == k.Thread && e.Author == k.Author && e.Lane == k.Lane && e.Seq > since {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Seq < out[j].Seq })
	return out
}

// Append validates e against its chain and admits it. Duplicate delivery of
// an identical entry is a no-op (idempotent). Entries must arrive in seq
// order per chain; sync guarantees that by streaming chains ascending.
func (l *ThreadLog) Append(e *Entry) error {
	if e.Thread != l.Thread {
		return fmt.Errorf("entry %s: thread %s does not belong to log %s", e.ID, e.Thread, l.Thread)
	}
	if err := e.Validate(); err != nil {
		return err
	}
	if prior, ok := l.byID[e.ID]; ok {
		priorHash, _ := prior.Hash()
		h, _ := e.Hash()
		if priorHash == h {
			return nil // idempotent redelivery
		}
		return fmt.Errorf("entry %s: id collision with different content", e.ID)
	}
	key := ChainKey{Thread: e.Thread, Author: e.Author, Lane: e.Lane}
	head, exists := l.heads[key]
	switch {
	case !exists && e.Seq != 1:
		return fmt.Errorf("entry %s: first entry of chain must have seq 1, got %d", e.ID, e.Seq)
	case !exists && e.Prev != GenesisPrev:
		return fmt.Errorf("entry %s: first entry of chain must have genesis prev", e.ID)
	case exists && e.Seq != head.Seq+1:
		return fmt.Errorf("entry %s: seq %d does not extend chain at %d", e.ID, e.Seq, head.Seq)
	case exists && e.Prev != head.Hash:
		return fmt.Errorf("entry %s: prev does not match chain head hash (tampered or forked chain)", e.ID)
	}
	h, err := e.Hash()
	if err != nil {
		return err
	}
	l.heads[key] = ChainHead{Seq: e.Seq, Hash: h}
	l.byID[e.ID] = e
	i := sort.Search(len(l.entries), func(i int) bool { return !Less(l.entries[i], e) })
	l.entries = append(l.entries, nil)
	copy(l.entries[i+1:], l.entries[i:])
	l.entries[i] = e
	if e.Lamport > l.lamport {
		l.lamport = e.Lamport
	}
	return nil
}

// Author creates, chains, and signs entries for one principal writing into
// one ThreadLog. It owns seq/lamport/prev assignment so callers can't get
// the invariants wrong.
type Author struct {
	log  *ThreadLog
	priv ed25519.PrivateKey
	pid  string
	// Now is injectable for deterministic tests and conformance vectors.
	Now func() time.Time
}

func NewAuthor(l *ThreadLog, priv ed25519.PrivateKey) (*Author, error) {
	pid, err := PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		return nil, err
	}
	return &Author{log: l, priv: priv, pid: pid, Now: time.Now}, nil
}

func (a *Author) Principal() string { return a.pid }

// Draft is the caller-supplied part of a new entry.
type Draft struct {
	Kind       string
	Lane       Lane
	OnBehalfOf string
	Refs       *Refs
	Body       any // marshaled to JSON; may be json.RawMessage
}

// Append builds the next entry in this author's chain, signs it, and admits
// it to the log. Returns the finalized entry.
func (a *Author) Append(d Draft) (*Entry, error) {
	body, err := toRawBody(d.Body)
	if err != nil {
		return nil, err
	}
	key := ChainKey{Thread: a.log.Thread, Author: a.pid, Lane: d.Lane}
	head := a.log.heads[key]
	prev := GenesisPrev
	if head.Seq > 0 {
		prev = head.Hash
	}
	now := a.Now().UTC()
	e := &Entry{
		V:          EnvelopeVersion,
		ID:         ulid.MustNew(ulid.Timestamp(now), ulid.DefaultEntropy()).String(),
		Thread:     a.log.Thread,
		Kind:       d.Kind,
		Lane:       d.Lane,
		Author:     a.pid,
		OnBehalfOf: d.OnBehalfOf,
		Seq:        head.Seq + 1,
		Lamport:    a.log.MaxLamport() + 1,
		Prev:       prev,
		TS:         now.Format(time.RFC3339),
		Refs:       d.Refs,
		Body:       body,
	}
	if err := e.Sign(a.priv); err != nil {
		return nil, err
	}
	if err := a.log.Append(e); err != nil {
		return nil, err
	}
	return e, nil
}

// NewThread creates a private thread. See NewThreadWith for options.
func NewThread(priv ed25519.PrivateKey, title string, now func() time.Time) (*ThreadLog, *Entry, error) {
	return NewThreadWith(priv, title, false, now)
}

// NewThreadWith creates a genesis entry (kind core.thread) and the ThreadLog
// it anchors. The thread id is the genesis entry's id. Discoverable threads
// advertise id+title to authenticated peers so access can be requested.
func NewThreadWith(priv ed25519.PrivateKey, title string, discoverable bool, now func() time.Time) (*ThreadLog, *Entry, error) {
	pid, err := PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		return nil, nil, err
	}
	if now == nil {
		now = time.Now
	}
	t := now().UTC()
	id := ulid.MustNew(ulid.Timestamp(t), ulid.DefaultEntropy()).String()
	genesis := map[string]any{"title": title, "stewards": []string{pid}}
	if discoverable {
		genesis["discoverable"] = true
	}
	body, err := toRawBody(genesis)
	if err != nil {
		return nil, nil, err
	}
	e := &Entry{
		V:       EnvelopeVersion,
		ID:      id,
		Thread:  id, // genesis: thread id is its own id
		Kind:    KindThread,
		Lane:    LaneControl,
		Author:  pid,
		Seq:     1,
		Lamport: 1,
		Prev:    GenesisPrev,
		TS:      t.Format(time.RFC3339),
		Body:    body,
	}
	if err := e.Sign(priv); err != nil {
		return nil, nil, err
	}
	l := NewThreadLog(id)
	if err := l.Append(e); err != nil {
		return nil, nil, err
	}
	return l, e, nil
}

func toRawBody(v any) (json.RawMessage, error) {
	switch b := v.(type) {
	case json.RawMessage:
		return b, nil
	case nil:
		return nil, fmt.Errorf("body is required")
	default:
		raw, err := json.Marshal(v)
		if err != nil {
			return nil, err
		}
		return raw, nil
	}
}
