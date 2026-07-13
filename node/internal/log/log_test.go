package log

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"fmt"
	mrand "math/rand"
	"strings"
	"testing"
	"time"
)

func testKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return priv
}

func fixedNow() time.Time { return time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC) }

func newTestThread(t *testing.T, priv ed25519.PrivateKey) (*ThreadLog, *Author) {
	t.Helper()
	l, _, err := NewThread(priv, "test thread", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	a, err := NewAuthor(l, priv)
	if err != nil {
		t.Fatal(err)
	}
	a.Now = fixedNow
	return l, a
}

func TestPrincipalIDRoundtrip(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	pid, err := PrincipalID(pub)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(pid, "ed25519:") || len(pid) != len("ed25519:")+52 {
		t.Fatalf("unexpected principal id shape: %s", pid)
	}
	got, err := PublicKey(pid)
	if err != nil {
		t.Fatal(err)
	}
	if !pub.Equal(got) {
		t.Fatal("public key did not roundtrip")
	}
}

func TestSignAndValidate(t *testing.T) {
	priv := testKey(t)
	_, a := newTestThread(t, priv)
	e, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent, Body: map[string]any{"text": "hello <world> & good day"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestTamperDetection(t *testing.T) {
	priv := testKey(t)
	_, a := newTestThread(t, priv)
	e, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent, Body: map[string]any{"text": "original"}})
	if err != nil {
		t.Fatal(err)
	}
	tampered := *e
	tampered.Body = json.RawMessage(`{"text":"forged"}`)
	if err := tampered.Validate(); err == nil {
		t.Fatal("tampered body passed validation")
	}
	tampered = *e
	tampered.Lane = LaneSummary
	if err := tampered.Validate(); err == nil {
		t.Fatal("tampered lane passed validation")
	}
	tampered = *e
	other := testKey(t)
	pid, _ := PrincipalID(other.Public().(ed25519.PublicKey))
	tampered.Author = pid
	if err := tampered.Validate(); err == nil {
		t.Fatal("swapped author passed validation")
	}
}

func TestCanonicalBodyKeyOrderIrrelevant(t *testing.T) {
	priv := testKey(t)
	_, a := newTestThread(t, priv)
	e, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent,
		Body: json.RawMessage(`{"b": 2, "a": {"y": 1.50, "x": "s"}, "n": null}`)})
	if err != nil {
		t.Fatal(err)
	}
	// Same content, different key order and whitespace: signature must still verify.
	reordered := *e
	reordered.Body = json.RawMessage(`{ "n": null, "a": {"x": "s", "y": 1.50}, "b": 2 }`)
	if err := reordered.Validate(); err != nil {
		t.Fatalf("reordered-body entry failed validation: %v", err)
	}
	// But a changed number literal (1.5 vs 1.50) is different content.
	changed := *e
	changed.Body = json.RawMessage(`{"b": 2, "a": {"y": 1.5, "x": "s"}, "n": null}`)
	if err := changed.Validate(); err == nil {
		t.Fatal("changed number literal passed validation")
	}
}

func TestChainRules(t *testing.T) {
	priv := testKey(t)
	l, a := newTestThread(t, priv)
	e1, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent, Body: map[string]any{"text": "one"}})
	if err != nil {
		t.Fatal(err)
	}
	e2, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent, Body: map[string]any{"text": "two"}})
	if err != nil {
		t.Fatal(err)
	}
	if e2.Seq != e1.Seq+1 {
		t.Fatalf("seq did not increment: %d then %d", e1.Seq, e2.Seq)
	}
	h1, _ := e1.Hash()
	if e2.Prev != h1 {
		t.Fatal("prev does not point at prior entry hash")
	}
	// Redelivery of an identical entry is a no-op.
	n := l.Len()
	if err := l.Append(e2); err != nil {
		t.Fatalf("idempotent redelivery rejected: %v", err)
	}
	if l.Len() != n {
		t.Fatal("redelivery duplicated entry")
	}
	// A gap in seq is rejected.
	gap := *e2
	gap.ID = "01JZZZZZZZZZZZZZZZZZZZZZZZ"
	gap.Seq = e2.Seq + 2
	gap.Prev, _ = e2.Hash()
	_ = gap.Sign(priv)
	if err := l.Append(&gap); err == nil {
		t.Fatal("seq gap admitted")
	}
	// Control and content lanes chain independently.
	c1, err := a.Append(Draft{Kind: KindMembership, Lane: LaneControl, Body: map[string]any{"member": a.Principal(), "role": "steward"}})
	if err != nil {
		t.Fatal(err)
	}
	if c1.Seq != 2 { // genesis core.thread was control seq 1
		t.Fatalf("control lane seq = %d, want 2 (independent of content chain)", c1.Seq)
	}
}

