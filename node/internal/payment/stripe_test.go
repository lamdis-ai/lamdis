package payment

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// fakeStripe records what the adapter sent and replies with canned objects.
type fakeStripe struct {
	t     *testing.T
	calls []recorded
	reply map[string]string // path suffix -> JSON body
	fail  map[string]int    // path suffix -> status to return
}

type recorded struct {
	Method string
	Path   string
	Key    string
	Form   url.Values
}

func newFake(t *testing.T) (*fakeStripe, *Stripe) {
	f := &fakeStripe{t: t, reply: map[string]string{}, fail: map[string]int{}}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	s := &Stripe{
		Secret: "sk_test_fake", Keys: NewMemoryKeys(),
		HTTP: srv.Client(), Base: srv.URL,
		Now: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}
	return f, s
}

func (f *fakeStripe) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	_ = r.ParseForm()
	f.calls = append(f.calls, recorded{
		Method: r.Method, Path: r.URL.Path,
		Key: r.Header.Get("Idempotency-Key"), Form: r.PostForm,
	})
	for suffix, code := range f.fail {
		if strings.Contains(r.URL.Path, suffix) {
			w.WriteHeader(code)
			w.Write([]byte(`{"error":{"message":"nope","type":"invalid_request_error"}}`))
			return
		}
	}
	for suffix, body := range f.reply {
		if strings.Contains(r.URL.Path, suffix) {
			w.Write([]byte(body))
			return
		}
	}
	w.Write([]byte(`{"id":"obj_x","status":"succeeded"}`))
}

func (f *fakeStripe) find(t *testing.T, pathPart string) recorded {
	t.Helper()
	for _, c := range f.calls {
		if strings.Contains(c.Path, pathPart) {
			return c
		}
	}
	t.Fatalf("no call to %s; saw %v", pathPart, f.paths())
	return recorded{}
}

func (f *fakeStripe) paths() []string {
	var out []string
	for _, c := range f.calls {
		out = append(out, c.Method+" "+c.Path)
	}
	return out
}

// A live key must not be usable by accident. This is the same reflex as the
// budget guard: the mistake it prevents cannot be undone by noticing it later.
func TestLiveKeyRefusedUnlessAsked(t *testing.T) {
	s := &Stripe{Secret: "sk_live_abc"}
	if err := s.checkKey(); err == nil {
		t.Fatal("a live key was accepted without LAMDIS_STRIPE_ALLOW_LIVE")
	}
	s.AllowLive = true
	if err := s.checkKey(); err != nil {
		t.Fatalf("live key refused even when explicitly allowed: %v", err)
	}
	if err := (&Stripe{Secret: "not-a-key"}).checkKey(); err == nil {
		t.Fatal("a malformed key was accepted")
	}
}

// A hold must authorize without charging. If capture_method is ever anything
// but manual, the buyer is billed the maximum payout the moment they accept.
func TestHoldAuthorizesWithoutCharging(t *testing.T) {
	f, s := newFake(t)
	f.reply["/payment_intents"] = `{"id":"pi_1","status":"requires_capture"}`

	res, err := s.Hold(context.Background(), Request{
		Key: "k-hold", Outcome: "th_1", AmountMinor: 500,
		Currency: "USD", Source: "pm_card_visa",
	})
	if err != nil {
		t.Fatalf("hold: %v", err)
	}
	if res.State != StateSucceeded || res.Ref != "pi_1" {
		t.Fatalf("unexpected hold result %+v", res)
	}
	c := f.find(t, "/payment_intents")
	if got := c.Form.Get("capture_method"); got != "manual" {
		t.Fatalf("capture_method = %q, want manual — the buyer would be charged up front", got)
	}
	if got := c.Form.Get("amount"); got != "500" {
		t.Fatalf("authorized %q, want 500", got)
	}
	if c.Key != "k-hold" {
		t.Fatalf("idempotency key %q not sent", c.Key)
	}
	if c.Form.Get("transfer_group") != "th_1" {
		t.Fatal("transfer_group missing; the settlement could not be tied to the charge")
	}
}

