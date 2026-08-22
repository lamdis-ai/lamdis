package api

import (
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) (*ReviewServer, *http.ServeMux, string, string) {
	t.Helper()
	caps := NewCapabilities()
	secret, cap, err := caps.Issue("job-1", "Review a photo",
		[]string{ActionView, ActionReview}, time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	reviews := NewReviewStore()
	reviews.Add(&ReviewPanel{
		Job: "job-1", Parent: "parent-1",
		Question:    "Is a pig visible indoors?",
		Context:     "The automated check could not tell.",
		EvidenceSHA: []string{strings.Repeat("a", 64)},
		Reviewers:   3, Agreement: 2,
		FeeMinor: 150, BonusMinor: 100, Currency: "USD",
		Expires: time.Now().Add(time.Hour),
	})
	s := &ReviewServer{
		Caps: caps, Reviews: reviews, Replay: NewReplayGuard(10 * time.Minute),
		Secrets: func(job string) []string {
			if job == "job-1" {
				return []string{secret}
			}
			return nil
		},
		Blob: func(sha string) ([]byte, string, bool) {
			return []byte("not-really-a-jpeg"), "image/jpeg", true
		},
	}
	mux := http.NewServeMux()
	s.Register(mux)
	_ = cap
	return s, mux, secret, "job-1"
}

// capRequest builds a capability-authenticated request.
func capRequest(t *testing.T, method, path, job, secret string, body any) *http.Request {
	t.Helper()
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	SignCapabilityRequest(req, job, secret, raw, time.Now())
	return req
}

func TestCapabilityCanDoItsOneJob(t *testing.T) {
	_, mux, secret, job := testServer(t)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, capRequest(t, "GET", "/v1/claims/"+job, job, secret, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("reading the brief failed: %d %s", w.Code, w.Body.String())
	}
	var brief map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &brief); err != nil {
		t.Fatalf("brief is not JSON: %v", err)
	}
	if brief["question"] != "Is a pig visible indoors?" {
		t.Errorf("brief = %v", brief)
	}

	w = httptest.NewRecorder()
	mux.ServeHTTP(w, capRequest(t, "POST", "/v1/claims/"+job+"/review", job, secret,
		map[string]any{"finding": true, "confident": true,
			"reason": "The pig is clearly visible in the foreground on a wooden floor."}))
	if w.Code != http.StatusOK {
		t.Fatalf("submitting a review failed: %d %s", w.Code, w.Body.String())
	}
}

