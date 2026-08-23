package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// A worker is a person who does work, across jobs and across sessions.
//
// Until now the only durable thing about a worker was their IP address, which
// is not an identity: it stops a careless script and nobody with a proxy. Every
// rule that matters — one seat per panel, do not judge your own work, how much
// may be in flight — is only as good as the thing it keys on.
//
// There are two grades of worker, and the difference is visible everywhere
// downstream. An enrolled worker holds an Ed25519 key their browser generated
// and cannot export; they are a principal, their submissions carry their own
// signature, and they can be paid. An anonymous worker holds a bearer secret;
// they can do work and see it counted, and money does not move against them.
// The upgrade is offered, never forced, because a person standing in a street
// with an old phone should still be able to take a job.
type Worker struct {
	// ID is a principal id for an enrolled worker, or an opaque handle for an
	// anonymous one. The prefix is what distinguishes them, and it is never
	// hidden: a caller can always tell which kind of worker they are looking at.
	ID string `json:"id"`
	// Enrolled means this worker holds a device key and their evidence carries
	// their own signature.
	Enrolled bool `json:"enrolled"`
	// Verified means a hosted identity provider vouched for an address they
	// control. This is what gates payment.
	Verified bool      `json:"verified"`
	Email    string    `json:"-"`
	Created  time.Time `json:"created"`
	Seen     time.Time `json:"seen"`
}

// AnonPrefix marks a worker who has not bound a key.
const AnonPrefix = "anon:"

// Attestation reports how strongly this worker's submissions are bound to them.
//
// This is about the evidence, not the account: it says whether a submission
// carries a signature the worker themselves produced, which is what lets a
// stranger check the trail offline. An account cannot supply that — a hosted
// token proves who was present at sign-in, expires in an hour, and needs the
// issuer reachable to check. The two answer different questions and both are
// kept.
func (w *Worker) Attestation() string {
	if w != nil && w.Enrolled {
		return "device_key"
	}
	return "capability"
}

// Payable reports whether money may leave against this worker.
//
// A verified account is the bar, not a device key. The key proves the evidence
// came from this browser; the account is the thing that costs something to
// obtain again and that a payment rail can eventually attach a real identity
// to. Requiring the key here would mean an enrolled guest could be paid while
// a verified person on an old phone could not, which is exactly backwards.
func (w *Worker) Payable() bool {
	return w != nil && w.Verified
}

// Workers is the registry.
type Workers struct {
	// Cognito verifies hosted identities. When it is enabled, a verified
	// account is what makes a worker payable; the guest tier still exists and
	// still works, it just cannot receive money.
	Cognito *Cognito

	mu       sync.Mutex
	byID     map[string]*Worker
	byHolder map[string]string // sha256(secret) -> worker id
	secrets  map[string]string // worker id -> secret, for HMAC verification
	Now      func() time.Time
}

func NewWorkers() *Workers {
	return &Workers{
		byID: map[string]*Worker{}, byHolder: map[string]string{},
		secrets: map[string]string{}, Now: time.Now,
	}
}

func (ws *Workers) now() time.Time {
	if ws.Now != nil {
		return ws.Now()
	}
	return time.Now()
}

// Enroll binds a device key.
//
// The caller must already have signed this request with the key they are
// enrolling, which is what makes it proof of possession rather than a claim.
// That check happens in the handler, because it is the same signature check
// every other principal-authenticated route performs.
func (ws *Workers) Enroll(principal string) (*Worker, error) {
	if _, err := protolog.PublicKey(principal); err != nil {
		return nil, fmt.Errorf("worker: that is not a usable principal id")
	}
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if w, ok := ws.byID[principal]; ok {
		w.Seen = ws.now()
		return w, nil
	}
	w := &Worker{ID: principal, Enrolled: true, Created: ws.now(), Seen: ws.now()}
	ws.byID[principal] = w
	return w, nil
}

// upsertVerified records a worker the identity provider vouched for.
//
// The id is derived from the provider's subject rather than the email, because
// an address can be changed and a subject cannot. Keying on email would let
// somebody shed a history of bad work by editing their profile.
func (ws *Workers) upsertVerified(c *Claims) *Worker {
	id := "cognito:" + c.Subject
	ws.mu.Lock()
	defer ws.mu.Unlock()
	w, ok := ws.byID[id]
	if !ok {
		w = &Worker{ID: id, Created: ws.now()}
		ws.byID[id] = w
	}
	w.Verified = c.EmailVerified
	w.Email = c.Email
	w.Seen = ws.now()
	return w
}

