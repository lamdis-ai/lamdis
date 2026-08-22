package payment

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
)

func newBalance(t *testing.T) (*Balance, *ledger.Ledger) {
	t.Helper()
	l, err := ledger.Open(filepath.Join(t.TempDir(), "l.db"))
	if err != nil {
		t.Fatalf("ledger: %v", err)
	}
	t.Cleanup(func() { l.Close() })
	return NewBalance(l), l
}

// The same lifecycle the Stripe rail runs, on internal balances and at no cost.
func TestBalanceRailRunsTheOutcomeLifecycle(t *testing.T) {
	ctx := context.Background()
	b, l := newBalance(t)
	const buyer, prov, out = "ed25519:buyer", "ed25519:prov", "th_1"

	if _, err := l.Topup(ctx, "top", buyer, 5000, "USD", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Hold(ctx, Request{
		Key: "k-hold", Outcome: out, Source: buyer, AmountMinor: 500, Currency: "USD"}); err != nil {
		t.Fatalf("hold: %v", err)
	}
	if _, err := b.Capture(ctx, Request{
		Key: "k-cap", Outcome: out, Source: buyer, Destination: prov,
		AmountMinor: 150, FeeMinor: 3, Currency: "USD"}); err != nil {
		t.Fatalf("capture: %v", err)
	}
	if _, err := b.Release(ctx, Request{
		Key: "k-rel", Outcome: out, Source: buyer, AmountMinor: 350, Currency: "USD"}); err != nil {
		t.Fatalf("release: %v", err)
	}

	pay, _ := l.Balance(ctx, ledger.PayableOf(prov), "USD")
	buy, _ := l.Balance(ctx, ledger.BalanceOf(buyer), "USD")
	esc, _ := l.Held(ctx, out, "USD")
	if pay != 147 || buy != 4850 || esc != 0 {
		t.Fatalf("payable=%d buyer=%d escrow=%d; want 147/4850/0", pay, buy, esc)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// The whole point of the balance rail: settling an outcome costs nothing, so a
// $1.50 review is viable where a card movement would take 34c of it.
func TestSmallOutcomeSettlesWhole(t *testing.T) {
	ctx := context.Background()
	b, l := newBalance(t)
	l.Topup(ctx, "top", "buyer", 10000, "USD", "")

	for i, out := range []string{"th_a", "th_b", "th_c"} {
		k := Key("h" + string(rune('0'+i)))
		if _, err := b.Hold(ctx, Request{
			Key: k, Outcome: out, Source: "buyer", AmountMinor: 150, Currency: "USD"}); err != nil {
			t.Fatal(err)
		}
		if _, err := b.Capture(ctx, Request{
			Key: Key("c" + string(rune('0'+i))), Outcome: out, Source: "buyer",
			Destination: "reviewer", AmountMinor: 150, FeeMinor: 0, Currency: "USD"}); err != nil {
			t.Fatal(err)
		}
	}
	// Three $1.50 reviews, every cent of which reached the reviewer.
	if got, _ := l.Balance(ctx, ledger.PayableOf("reviewer"), "USD"); got != 450 {
		t.Fatalf("reviewer earned %d of 450", got)
	}
	// And they are not paid yet, because a $4.50 transfer is still marginal.
	due, _ := l.Due(ctx, "USD", 2000)
	if _, listed := due["reviewer"]; listed {
		t.Fatal("a $4.50 balance was queued for payout below the threshold")
	}
}

// A refund after payout must fail rather than overdraw the provider. This is
// what the dispute window protects.
func TestRefundAfterPayoutIsRefused(t *testing.T) {
	ctx := context.Background()
	b, l := newBalance(t)
	l.Topup(ctx, "top", "buyer", 5000, "USD", "")
	b.Hold(ctx, Request{Key: "h", Outcome: "th", Source: "buyer", AmountMinor: 5000, Currency: "USD"})
	b.Capture(ctx, Request{Key: "c", Outcome: "th", Source: "buyer", Destination: "prov",
		AmountMinor: 5000, FeeMinor: 0, Currency: "USD"})

	// Before payout a dispute can still claw the money back.
	if _, err := b.Refund(ctx, Request{Key: "r1", Outcome: "th", Source: "buyer",
		Destination: "prov", AmountMinor: 1000, Currency: "USD"}); err != nil {
		t.Fatalf("refund before payout: %v", err)
	}
	// Pay out the rest, then the same dispute has nothing to reach.
	if _, err := l.Payout(ctx, "p", "prov", 4000, "USD", "tr_1"); err != nil {
		t.Fatal(err)
	}
	if _, err := b.Refund(ctx, Request{Key: "r2", Outcome: "th", Source: "buyer",
		Destination: "prov", AmountMinor: 1000, Currency: "USD"}); err == nil {
		t.Fatal("money was clawed back from a provider who had already been paid")
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// An internal rail never loses a response, so Status is exact.
func TestBalanceStatusIsExact(t *testing.T) {
	ctx := context.Background()
	b, l := newBalance(t)
	l.Topup(ctx, "top", "buyer", 1000, "USD", "")

	if res, _ := b.Status(ctx, "never-happened"); res.State != StateFailed {
		t.Fatalf("an unapplied key reported %q", res.State)
	}
	b.Hold(ctx, Request{Key: "k", Outcome: "th", Source: "buyer", AmountMinor: 100, Currency: "USD"})
	res, err := b.Status(ctx, "k")
	if err != nil {
		t.Fatal(err)
	}
	if res.State != StateSucceeded {
		t.Fatalf("an applied key reported %q", res.State)
	}
}

// An agent that keeps spending must be stopped by its balance, not by trust.
func TestAgentCannotSpendPastItsBalance(t *testing.T) {
	ctx := context.Background()
	b, l := newBalance(t)
	l.Topup(ctx, "top", "buyer", 1000, "USD", "")

	spent := 0
	for i := 0; i < 10; i++ {
		k := Key("h" + string(rune('0'+i)))
		_, err := b.Hold(ctx, Request{
			Key: k, Outcome: "th" + string(rune('0'+i)),
			Source: "buyer", AmountMinor: 300, Currency: "USD"})
		if err == nil {
			spent++
		}
	}
	if spent != 3 {
		t.Fatalf("%d holds of 300 succeeded against 1000, want 3", spent)
	}
	if got, _ := l.Balance(ctx, ledger.BalanceOf("buyer"), "USD"); got != 100 {
		t.Fatalf("balance %d after overspending attempts", got)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}