// TestCapabilityCannotReachPrincipalRoutes is the structural guarantee, and it
// is tested on a mux that actually carries both surfaces.
//
// Mounting the principal routes here matters: if the review server were the
// only thing registered, the test would pass because those paths simply do not
// exist, which proves nothing about a real deployment where they do.
func TestCapabilityCannotReachPrincipalRoutes(t *testing.T) {
	_, mux, secret, job := testServer(t)

	// Mount the principal-authenticated surface alongside, behind the real
	// Ed25519 middleware. Using the genuine middleware is the point: a
	// stand-in that skipped authentication would measure nothing.
	principal := &Server{Now: time.Now}
	reached := func(w http.ResponseWriter, r *http.Request, pid string, body []byte) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"reached":true}`))
	}
	for _, route := range []string{
		"POST /v1/outcomes", "GET /v1/outcomes/{id}", "POST /v1/outcomes/{id}/cancel",
		"POST /v1/sync/pull", "POST /v1/sync/push",
		"PUT /v1/providers/me/payout", "POST /v1/providers", "GET /v1/mandates",
	} {
		mux.HandleFunc(route, principal.withAuth(reached))
	}

	// Every route a capability must NOT be able to reach. These are the shapes
	// the exchange's principal-authenticated surface uses.
	forbidden := []struct{ method, path string }{
		{"POST", "/v1/outcomes"},
		{"GET", "/v1/outcomes/abc"},
		{"POST", "/v1/outcomes/abc/cancel"},
		{"POST", "/v1/sync/pull"},
		{"POST", "/v1/sync/push"},
		{"PUT", "/v1/providers/me/payout"},
		{"POST", "/v1/providers"},
		{"GET", "/v1/mandates"},
	}
	for _, f := range forbidden {
		t.Run(f.method+" "+f.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, capRequest(t, f.method, f.path, job, secret, nil))
			if w.Code == http.StatusOK && strings.Contains(w.Body.String(), "reached") {
				t.Fatalf("a capability reached the principal handler at %s %s", f.method, f.path)
			}
		})
	}
}

func TestCapabilityForAnotherJobIsRefused(t *testing.T) {
	_, mux, secret, job := testServer(t)
	w := httptest.NewRecorder()
	// Correct secret, wrong job in the path.
	mux.ServeHTTP(w, capRequest(t, "GET", "/v1/claims/job-2", job, secret, nil))
	if w.Code == http.StatusOK {
		t.Fatal("a capability for job-1 was accepted on job-2")
	}
}

func TestProofIsBoundToTheEndpoint(t *testing.T) {
	_, mux, secret, job := testServer(t)

	// Sign for the brief, then present the same proof at the review endpoint.
	req := capRequest(t, "GET", "/v1/claims/"+job, job, secret, nil)
	stolen := req.Header.Get(hdrCapability)
	ts := req.Header.Get(hdrTimestamp)

	replay := httptest.NewRequest("POST", "/v1/claims/"+job+"/review",
		strings.NewReader(`{"finding":true,"confident":true,"reason":"aaaaaaaaaa"}`))
	replay.Header.Set(hdrCapability, stolen)
	replay.Header.Set(hdrTimestamp, ts)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, replay)
	if w.Code == http.StatusOK {
		t.Fatal("a proof signed for one endpoint was accepted at another")
	}
}

func TestReplayedCapabilityRequestIsRefused(t *testing.T) {
	_, mux, secret, job := testServer(t)
	req := capRequest(t, "POST", "/v1/claims/"+job+"/review", job, secret,
		map[string]any{"finding": true, "confident": true,
			"reason": "A pig is standing on the hallway floor."})
	body, _ := json.Marshal(map[string]any{"finding": true, "confident": true,
		"reason": "A pig is standing on the hallway floor."})

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first submission failed: %d %s", w.Code, w.Body.String())
	}

	// Capture and replay the identical request.
	replay := httptest.NewRequest("POST", "/v1/claims/"+job+"/review", bytes.NewReader(body))
	replay.Header.Set(hdrCapability, req.Header.Get(hdrCapability))
	replay.Header.Set(hdrTimestamp, req.Header.Get(hdrTimestamp))
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, replay)
	if w.Code == http.StatusOK {
		t.Fatal("a captured review submission was accepted a second time")
	}
}

func TestExpiredCapabilityIsRefused(t *testing.T) {
	caps := NewCapabilities()
	now := time.Now()
	caps.Now = func() time.Time { return now }
	secret, _, err := caps.Issue("job-1", "x", []string{ActionView}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Minute)
	if _, ok := caps.Lookup(secret); ok {
		t.Fatal("an expired capability still resolves")
	}
}

func TestEnrollmentIsOneTime(t *testing.T) {
	caps := NewCapabilities()
	secret, _, err := caps.Issue("job-1", "x", []string{ActionView}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(nil)
	_ = pub
	if err := caps.Enroll(secret, "ed25519:DEVICE"); err != nil {
		t.Fatalf("first enrollment should succeed: %v", err)
	}
	if err := caps.Enroll(secret, "ed25519:ANOTHER"); err == nil {
		t.Fatal("a second device claimed the same link")
	}
	c, _ := caps.Lookup(secret)
	if c.Attestation() != "device_key" {
		t.Errorf("after enrollment submissions should be device-attested, got %s", c.Attestation())
	}
}

// TestCapabilityCannotActBeyondItsActions: a view-only link must not be able
// to submit a review.
func TestCapabilityCannotActBeyondItsActions(t *testing.T) {
	caps := NewCapabilities()
	secret, _, err := caps.Issue("job-1", "x", []string{ActionView}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	reviews := NewReviewStore()
	reviews.Add(&ReviewPanel{Job: "job-1", Reviewers: 3, Agreement: 2,
		Expires: time.Now().Add(time.Hour)})
	s := &ReviewServer{
		Caps: caps, Reviews: reviews, Replay: NewReplayGuard(time.Minute),
		Secrets: func(string) []string { return []string{secret} },
	}
	mux := http.NewServeMux()
	s.Register(mux)

	w := httptest.NewRecorder()
	mux.ServeHTTP(w, capRequest(t, "POST", "/v1/claims/job-1/review", "job-1", secret,
		map[string]any{"finding": true, "confident": true, "reason": "aaaaaaaaaaaa"}))
	if w.Code == http.StatusOK {
		t.Fatal("a view-only capability submitted a review")
	}
}

func TestEvidenceOutsideThePanelIsRefused(t *testing.T) {
	_, mux, secret, job := testServer(t)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, capRequest(t, "GET",
		"/v1/claims/"+job+"/evidence/"+strings.Repeat("b", 64), job, secret, nil))
	if w.Code == http.StatusOK {
		t.Fatal("a capability fetched an artifact that is not part of its panel")
	}
}

func TestEvidenceIsServedWithHardeningHeaders(t *testing.T) {
	_, mux, secret, job := testServer(t)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, capRequest(t, "GET",
		"/v1/claims/"+job+"/evidence/"+strings.Repeat("a", 64), job, secret, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("permitted evidence was refused: %d", w.Code)
	}
	for header, want := range map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
	} {
		if got := w.Header().Get(header); got != want {
			t.Errorf("%s = %q, want %q — a hostile upload could execute in our origin", header, got, want)
		}
	}
}

// TestRefusalsAreIndistinguishable: an error must not tell a prober which part
// they got wrong, matching the node's existing no-oracle discipline.
func TestRefusalsAreIndistinguishable(t *testing.T) {
	_, mux, secret, job := testServer(t)
	var bodies []string
	for _, req := range []*http.Request{
		capRequest(t, "GET", "/v1/claims/job-nonexistent", "job-nonexistent", secret, nil),
		capRequest(t, "GET", "/v1/claims/"+job, job, "WRONGSECRET", nil),
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code == http.StatusOK {
			t.Fatal("a bad request was accepted")
		}
		bodies = append(bodies, w.Body.String())
	}
	if bodies[0] != bodies[1] {
		t.Errorf("refusals differ and leak which part was wrong:\n  %q\n  %q", bodies[0], bodies[1])
	}
}

func TestPageNeverReceivesTheSecret(t *testing.T) {
	_, mux, _, job := testServer(t)
	// The page is fetched without any credential: the secret is in the
	// fragment, which the browser does not transmit.
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/r/"+job, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("the review page should load unauthenticated: %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "location.hash") {
		t.Error("the page does not read its secret from the fragment")
	}
	if !strings.Contains(w.Body.String(), "history.replaceState") {
		t.Error("the page does not erase the secret from the address bar")
	}
}