// Get returns a worker by id.
func (ws *Workers) Get(id string) (*Worker, bool) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	w, ok := ws.byID[id]
	return w, ok
}

// Authenticate resolves the worker behind a request.
//
// An enrolled worker signs with their key, exactly as any other principal
// does. An anonymous worker presents their bearer secret over the same signing
// input, so both paths bind method, path, time and body identically and the
// weaker one is weaker only in what it proves about who is holding it.
func (ws *Workers) Authenticate(r *http.Request, body []byte, now time.Time) (*Worker, error) {
	// A hosted identity token, if one was presented. This is the strongest
	// statement about who is asking, so it is checked first.
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") && ws.Cognito.Enabled() {
		claims, err := ws.Cognito.Verify(strings.TrimPrefix(auth, "Bearer "))
		if err != nil {
			return nil, ErrNoWorker
		}
		return ws.upsertVerified(claims), nil
	}
	if r.Header.Get(hdrPrincipal) != "" {
		pid, err := authenticate(r, body, now)
		if err != nil {
			return nil, ErrNoWorker
		}
		ws.mu.Lock()
		w, ok := ws.byID[pid]
		if ok {
			w.Seen = ws.now()
		}
		ws.mu.Unlock()
		if !ok {
			return nil, ErrNoWorker
		}
		return w, nil
	}

	return nil, ErrNoWorker
}

// ErrNoWorker is the single answer to every authentication failure.
var ErrNoWorker = fmt.Errorf("worker: unauthorized")

const (
	hdrWorker      = "X-Lamdis-Worker"
	hdrWorkerProof = "X-Lamdis-Worker-Proof"
)

// WorkerServer exposes enrolment and assignment.
type WorkerServer struct {
	Workers *Workers
	Board   *Board
	Replay  *ReplayGuard
	Now     func() time.Time
}

func (s *WorkerServer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *WorkerServer) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/workers", s.handleRegister)
	mux.HandleFunc("POST /v1/workers/assign", s.handleAssign)
	mux.HandleFunc("POST /v1/workers/claim/{job}", s.handleClaimTask)
	mux.HandleFunc("POST /v1/workers/bid/{job}", s.handleBid)
	mux.HandleFunc("GET /v1/workers/holdings", s.handleHoldings)
	mux.HandleFunc("POST /v1/workers/giveback/{job}", s.handleGiveBack)
	// The supply side's view of multi-part work. See scope_api.go.
	s.registerScope(mux)
}

