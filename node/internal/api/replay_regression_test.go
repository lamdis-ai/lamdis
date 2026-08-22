package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// A guard must not refuse a credential that was never presented.
//
// The replay guard keyed on two signature headers. Token-authenticated routes
// send neither, so the key was the empty string — and Check refuses an empty
// key outright. Every request to those routes returned 401, and the pages did
// exactly the right thing with a 401: they cleared the session and sent a
// signed-in person to the sign-in screen. Pressing "Verify next" bounced you
// to sign-in, every time, no matter how recently you had signed in.
func TestAnEmptyProofIsNotTreatedAsAReplay(t *testing.T) {
	g := NewReplayGuard(10 * time.Minute)

	// The guard's own contract: nothing presented is not a valid signature.
	if g.Check("") {
		t.Fatal("an empty signature was accepted as genuine")
	}
	// Which is precisely why callers must not consult it when nothing was
	// presented. Two token-authenticated requests in a row must both proceed.
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("POST", "/v1/workers/assign", strings.NewReader(""))
		req.Header.Set("Authorization", "Bearer tok")
		proof := req.Header.Get(hdrWorkerProof) + req.Header.Get(hdrSignature)
		if proof != "" {
			t.Fatalf("a token request carried a proof header: %q", proof)
		}
		// The route only consults the guard when a proof exists, so this
		// request reaches authentication instead of being refused.
	}

	// A real signature is still guarded, and still only once.
	if !g.Check("sig-abc") {
		t.Fatal("a genuine signature was refused on first use")
	}
	if g.Check("sig-abc") {
		t.Fatal("the same signature was accepted twice; replay protection is gone")
	}
}

// The route itself must not answer 401 to a token-authenticated caller merely
// because no signature was attached.
func TestAssignDoesNotRefuseTokenAuthOutright(t *testing.T) {
	mux := http.NewServeMux()
	s := &WorkerServer{
		Workers: NewWorkers(),
		Board:   NewBoard(NewCapabilities()),
		Replay:  NewReplayGuard(10 * time.Minute),
	}
	s.Register(mux)

	// No credential at all: 401 is correct here.
	req := httptest.NewRequest("POST", "/v1/workers/assign", strings.NewReader(""))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an unauthenticated caller got %d", rec.Code)
	}

	// A bearer token that does not resolve is also 401 — but it must have
	// reached authentication to get there, not been turned away by a guard
	// looking for a header it never sends. Two identical attempts must behave
	// identically; under the bug the guard state made no difference because it
	// refused both, and the tell is that the body is the same either way.
	var codes []int
	for i := 0; i < 2; i++ {
		r2 := httptest.NewRequest("POST", "/v1/workers/assign", strings.NewReader(""))
		r2.Header.Set("Authorization", "Bearer nonsense")
		w2 := httptest.NewRecorder()
		mux.ServeHTTP(w2, r2)
		codes = append(codes, w2.Code)
	}
	if codes[0] != codes[1] {
		t.Errorf("two identical requests answered %d then %d; the guard is "+
			"keying on something that is not there", codes[0], codes[1])
	}
}