// Capture is two rail movements. They must not share an idempotency key, or
// Stripe replays the capture's response for the transfer and reports money as
// moved that never moved.
func TestCaptureUsesDistinctKeysForCaptureAndTransfer(t *testing.T) {
	f, s := newFake(t)
	f.reply["/capture"] = `{"id":"pi_1","status":"succeeded","latest_charge":"ch_1"}`
	f.reply["/transfers"] = `{"id":"tr_1","status":"succeeded"}`

	if _, err := s.Capture(context.Background(), Request{
		Key: "k-settle", Outcome: "th_1", HoldRef: "pi_1",
		AmountMinor: 150, FeeMinor: 3, Currency: "USD", Destination: "acct_prov",
	}); err != nil {
		t.Fatalf("capture: %v", err)
	}

	cap := f.find(t, "/capture")
	tr := f.find(t, "/transfers")
	if cap.Key == "" || tr.Key == "" {
		t.Fatal("an operation went out with no idempotency key")
	}
	if cap.Key == tr.Key {
		t.Fatalf("capture and transfer shared key %q; the transfer would be deduped away", cap.Key)
	}
	if got := cap.Form.Get("amount_to_capture"); got != "150" {
		t.Fatalf("captured %q, want 150", got)
	}
	// The provider receives the gross less the exchange's cut, not the gross.
	if got := tr.Form.Get("amount"); got != "147" {
		t.Fatalf("transferred %q, want 147 (150 gross - 3 fee)", got)
	}
	if got := tr.Form.Get("destination"); got != "acct_prov" {
		t.Fatalf("transfer destination %q", got)
	}
	if got := tr.Form.Get("source_transaction"); got != "ch_1" {
		t.Fatalf("source_transaction %q; the transfer would draw on unrelated balance", got)
	}
}

// A fee larger than the captured amount would send the provider a negative
// transfer. Refuse before touching the rail.
func TestCaptureRejectsFeeExceedingAmount(t *testing.T) {
	_, s := newFake(t)
	if _, err := s.Capture(context.Background(), Request{
		Key: "k", Outcome: "th_1", HoldRef: "pi_1",
		AmountMinor: 100, FeeMinor: 200, Currency: "USD", Destination: "acct_p",
	}); err == nil {
		t.Fatal("a fee exceeding the captured amount was accepted")
	}
}

// When nothing is owed there is nobody to pay, and a zero transfer is an error
// on the rail. The capture must still stand.
func TestCaptureWithNothingOwedMakesNoTransfer(t *testing.T) {
	f, s := newFake(t)
	f.reply["/capture"] = `{"id":"pi_1","status":"succeeded","latest_charge":"ch_1"}`
	if _, err := s.Capture(context.Background(), Request{
		Key: "k", Outcome: "th_1", HoldRef: "pi_1",
		AmountMinor: 0, FeeMinor: 0, Currency: "USD", Destination: "acct_p",
	}); err != nil {
		t.Fatalf("capture: %v", err)
	}
	for _, c := range f.calls {
		if strings.Contains(c.Path, "/transfers") {
			t.Fatal("a zero transfer was sent")
		}
	}
}

// A partial capture already released the remainder. Release must then be a
// no-op, because the caller's postcondition — nothing still authorized —
// already holds, and cancelling a captured intent is an error.
func TestReleaseAfterCaptureIsNoOp(t *testing.T) {
	f, s := newFake(t)
	f.reply["/capture"] = `{"id":"pi_1","status":"succeeded","latest_charge":"ch_1"}`
	f.reply["/transfers"] = `{"id":"tr_1","status":"succeeded"}`
	r := Request{Key: "k", Outcome: "th_1", HoldRef: "pi_1",
		AmountMinor: 150, FeeMinor: 3, Currency: "USD", Destination: "acct_p"}
	if _, err := s.Capture(context.Background(), r); err != nil {
		t.Fatalf("capture: %v", err)
	}
	before := len(f.calls)
	res, err := s.Release(context.Background(), r)
	if err != nil {
		t.Fatalf("release after capture: %v", err)
	}
	if res.State != StateSucceeded {
		t.Fatalf("release state %q", res.State)
	}
	if len(f.calls) != before {
		t.Fatalf("release hit the rail after a capture: %v", f.paths())
	}
}