// handleRegister creates or returns a worker.
//
// Three ways in, strongest first. A hosted identity token makes a verified
// worker who can be paid. A signed request enrolls a device key, whose
// signature is itself the proof of possession. Anything else gets a guest.
func (s *WorkerServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") &&
		s.Workers.Cognito.Enabled() {
		claims, err := s.Workers.Cognito.Verify(strings.TrimPrefix(auth, "Bearer "))
		if err != nil {
			refuse(w)
			return
		}
		worker := s.Workers.upsertVerified(claims)
		writeWork(w, http.StatusOK, map[string]any{
			"worker": worker.ID, "verified": worker.Verified,
			"enrolled": worker.Enrolled, "payable": worker.Payable(),
		})
		return
	}
	if pid := r.Header.Get(hdrPrincipal); pid != "" {
		got, err := authenticate(r, body, s.now())
		if err != nil || got != pid {
			refuse(w)
			return
		}
		worker, err := s.Workers.Enroll(got)
		if err != nil {
			writeWork(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeWork(w, http.StatusOK, map[string]any{
			"worker": worker.ID, "enrolled": true,
			"verified": worker.Verified, "payable": worker.Payable(),
		})
		return
	}

	// No guest tier. Everything past this point keys on identity, and an
	// identity anybody can mint for free bounds nothing.
	writeWork(w, http.StatusUnauthorized, map[string]any{
		"error":  "sign in to take work",
		"signin": "/signin",
	})
}

func (s *WorkerServer) handleAssign(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	// Only signed requests have something replayable to guard.
	//
	// This route authenticates with a bearer token, so both headers are empty
	// and the key was the empty string — which Check refuses outright. Every
	// press of "Verify next" therefore returned 401, and the page did the
	// right thing with a 401 and sent a perfectly signed-in person to the
	// sign-in screen. Guarding a credential that is not present cannot make
	// anything safer; it only refuses everybody.
	if proof := r.Header.Get(hdrWorkerProof) + r.Header.Get(hdrSignature); proof != "" {
		if s.Replay != nil && !s.Replay.Check(proof) {
			refuse(w)
			return
		}
	}
	worker, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil {
		refuse(w)
		return
	}
	secret, l, err := s.Board.AssignReview(worker.ID)
	if err != nil {
		writeWork(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{
		"job": l.Job, "kind": l.Kind, "url": "/r/" + l.Job + "#" + secret,
		"pay_minor": l.PayMinor, "currency": l.Currency,
		"payable": worker.Enrolled,
	})
}

// handleClaimTask takes a task the worker chose.
func (s *WorkerServer) handleClaimTask(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	worker, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil {
		refuse(w)
		return
	}
	secret, l, err := s.Board.Claim(r.PathValue("job"), worker.ID)
	if err != nil {
		writeWork(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{
		"job": l.Job, "kind": l.Kind, "url": "/w/" + l.Job + "#" + secret,
		"payable": worker.Payable(),
	})
}

// handleBid places or revises an offer on an open job.
//
// The worker is told nothing about what the buyer would pay. They are quoting
// their own price for their own work, which is the only thing that makes an
// auction worth running: a visible ceiling is a ceiling every bid lands on.
func (s *WorkerServer) handleBid(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	worker, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil {
		refuse(w)
		return
	}
	var in struct {
		AmountMinor int64  `json:"amount_minor"`
		Note        string `json:"note,omitempty"`
		// AvailableFrom is when they could start, as a date.
		AvailableFrom string `json:"available_from,omitempty"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		writeWork(w, http.StatusBadRequest, map[string]string{"error": "malformed request"})
		return
	}
	if in.AmountMinor <= 0 {
		writeWork(w, http.StatusBadRequest,
			map[string]string{"error": "say what you would charge"})
		return
	}
	var from time.Time
	if in.AvailableFrom != "" {
		from, _ = time.Parse("2006-01-02", in.AvailableFrom)
	}
	bid, err := s.Board.PlaceBid(r.PathValue("job"), worker.ID,
		in.AmountMinor, "", in.Note, from)
	if err != nil {
		writeWork(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{
		"placed": true, "amount_minor": bid.AmountMinor, "currency": bid.Currency,
		"note":    "you will hear if it is accepted; you can revise it until bidding closes",
		"payable": worker.Payable(),
	})
}

// handleHoldings lists work this person is holding, with a way back into it.
func (s *WorkerServer) handleHoldings(w http.ResponseWriter, r *http.Request) {
	body, _ := readBody(r)
	worker, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil {
		refuse(w)
		return
	}
	held := s.Board.HeldBy(worker.ID)
	_, _, allowance, _ := s.Board.Standing(worker.ID)
	writeWork(w, http.StatusOK, map[string]any{
		"holding": held, "allowance": allowance,
	})
}

// handleGiveBack returns a seat the worker does not want after all.
func (s *WorkerServer) handleGiveBack(w http.ResponseWriter, r *http.Request) {
	body, _ := readBody(r)
	worker, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil {
		refuse(w)
		return
	}
	if err := s.Board.GiveBack(r.PathValue("job"), worker.ID); err != nil {
		writeWork(w, http.StatusConflict, map[string]string{"error": err.Error()})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{
		"released": true,
		"note":     "back on the board for somebody else; no mark against you",
	})
}

// MyBid returns this worker's own offer, and nobody else's. Publishing the
// others would let a bidder undercut by a penny, which is an auction for the
// fastest poller rather than the best offer.
func (s *WorkerServer) MyBid(job, worker string) *Bid {
	for _, b := range s.Board.Bids(job) {
		if b.Worker == worker {
			return b
		}
	}
	return nil
}

var _ = json.Marshal
