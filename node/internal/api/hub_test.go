package api

import (
	"context"
	"net/http/httptest"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

// TestHubRelay is the EC2 rendezvous scenario: Sterling and Jane never
// connect to each other — both talk only to a hub node. The thread, the
// access request, the approval, the summary, and Jane's contribution all
// relay through, and the hub enforces every grant while doing it.
func TestHubRelay(t *testing.T) {
	ctx := context.Background()

	hubStore, _, _ := newNode(t)
	hub := httptest.NewServer((&Server{Sync: &syncp.Server{Store: hubStore}}).Handler())
	defer hub.Close()

	// Sterling: local thread with raw + summary, shared onto the hub.
	sStore, sPriv, sPid := newNode(t)
	tl, genesis, err := protolog.NewThreadWith(sPriv, "q3 payments migration", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	sterling, err := protolog.NewAuthor(tl, sPriv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sterling.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": secretText}}); err != nil {
		t.Fatal(err)
	}
	if _, err := sterling.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "on track, cutover mid-August"}}); err != nil {
		t.Fatal(err)
	}
	if err := sStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	sClient := &syncp.Client{Store: sStore, Peer: NewHTTPTransport(hub.URL, sPriv), Self: sPid}
	if n, err := sClient.ShareThread(ctx, genesis.ID); err != nil || n == 0 {
		t.Fatalf("share: n=%d err=%v", n, err)
	}

	// A stranger cannot seed someone else's thread id, and cannot push a
	// forged genesis claiming a thread they didn't author.
	_, mPriv, _ := newNode(t)
	mt := NewHTTPTransport(hub.URL, mPriv)
	if _, err := mt.Push(ctx, syncp.PushRequest{Thread: genesis.ID, Entries: tl.Entries()}); err == nil {
		t.Fatal("stranger pushed someone else's chains")
	}

	// Jane: discovers via the hub, requests, waits.
	jStore, jPriv, jPid := newNode(t)
	jt := NewHTTPTransport(hub.URL, jPriv)
	found, err := jt.Discover(ctx)
	if err != nil || len(found) != 1 {
		t.Fatalf("discover via hub: %+v err=%v", found, err)
	}
	req, err := syncp.BuildAccessRequest(jPriv, genesis.ID, []string{"summary", "search", "contribute"}, "capacity planning", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := jt.RequestAccess(ctx, req); err != nil {
		t.Fatal(err)
	}

	// Sterling syncs against the hub: the request rides back to his node.
	if _, err := sClient.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	spending := foldPending(t, sStore, ctx, genesis.ID)
	if len(spending) != 1 || spending[0].Principal != jPid {
		t.Fatalf("request did not relay to sterling: %+v", spending)
	}

	// He approves locally; his next sync carries the grant to the hub.
	if _, err := sterling.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": jPid, "scopes": spending[0].Scopes, "request": spending[0].EntryID}}); err != nil {
		t.Fatal(err)
	}
	if err := sStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	if _, err := sClient.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}

	// Jane syncs against the hub: summary arrives, raw content does not.
	jane := &syncp.Client{Store: jStore, Peer: jt, Self: jPid}
	if _, err := jane.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	jtl, err := jStore.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range jtl.Entries() {
		if e.Lane == protolog.LaneContent {
			t.Fatalf("content leaked to summary-scoped jane via hub: %s", e.ID)
		}
	}

	// Jane contributes through the hub; Sterling receives it on his next sync.
	ja, err := protolog.NewAuthor(jtl, jPriv)
	if err != nil {
		t.Fatal(err)
	}
	reply, err := ja.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Body: map[string]any{"text": "LA can absorb the cutover week"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := jStore.AppendEntries(ctx, []*protolog.Entry{reply}); err != nil {
		t.Fatal(err)
	}
	if _, err := jane.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := sClient.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	stl, _ := sStore.Thread(ctx, genesis.ID)
	if stl.Get(reply.ID) == nil {
		t.Fatal("jane's contribution did not relay to sterling via the hub")
	}

	// Revocation relays too: sterling revokes, syncs; jane's next pull dries up.
	if _, err := sterling.Append(protolog.Draft{Kind: protolog.KindRevoke, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": jPid}}); err != nil {
		t.Fatal(err)
	}
	if err := sStore.AppendEntries(ctx, tl.Entries()); err != nil {
		t.Fatal(err)
	}
	if _, err := sClient.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	if ids, _ := jt.List(ctx); len(ids) != 0 {
		t.Fatalf("revoked jane still sees threads on the hub: %v", ids)
	}
}
