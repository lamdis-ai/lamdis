package exchange

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
)

// A rail that records what it was asked to do.
type recordingRail struct {
	held, captured, released int
	failHold                 bool
}

func (r *recordingRail) Hold(ctx context.Context, req payment.Request) (payment.Result, error) {
	if r.failHold {
		return payment.Result{}, context.Canceled
	}
	r.held++
	return payment.Result{Ref: "pi_test", State: "requires_capture"}, nil
}
func (r *recordingRail) Capture(ctx context.Context, req payment.Request) (payment.Result, error) {
	r.captured++
	return payment.Result{Ref: req.HoldRef, State: "succeeded"}, nil
}
func (r *recordingRail) Release(ctx context.Context, req payment.Request) (payment.Result, error) {
	r.released++
	return payment.Result{Ref: req.HoldRef, State: "canceled"}, nil
}

func acpServer(t *testing.T) (*Server, *recordingRail, *http.ServeMux) {
	t.Helper()
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	rail := &recordingRail{}
	// One operator who takes this kind of work nearby, so supply is reachable.
	caps := api.NewCapacities()
	caps.Set("op-1", api.Capacity{MaxConcurrent: 2, RangeMiles: 40, Accepting: true,
		Kinds: []string{"observe", "do"}})
	s := &Server{
		BaseURL: "https://exchange.example",
		Board:   api.NewBoard(api.NewCapabilities()), Capacities: caps,
		ACP: NewACPSessions(), ACPKey: "k_test", ACPSecret: "s_test",
		Charges: rail,
		Now:     func() time.Time { return now },
	}
	s.Board.Now = func() time.Time { return now }
	mux := http.NewServeMux()
	s.registerACP(mux)
	return s, rail, mux
}

