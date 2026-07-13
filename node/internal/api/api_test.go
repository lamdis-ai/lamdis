package api

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

const secretText = "SECRET-raw-content-the-peer-must-never-receive"

func newNode(t *testing.T) (store.Store, ed25519.PrivateKey, string) {
	t.Helper()
	s, err := store.OpenSQLite(filepath.Join(t.TempDir(), "node.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := protolog.PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	return s, priv, pid
}

// capturingTransport records every response body that reaches the client.
type capturingTransport struct {
	inner http.RoundTripper
	seen  *bytes.Buffer
}

func (c *capturingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := c.inner.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	c.seen.Write(body)
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return resp, nil
}

// TestCoworkerScenario is the P2P lighthouse: Alice's node and Bob's node,
// direct HTTP, summary-only grant. Wire-level assertion: no content-lane
// byte ever reaches Bob.
func TestCoworkerScenario(t *testing.T) {
	ctx := context.Background()

	// Alice's node with a thread: content + summary lanes.
	aliceStore, alicePriv, _ := newNode(t)
	tl, genesis, err := protolog.NewThread(alicePriv, "q3 payments migration", nil)
	if err != nil {
		t.Fatal(err)
	}
	alice, err := protolog.NewAuthor(tl, alicePriv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": secretText}}); err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "migration on track; cutover planned for August"}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer((&Server{Sync: &syncp.Server{Store: aliceStore}}).Handler())
	defer srv.Close()

	// Bob's node and captured HTTP client.
	bobStore, bobPriv, bobPid := newNode(t)
	captured := &capturingTransport{inner: http.DefaultTransport, seen: &bytes.Buffer{}}
	transport := NewHTTPTransport(srv.URL, bobPriv)
	transport.Client = &http.Client{Transport: captured}
	bob := &syncp.Client{Store: bobStore, Peer: transport}

	// Before any grant: nothing visible, pull is a 404, not a permission oracle.
	ids, err := transport.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("ungranted peer sees threads: %v", ids)
	}
	if _, err := bob.SyncThread(ctx, genesis.ID); err == nil {
		t.Fatal("direct pull of ungranted thread succeeded")
	}

	// Unauthenticated and tampered requests are rejected.
	resp, err := http.Post(srv.URL+"/v1/sync/list", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unsigned request got %d, want 401", resp.StatusCode)
	}

	// Alice grants Bob summary+search (the human step; CLI/UI signs this).
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bobPid, "scopes": []string{"summary", "search"}}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}

	// Bob syncs: control + summary arrive, content does not.
	counts, err := bob.SyncAll(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if counts[genesis.ID] == 0 {
		t.Fatal("granted peer synced nothing")
	}
	bobThread, err := bobStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range bobThread.Entries() {
		if e.Lane == protolog.LaneContent {
			t.Fatalf("content entry %s replicated to summary-scoped peer", e.ID)
		}
	}
	sums, err := bobStore.Entries(ctx, genesis.ID, []protolog.Lane{protolog.LaneSummary})
	if err != nil || len(sums) != 1 {
		t.Fatalf("bob summaries = %d (err %v), want 1", len(sums), err)
	}

	// Incremental: Alice posts more of both lanes; Bob receives only summary.
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": secretText + "-2"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "cutover date moved up one week"}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	if _, err := bob.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	sums, _ = bobStore.Entries(ctx, genesis.ID, []protolog.Lane{protolog.LaneSummary})
	if len(sums) != 2 {
		t.Fatalf("bob summaries after incremental sync = %d, want 2", len(sums))
	}

	// Revoke: thread disappears for Bob; nothing further syncs.
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindRevoke, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bobPid}}); err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "post-revoke summary bob must not see"}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	ids, err = transport.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("revoked peer still sees threads: %v", ids)
	}
	if _, err := bob.SyncThread(ctx, genesis.ID); err == nil {
		t.Fatal("revoked peer can still pull")
	}
	sums, _ = bobStore.Entries(ctx, genesis.ID, []protolog.Lane{protolog.LaneSummary})
	if len(sums) != 2 {
		t.Fatalf("revoked peer gained summaries: %d", len(sums))
	}

	// The wire-level guarantee: across the entire scenario, no content-lane
	// byte ever reached Bob's HTTP client.
	if bytes.Contains(captured.seen.Bytes(), []byte(secretText)) {
		t.Fatal("content-lane text crossed the wire to a summary-scoped peer")
	}

	// A stranger sees nothing at all.
	_, charliePriv, _ := ed25519.GenerateKey(rand.Reader)
	ct := NewHTTPTransport(srv.URL, charliePriv)
	ids, err = ct.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("stranger sees threads: %v", ids)
	}
}

// TestReadGrantFullSync verifies a read-scoped peer gets all three lanes and
// converges to the same entry set as the origin.
func TestReadGrantFullSync(t *testing.T) {
	ctx := context.Background()
	aliceStore, alicePriv, _ := newNode(t)
	tl, genesis, err := protolog.NewThread(alicePriv, "shared build", nil)
	if err != nil {
		t.Fatal(err)
	}
	alice, err := protolog.NewAuthor(tl, alicePriv)
	if err != nil {
		t.Fatal(err)
	}
	bobStore, bobPriv, bobPid := newNode(t)
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bobPid, "scopes": []string{"read", "contribute", "search"}}}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		if _, err := alice.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
			Body: map[string]any{"text": "build note", "i": i}}); err != nil {
			t.Fatal(err)
		}
	}
	if err := aliceStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&Server{Sync: &syncp.Server{Store: aliceStore}}).Handler())
	defer srv.Close()
	bob := &syncp.Client{Store: bobStore, Peer: NewHTTPTransport(srv.URL, bobPriv)}
	if _, err := bob.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	bt, err := bobStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bt.Len() != tl.Len() {
		t.Fatalf("read-scoped replica has %d entries, origin has %d", bt.Len(), tl.Len())
	}
	// Second sync is a no-op (version vectors converged).
	n, err := bob.SyncThread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("converged sync still pulled %d entries", n)
	}
}