// An uncaptured hold is cancelled outright.
func TestReleaseCancelsUncapturedHold(t *testing.T) {
	f, s := newFake(t)
	f.reply["/cancel"] = `{"id":"pi_1","status":"canceled"}`
	res, err := s.Release(context.Background(), Request{
		Key: "k", Outcome: "th_1", HoldRef: "pi_1", Currency: "USD"})
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if res.State != StateSucceeded {
		t.Fatalf("a deliberate cancel reported %q", res.State)
	}
	f.find(t, "/cancel")
}

// A lost response is not a failure. Reporting it as one is how a retry pays
// twice; reporting it as success is how a payment is silently skipped.
func TestNetworkFailureReportsUnknownNotFailed(t *testing.T) {
	s := &Stripe{
		Secret: "sk_test_x", Keys: NewMemoryKeys(),
		HTTP: &http.Client{Timeout: time.Millisecond},
		// A port nothing is listening on.
		Base: "http://127.0.0.1:1",
		Now:  time.Now,
	}
	res, err := s.Hold(context.Background(), Request{
		Key: "k", Outcome: "th_1", AmountMinor: 100, Currency: "USD", Source: "pm_x"})
	if err == nil {
		t.Fatal("a dead rail reported success")
	}
	if res.State != StateUnknown {
		t.Fatalf("state %q, want %q — a lost response must not look decided",
			res.State, StateUnknown)
	}
}

// A 4xx is a decision. Retrying it wastes time and muddies the ledger.
func TestClientErrorIsNotRetried(t *testing.T) {
	f, s := newFake(t)
	f.fail["/payment_intents"] = http.StatusBadRequest
	if _, err := s.Hold(context.Background(), Request{
		Key: "k", Outcome: "th_1", AmountMinor: 100, Currency: "USD", Source: "pm_x"}); err == nil {
		t.Fatal("a 400 was treated as success")
	}
	if n := len(f.calls); n != 1 {
		t.Fatalf("a 400 was retried %d times", n)
	}
}

// A 5xx is a hiccup, and the key makes retrying safe by construction.
func TestServerErrorIsRetriedUnderTheSameKey(t *testing.T) {
	f, s := newFake(t)
	f.fail["/payment_intents"] = http.StatusInternalServerError
	if _, err := s.Hold(context.Background(), Request{
		Key: "k-retry", Outcome: "th_1", AmountMinor: 100, Currency: "USD", Source: "pm_x"}); err == nil {
		t.Fatal("a 500 was treated as success")
	}
	if len(f.calls) < 2 {
		t.Fatalf("a 500 was not retried (%d calls)", len(f.calls))
	}
	for _, c := range f.calls {
		if c.Key != "k-retry" {
			t.Fatalf("a retry used a different key %q; the rail could not dedupe", c.Key)
		}
	}
}

// The raw rail response is preserved so the ledger records what was actually
// said rather than our interpretation of it.
func TestResultKeepsRawResponse(t *testing.T) {
	f, s := newFake(t)
	f.reply["/payment_intents"] = `{"id":"pi_1","status":"requires_capture","livemode":false}`
	res, err := s.Hold(context.Background(), Request{
		Key: "k", Outcome: "th_1", AmountMinor: 500, Currency: "USD", Source: "pm_x"})
	if err != nil {
		t.Fatalf("hold: %v", err)
	}
	var back map[string]any
	if err := json.Unmarshal(res.Raw, &back); err != nil {
		t.Fatalf("raw response not preserved: %v", err)
	}
	if back["id"] != "pi_1" {
		t.Fatalf("raw response is not the rail's: %v", back)
	}
}