func TestUnknownReservedKindRejected(t *testing.T) {
	priv := testKey(t)
	_, a := newTestThread(t, priv)
	if _, err := a.Append(Draft{Kind: "core.made_up", Lane: LaneContent, Body: map[string]any{}}); err == nil {
		t.Fatal("unknown core.* kind admitted")
	}
	// Namespaced extension kinds are always fine (must-replicate, may-ignore).
	if _, err := a.Append(Draft{Kind: "dev.lamdis.home.motion_event", Lane: LaneContent, Body: map[string]any{"camera": "pool"}}); err != nil {
		t.Fatalf("extension kind rejected: %v", err)
	}
}

// TestConvergenceUnderPermutation is the M0 property test: three authors
// write concurrently; any per-chain-ordered delivery permutation converges
// to the identical total order on every replica.
func TestConvergenceUnderPermutation(t *testing.T) {
	creator := testKey(t)
	l, genesis, err := NewThread(creator, "converge", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	keys := []ed25519.PrivateKey{creator, testKey(t), testKey(t)}
	for i, k := range keys {
		a, err := NewAuthor(l, k)
		if err != nil {
			t.Fatal(err)
		}
		a.Now = fixedNow
		for j := 0; j < 5; j++ {
			if _, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent,
				Body: map[string]any{"text": fmt.Sprintf("author %d msg %d", i, j)}}); err != nil {
				t.Fatal(err)
			}
		}
	}
	want := make([]string, 0, l.Len())
	for _, e := range l.Entries() {
		want = append(want, e.ID)
	}

	rng := mrand.New(mrand.NewSource(42))
	for trial := 0; trial < 25; trial++ {
		replica := NewThreadLog(l.Thread)
		if err := replica.Append(genesis); err != nil {
			t.Fatal(err)
		}
		// Interleave chains randomly, but keep each chain's own order (as sync does).
		pending := map[ChainKey][]*Entry{}
		for k := range l.Heads() {
			pending[k] = l.After(k, 0)
		}
		chainKeys := make([]ChainKey, 0, len(pending))
		for k := range pending {
			chainKeys = append(chainKeys, k)
		}
		for len(pending) > 0 {
			k := chainKeys[rng.Intn(len(chainKeys))]
			es, ok := pending[k]
			if !ok || len(es) == 0 {
				delete(pending, k)
				chainKeys = nil
				for kk := range pending {
					chainKeys = append(chainKeys, kk)
				}
				continue
			}
			if err := replica.Append(es[0]); err != nil {
				// genesis already applied; skip idempotently
				t.Fatalf("trial %d: append failed: %v", trial, err)
			}
			pending[k] = es[1:]
		}
		got := make([]string, 0, replica.Len())
		for _, e := range replica.Entries() {
			got = append(got, e.ID)
		}
		if len(got) != len(want) {
			t.Fatalf("trial %d: replica has %d entries, want %d", trial, len(got), len(want))
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("trial %d: order diverged at %d: %s vs %s", trial, i, got[i], want[i])
			}
		}
	}
}

// TestVersionVectorSync exercises Heads/Missing/After as the sync protocol will.
func TestVersionVectorSync(t *testing.T) {
	priv := testKey(t)
	l, a := newTestThread(t, priv)
	for i := 0; i < 4; i++ {
		if _, err := a.Append(Draft{Kind: KindMessage, Lane: LaneContent, Body: map[string]any{"i": i}}); err != nil {
			t.Fatal(err)
		}
	}
	// Fresh replica: needs everything the source has.
	replica := NewThreadLog(l.Thread)
	need := replica.Missing(l.Heads())
	var streamed int
	for k, since := range need {
		for _, e := range l.After(k, since) {
			if err := replica.Append(e); err != nil {
				t.Fatal(err)
			}
			streamed++
		}
	}
	if streamed != l.Len() {
		t.Fatalf("streamed %d entries, want %d", streamed, l.Len())
	}
	if len(replica.Missing(l.Heads())) != 0 {
		t.Fatal("replica still reports missing entries after full sync")
	}
	if replica.MaxLamport() != l.MaxLamport() {
		t.Fatal("lamport clocks diverged after sync")
	}
}