func acpPost(t *testing.T, mux *http.ServeMux, path string, body any, key string) *httptest.ResponseRecorder {
	t.Helper()
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest("POST", path, strings.NewReader(string(raw)))
	r.Header.Set("Authorization", "Bearer k_test")
	mac := hmac.New(sha256.New, []byte("s_test"))
	mac.Write(raw)
	r.Header.Set("Signature", base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func decodeACP(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("unreadable body: %s", w.Body.String())
	}
	return out
}

// The whole point: somebody says yes inside a conversation, with no account,
// and their card is authorised rather than charged.
func TestAgenticCheckoutAuthorisesRatherThanCharges(t *testing.T) {
	_, rail, mux := acpServer(t)

	w := acpPost(t, mux, "/acp/checkout_sessions", map[string]any{
		"items": []map[string]any{{"id": "sign_check", "quantity": 1}},
	}, "idem-1")
	if w.Code != http.StatusCreated {
		t.Fatalf("create returned %d: %s", w.Code, w.Body.String())
	}
	sess := decodeACP(t, w)
	// No address yet, so it must not be payable.
	if sess["status"] != ACPNotReady {
		t.Fatalf("a session with no address is %v, want %s", sess["status"], ACPNotReady)
	}
	id, _ := sess["id"].(string)

	w = acpPost(t, mux, "/acp/checkout_sessions/"+id, map[string]any{
		"fulfillment_address": map[string]any{
			"line_one": "812 Marlow Street", "city": "Detroit", "state": "MI",
			"postal_code": "48226", "country": "US",
		},
	}, "")
	sess = decodeACP(t, w)
	if sess["status"] != ACPReady {
		t.Fatalf("with an address and supply the session is %v: %s",
			sess["status"], w.Body.String())
	}

	w = acpPost(t, mux, "/acp/checkout_sessions/"+id+"/complete", map[string]any{
		"payment_data": map[string]any{"token": "spt_123", "provider": "stripe"},
	}, "idem-complete")
	if w.Code != http.StatusOK {
		t.Fatalf("complete returned %d: %s", w.Code, w.Body.String())
	}
	if rail.held != 1 {
		t.Errorf("held %d times, want 1", rail.held)
	}
	// The money must NOT have moved yet. That is the custody claim.
	if rail.captured != 0 {
		t.Errorf("the card was captured at checkout; it should only be taken " +
			"against proof the work was done")
	}
}

// A retried complete must not charge the card twice.
func TestCompletingTwiceDoesNotChargeTwice(t *testing.T) {
	_, rail, mux := acpServer(t)
	w := acpPost(t, mux, "/acp/checkout_sessions", map[string]any{
		"items": []map[string]any{{"id": "bin_return", "quantity": 1}},
		"fulfillment_address": map[string]any{
			"line_one": "812 Marlow Street", "city": "Detroit", "state": "MI",
		},
	}, "idem-a")
	id, _ := decodeACP(t, w)["id"].(string)

	pay := map[string]any{"payment_data": map[string]any{"token": "spt_1", "provider": "stripe"}}
	acpPost(t, mux, "/acp/checkout_sessions/"+id+"/complete", pay, "k1")
	acpPost(t, mux, "/acp/checkout_sessions/"+id+"/complete", pay, "k1")
	if rail.held != 1 {
		t.Errorf("the card was authorised %d times for one checkout", rail.held)
	}
}

// Money is taken against proof, and let go when the work never happened.
func TestMoneyMovesOnlyAgainstProof(t *testing.T) {
	s, rail, mux := acpServer(t)
	w := acpPost(t, mux, "/acp/checkout_sessions", map[string]any{
		"items": []map[string]any{{"id": "sign_check", "quantity": 1}},
		"fulfillment_address": map[string]any{
			"line_one": "812 Marlow Street", "city": "Detroit", "state": "MI",
		},
	}, "idem-b")
	id, _ := decodeACP(t, w)["id"].(string)
	acpPost(t, mux, "/acp/checkout_sessions/"+id+"/complete",
		map[string]any{"payment_data": map[string]any{"token": "spt_1"}}, "k2")

	job := "acp-" + id
	s.SettleACP(context.Background(), job, false)
	if rail.captured != 0 || rail.released != 1 {
		t.Errorf("work that was not accepted captured=%d released=%d; want 0 and 1",
			rail.captured, rail.released)
	}
	s.SettleACP(context.Background(), job, true)
	if rail.captured != 1 {
		t.Errorf("accepted work captured %d times, want 1", rail.captured)
	}
}

// Selling somebody an outcome nobody can deliver is worse inside their
// assistant than on our own site, because the trust it spends is not ours.
func TestNoSupplyMeansNoSale(t *testing.T) {
	_, _, mux := acpServer(t)
	// A server with nobody accepting work.
	empty := &Server{
		BaseURL: "https://exchange.example",
		Board:   api.NewBoard(api.NewCapabilities()), Capacities: api.NewCapacities(),
		ACP: NewACPSessions(), ACPKey: "k_test", ACPSecret: "s_test",
		Charges: &recordingRail{},
		Now:     func() time.Time { return time.Now() },
	}
	m2 := http.NewServeMux()
	empty.registerACP(m2)

	w := acpPost(t, m2, "/acp/checkout_sessions", map[string]any{
		"items": []map[string]any{{"id": "sign_check", "quantity": 1}},
		"fulfillment_address": map[string]any{
			"line_one": "1 Nowhere Road", "city": "Barrow", "state": "AK",
		},
	}, "idem-c")
	sess := decodeACP(t, w)
	if sess["status"] != ACPNotReady {
		t.Fatalf("a place with no supply is sellable: %s", w.Body.String())
	}
	msgs, _ := sess["messages"].([]any)
	if len(msgs) == 0 {
		t.Fatal("the buyer is told nothing about why they cannot buy")
	}
	first, _ := msgs[0].(map[string]any)
	if !strings.Contains(strings.ToLower(first["content"].(string)), "not been charged") {
		t.Errorf("the refusal does not reassure them about money: %v", first["content"])
	}
	_ = mux
}

// An unsigned or wrongly-signed request is refused.
func TestACPRefusesABadSignature(t *testing.T) {
	_, _, mux := acpServer(t)
	raw, _ := json.Marshal(map[string]any{"items": []map[string]any{{"id": "sign_check"}}})
	r := httptest.NewRequest("POST", "/acp/checkout_sessions", strings.NewReader(string(raw)))
	r.Header.Set("Authorization", "Bearer k_test")
	r.Header.Set("Signature", base64.StdEncoding.EncodeToString([]byte("wrong")))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("a bad signature returned %d, want 401", w.Code)
	}

	// And an unconfigured secret must refuse everything rather than allow it.
	if verifyACPSignature("", "anything", raw) {
		t.Error("an unconfigured secret accepted a signature")
	}
}
