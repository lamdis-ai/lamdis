package exchange

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func signed(secret string, at time.Time, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "%d.%s", at.Unix(), body)
	return fmt.Sprintf("t=%d,v1=%s", at.Unix(), hex.EncodeToString(mac.Sum(nil)))
}

func webhookFor(t *testing.T, now time.Time) *StripeWebhook {
	t.Helper()
	return &StripeWebhook{
		Secret: "whsec_test", Tolerance: 5 * time.Minute,
		Now: func() time.Time { return now },
	}
}

// An endpoint that credits balances must not believe whoever POSTs to it.
//
// Without signature checking this route is a way to mint money by sending
// JSON: it moves funds into an account named in the payload.
func TestOnlyTheProviderCanCreditABalance(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	h := webhookFor(t, now)
	body := `{"id":"evt_1","type":"checkout.session.completed"}`

	cases := []struct {
		what, header string
	}{
		{"no signature at all", ""},
		{"a made-up signature", "t=" + fmt.Sprint(now.Unix()) + ",v1=deadbeef"},
		{"the right shape, wrong secret", signed("whsec_wrong", now, body)},
		{"malformed header", "garbage"},
		{"no timestamp", "v1=" + strings.Repeat("a", 64)},
	}
	for _, c := range cases {
		if err := h.verify(c.header, []byte(body)); err == nil {
			t.Errorf("accepted %s", c.what)
		}
	}

	// The genuine article passes.
	if err := h.verify(signed("whsec_test", now, body), []byte(body)); err != nil {
		t.Fatalf("refused a genuine delivery: %v", err)
	}
}

// A captured delivery must not be replayable forever.
func TestAnOldDeliveryIsRefused(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	h := webhookFor(t, now)
	body := `{"id":"evt_1"}`

	old := now.Add(-30 * time.Minute)
	if err := h.verify(signed("whsec_test", old, body), []byte(body)); err == nil {
		t.Fatal("a delivery from half an hour ago was accepted")
	}
	// Inside the window it is fine.
	recent := now.Add(-1 * time.Minute)
	if err := h.verify(signed("whsec_test", recent, body), []byte(body)); err != nil {
		t.Errorf("a delivery from a minute ago was refused: %v", err)
	}
}

// The body is signed, so it cannot be edited in flight — which is the attack
// that matters here: change the amount, keep the signature.
func TestTheAmountCannotBeEditedInFlight(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	h := webhookFor(t, now)
	original := `{"id":"evt_1","data":{"object":{"amount_total":500}}}`
	tampered := `{"id":"evt_1","data":{"object":{"amount_total":500000}}}`

	sig := signed("whsec_test", now, original)
	if err := h.verify(sig, []byte(original)); err != nil {
		t.Fatalf("the genuine body was refused: %v", err)
	}
	if err := h.verify(sig, []byte(tampered)); err == nil {
		t.Fatal("a body edited after signing was accepted; the amount is " +
			"attacker-controlled")
	}
}

// Several signatures appear while a secret is rotated; any one matching is the
// provider.
func TestRotationIsSurvivable(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	h := webhookFor(t, now)
	body := `{"id":"evt_1"}`

	good := signed("whsec_test", now, body)
	// One old signature and one current, as sent mid-rotation.
	both := good + ",v1=" + strings.Repeat("f", 64)
	if err := h.verify(both, []byte(body)); err != nil {
		t.Fatalf("refused a delivery carrying a stale signature alongside a "+
			"good one: %v", err)
	}
}

// A session that has not actually cleared must not credit anything.
//
// A completed checkout is not a paid one when the method settles later, which
// is exactly the case bank debits are for.
func TestAnUnclearedPaymentCreditsNothing(t *testing.T) {
	h := &StripeWebhook{Server: &Server{}}
	obj := []byte(`{"id":"cs_1","payment_status":"unpaid","amount_total":5000,
		"client_reference_id":"dana"}`)
	// Nil ledger would panic if it tried to credit; returning cleanly is the
	// property under test.
	if err := h.creditCheckout(httptest.NewRequest("POST", "/", nil),
		"evt_1", obj); err != nil {
		t.Fatalf("an unpaid session errored instead of being ignored: %v", err)
	}
}

// Without a signing secret the endpoint must not exist at all.
func TestNoSecretMeansNoEndpoint(t *testing.T) {
	t.Setenv("STRIPE_WEBHOOK_SECRET", "")
	if wh := NewStripeWebhook(&Server{}); wh != nil {
		t.Fatal("an endpoint that credits balances was mounted with no way to " +
			"tell the provider from anybody else")
	}
	t.Setenv("STRIPE_WEBHOOK_SECRET", "whsec_real")
	if wh := NewStripeWebhook(&Server{}); wh == nil {
		t.Fatal("a configured secret did not mount the endpoint")
	}
}

// A forgery must not be told why it failed.
func TestAForgeryLearnsNothing(t *testing.T) {
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	h := webhookFor(t, now)
	h.Server = &Server{}
	mux := http.NewServeMux()
	h.Register(mux)

	req := httptest.NewRequest("POST", "/v1/stripe/webhook",
		strings.NewReader(`{"id":"evt_1","type":"checkout.session.completed"}`))
	req.Header.Set("Stripe-Signature", "t=1,v1=deadbeef")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a forged delivery got %d", rec.Code)
	}
	if b := rec.Body.String(); strings.Contains(b, "timestamp") ||
		strings.Contains(b, "signature") || strings.Contains(b, "secret") {
		t.Errorf("the refusal explains how to forge a better one: %q", b)
	}
}
