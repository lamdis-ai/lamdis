package exchange

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The one property that makes a shared endpoint safe: the credential comes
// from the request, never from the server.
//
// Getting this wrong looks almost identical in code — one Exchange built at
// startup instead of one per request — and the consequence is that every
// caller spends whoever's key the server happened to hold.
func TestEachCallerGetsTheirOwnCredential(t *testing.T) {
	s := &Server{BaseURL: "https://exchange.example"}

	for _, tc := range []struct{ header, value, want string }{
		{"Authorization", "Bearer lam_alice", "lam_alice"},
		{"Authorization", "bearer lam_bob", "lam_bob"},
		{"X-Lamdis-Key", "lam_carol", "lam_carol"},
		{"Authorization", "  Bearer   lam_dave  ", "lam_dave"},
	} {
		r := httptest.NewRequest("POST", "/mcp", nil)
		r.Header.Set(tc.header, tc.value)
		if got := agentKeyFrom(r); got != tc.want {
			t.Errorf("%s: %q -> %q, want %q", tc.header, tc.value, got, tc.want)
		}
	}

	// Two requests, two different keys, two different servers.
	a := httptest.NewRequest("POST", "/mcp", nil)
	a.Header.Set("Authorization", "Bearer lam_alice")
	b := httptest.NewRequest("POST", "/mcp", nil)
	b.Header.Set("Authorization", "Bearer lam_bob")
	if s.mcpServerFor(a) == s.mcpServerFor(b) {
		t.Fatal("two callers were handed the same server instance")
	}
}

// An unauthenticated caller is refused, and told what to do about it.
func TestTheEndpointRefusesWithoutAKey(t *testing.T) {
	s := &Server{BaseURL: "https://exchange.example"}
	h := s.requireAgentKey(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("an unauthenticated request reached the tools")
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/mcp", nil))

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", w.Code)
	}
	if !strings.Contains(w.Header().Get("WWW-Authenticate"), "Bearer") {
		t.Error("no WWW-Authenticate, so a client cannot prompt for a credential")
	}
	body := w.Body.String()
	// A refusal with no next step wastes the one moment somebody was willing
	// to spend finding out whether this was worth it.
	for _, want := range []string{"agent key", "/console", "claude mcp add"} {
		if !strings.Contains(body, want) {
			t.Errorf("the refusal does not mention %q: %s", want, body)
		}
	}
}

// The documented one-liner has to be the one that actually works.
func TestTheAdvertisedCommandMatchesTheRoute(t *testing.T) {
	s := &Server{BaseURL: "https://exchange.lamdis.ai"}
	h := s.requireAgentKey(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", mcpPath, nil))
	if !strings.Contains(w.Body.String(), "https://exchange.lamdis.ai"+mcpPath) {
		t.Errorf("the example command does not point at %s: %s", mcpPath, w.Body.String())
	}
}
