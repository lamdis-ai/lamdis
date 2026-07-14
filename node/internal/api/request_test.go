package api

import (
	"context"
	"net/http/httptest"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/perm"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

// TestAccessRequestLoop: Jane discovers a discoverable thread she can't see
// into, requests access with a reason, Alice's fold surfaces it as pending,
// Alice approves, Jane syncs and receives — while a hidden thread stays
// invisible throughout.
func TestAccessRequestLoop(t *testing.T) {
	ctx := context.Background()
	aliceStore, alicePriv, _ := newNode(t)

	open, openGenesis, err := protolog.NewThreadWith(alicePriv, "q3 payments migration", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	alice, err := protolog.NewAuthor(open, alicePriv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "cutover mid-August"}}); err != nil {
		t.Fatal(err)
	}
	hidden, _, err := protolog.NewThread(alicePriv, "performance reviews", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, open.Entries()); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, hidden.Entries()); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer((&Server{Sync: &syncp.Server{Store: aliceStore}}).Handler())
	defer srv.Close()

	janeStore, janePriv, janePid := newNode(t)
	jt := NewHTTPTransport(srv.URL, janePriv)

	// Discovery shows the discoverable thread's title only — never the hidden one.
	found, err := jt.Discover(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0].ID != openGenesis.ID || found[0].Title != "q3 payments migration" {
		t.Fatalf("discover = %+v", found)
	}

	// Requesting access to the hidden thread is indistinguishable from a miss.
	badReq, err := syncp.BuildAccessRequest(janePriv, hidden.Thread, []string{"read"}, "snooping", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := jt.RequestAccess(ctx, badReq); err == nil {
		t.Fatal("access request against hidden thread accepted")
	}

	// The real request lands and shows up pending in Alice's fold.
	req, err := syncp.BuildAccessRequest(janePriv, openGenesis.ID, []string{"summary", "search"}, "capacity planning", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := jt.RequestAccess(ctx, req); err != nil {
		t.Fatal(err)
	}
	tl, err := aliceStore.Thread(ctx, openGenesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Note: re-fold via perm through sync server path — use Discover+List as proxy,
	// and assert the pending request via the fold used by the CLI.
	pending := foldPending(t, aliceStore, ctx, openGenesis.ID)
	if len(pending) != 1 || pending[0].Principal != janePid || pending[0].Reason != "capacity planning" {
		t.Fatalf("pending = %+v", pending)
	}

	// Before approval Jane still can't pull.
	jane := &syncp.Client{Store: janeStore, Peer: jt, Self: janePid}
	if _, err := jane.SyncThread(ctx, openGenesis.ID); err == nil {
		t.Fatal("pull worked before approval")
	}

	// Alice approves exactly what was asked (grant references the request).
	if _, err := alice.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": janePid, "scopes": pending[0].Scopes, "request": pending[0].EntryID}}); err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, open.Entries()); err != nil {
		t.Fatal(err)
	}
	_ = tl
	if left := foldPending(t, aliceStore, ctx, openGenesis.ID); len(left) != 0 {
		t.Fatalf("request still pending after approval: %+v", left)
	}

	// Jane syncs: summary arrives, and her own request entry replicates back
	// to her (it's in the control lane she can now hold).
	if _, err := jane.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	sums, err := janeStore.Entries(ctx, openGenesis.ID, []protolog.Lane{protolog.LaneSummary})
	if err != nil || len(sums) != 1 {
		t.Fatalf("jane summaries = %d (err %v)", len(sums), err)
	}
	// Hidden thread never appeared anywhere.
	if _, err := janeStore.Thread(ctx, hidden.Thread); err == nil {
		t.Fatal("hidden thread reached jane")
	}
}

func foldPending(t *testing.T, s interface {
	Thread(ctx context.Context, id string) (*protolog.ThreadLog, error)
}, ctx context.Context, id string) []pendingView {
	t.Helper()
	tl, err := s.Thread(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	st := permFold(id, tl)
	var out []pendingView
	for _, r := range st.PendingRequests() {
		out = append(out, pendingView{Principal: r.Principal, Reason: r.Reason, Scopes: r.Scopes, EntryID: r.EntryID})
	}
	return out
}

type pendingView struct {
	Principal, Reason, EntryID string
	Scopes                     []string
}

func permFold(id string, tl *protolog.ThreadLog) *perm.State {
	return perm.Fold(id, tl.Entries())
}
