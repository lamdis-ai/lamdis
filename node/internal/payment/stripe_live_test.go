package payment

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

// TestStripeLiveTestMode drives the adapter against Stripe's real test-mode
// API. It is skipped unless STRIPE_SECRET_KEY is set, so the default test run
// stays offline and free.
//
// It exists because the fake in stripe_test.go proves only that the adapter is
// consistent with our own beliefs about Stripe. The parameter names, the
// meaning of a partial capture, and whether a transfer is even permitted are
// facts about somebody else's system, and the only way to know them is to ask.
func TestStripeLiveTestMode(t *testing.T) {
	secret := os.Getenv("STRIPE_SECRET_KEY")
	if secret == "" {
		t.Skip("STRIPE_SECRET_KEY not set; skipping live test-mode run")
	}
	dest := os.Getenv("LAMDIS_TEST_CONNECTED_ACCT")
	if dest == "" {
		t.Skip("LAMDIS_TEST_CONNECTED_ACCT not set")
	}
	s, err := NewStripe()
	if err != nil {
		t.Fatalf("building rail: %v", err)
	}
	if s.Live() {
		t.Fatal("refusing to run against a live key")
	}
	ctx := context.Background()
	outcome := "th_live_" + t.Name()

	// The buyer accepts: authorize the most the terms could ever pay.
	hold, err := s.Hold(ctx, Request{
		Key: DeriveKey("hold", outcome), Outcome: outcome,
		AmountMinor: 500, Currency: "USD", Source: "pm_card_visa",
	})
	if err != nil {
		t.Fatalf("hold: %v", err)
	}
	if hold.State != StateSucceeded {
		t.Fatalf("hold state %q", hold.State)
	}
	var held map[string]any
	json.Unmarshal(hold.Raw, &held)
	if held["status"] != "requires_capture" {
		t.Fatalf("hold status %v, want requires_capture — money moved too early", held["status"])
	}
	t.Logf("hold      %s  authorized 500, charged nothing", hold.Ref)

	// The verdict lands: evidence was admissible, the predicate was not
	// satisfied. Base fee only, so 150 of the 500 is earned.
	cap, err := s.Capture(ctx, Request{
		Key: DeriveKey("settle", outcome), Outcome: outcome, HoldRef: hold.Ref,
		AmountMinor: 150, FeeMinor: 3, Currency: "USD", Destination: dest,
	})
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	t.Logf("capture   %s  took 150, forwarded 147, released 350", cap.Ref)

	// Ask Stripe what it believes, rather than trusting our own return value.
	obj, err := s.call(ctx, "GET", "/v1/payment_intents/"+hold.Ref, nil, "")
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	var pi struct {
		Status  string `json:"status"`
		Amount  int64  `json:"amount"`
		Charges struct {
			Data []struct {
				AmountCaptured int64 `json:"amount_captured"`
				AmountRefunded int64 `json:"amount_refunded"`
			} `json:"data"`
		} `json:"charges"`
		LatestCharge string `json:"latest_charge"`
	}
	if err := json.Unmarshal(obj.Raw, &pi); err != nil {
		t.Fatalf("parsing readback: %v", err)
	}
	if pi.Status != "succeeded" {
		t.Fatalf("intent status %q after capture", pi.Status)
	}

	ch, err := s.call(ctx, "GET", "/v1/charges/"+pi.LatestCharge, nil, "")
	if err != nil {
		t.Fatalf("reading charge: %v", err)
	}
	var charge struct {
		Amount         int64 `json:"amount"`
		AmountCaptured int64 `json:"amount_captured"`
		AmountRefunded int64 `json:"amount_refunded"`
	}
	json.Unmarshal(ch.Raw, &charge)
	if charge.AmountCaptured != 150 {
		t.Fatalf("captured %d, want 150", charge.AmountCaptured)
	}
	// The uncaptured remainder comes back to the buyer without us asking.
	if charge.AmountRefunded != 350 {
		t.Fatalf("released %d, want 350", charge.AmountRefunded)
	}
	t.Logf("readback  captured=%d released=%d of %d",
		charge.AmountCaptured, charge.AmountRefunded, charge.Amount)

	// Release is now a no-op, and must not error against the real API either.
	if _, err := s.Release(ctx, Request{
		Key: DeriveKey("settle", outcome), Outcome: outcome, HoldRef: hold.Ref,
		Currency: "USD"}); err != nil {
		t.Fatalf("release after capture: %v", err)
	}

	// Status must survive a lost response.
	st, err := s.Status(ctx, DeriveKey("capture", string(DeriveKey("settle", outcome))))
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if st.State != StateSucceeded {
		t.Fatalf("status after capture is %q", st.State)
	}
	t.Logf("status    %s -> %s", st.Ref, st.State)
}
