package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

// TestPortalApproveLoop: a request lands, the portal shows it, a browser
// approve produces the person-signed grant, and the requester then syncs.
// Also: every portal endpoint is token-gated and never peer-signature-gated.
func TestPortalApproveLoop(t *testing.T) {
	ctx := context.Background()
	aliceStore, alicePriv, alicePid := newNode(t)
	open, genesis, err := protolog.NewThreadWith(alicePriv, "roadmap", true, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := aliceStore.AppendEntries(ctx, open.Entries()); err != nil {
		t.Fatal(err)
	}
	token, err := NewPortalToken()
	if err != nil {
		t.Fatal(err)
	}
	mux := (&Server{Sync: &syncp.Server{Store: aliceStore}, Principal: alicePid}).Handler()
	portal := &Portal{Store: aliceStore, Key: alicePriv, Self: alicePid, Token: token}
	portal.Register(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// Jane requests access.
	janeStore, janePriv, janePid := newNode(t)
	jt := NewHTTPTransport(srv.URL, janePriv)
	req, err := syncp.BuildAccessRequest(janePriv, genesis.ID, []string{"summary", "search"}, "planning", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := jt.RequestAccess(ctx, req); err != nil {
		t.Fatal(err)
	}

	// No token → 401 for state and decide. A peer signature is NOT a portal credential.
	for _, path := range []string{"/portal/api/state", "/portal/api/decide"} {
		r, _ := http.NewRequest(http.MethodPost, srv.URL+path, strings.NewReader("{}"))
		if path == "/portal/api/state" {
			r, _ = http.NewRequest(http.MethodGet, srv.URL+path, nil)
		}
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s without token: %d, want 401", path, resp.StatusCode)
		}
	}

	// State shows the pending request.
	r, _ := http.NewRequest(http.MethodGet, srv.URL+"/portal/api/state", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	var state struct {
		Threads []struct {
			ID      string `json:"id"`
			Pending []struct {
				Principal string   `json:"principal"`
				Scopes    []string `json:"scopes"`
			} `json:"pending"`
		} `json:"threads"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if len(state.Threads) != 1 || len(state.Threads[0].Pending) != 1 || state.Threads[0].Pending[0].Principal != janePid {
		t.Fatalf("portal state = %+v", state)
	}

	// Approve from the "browser".
	body, _ := json.Marshal(map[string]any{"thread": genesis.ID, "principal": janePid, "decision": "approve"})
	r, _ = http.NewRequest(http.MethodPost, srv.URL+"/portal/api/decide", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	resp, err = http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("decide: %d", resp.StatusCode)
	}

	// Jane syncs and now holds the control+summary lanes.
	jane := &syncp.Client{Store: janeStore, Peer: jt, Self: janePid}
	if _, err := jane.SyncAll(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := janeStore.Thread(ctx, genesis.ID); err != nil {
		t.Fatal("jane did not receive the thread after portal approval")
	}

	// The portal page itself is served and self-contained.
	pr, err := http.Get(srv.URL + "/portal")
	if err != nil {
		t.Fatal(err)
	}
	page, _ := readAll(pr)
	if !strings.Contains(page, "Lamdis Portal") || !strings.Contains(page, "Approve") {
		t.Fatal("portal page missing expected content")
	}
}

func readAll(r *http.Response) (string, error) {
	defer r.Body.Close()
	var b strings.Builder
	buf := make([]byte, 4096)
	for {
		n, err := r.Body.Read(buf)
		b.Write(buf[:n])
		if err != nil {
			return b.String(), nil
		}
	}
}
