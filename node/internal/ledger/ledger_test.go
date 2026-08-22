package ledger

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
)

func open(t *testing.T) *Ledger {
	t.Helper()
	l, err := Open(filepath.Join(t.TempDir(), "ledger.db"))
	if err != nil {
		t.Fatalf("opening ledger: %v", err)
	}
	t.Cleanup(func() { l.Close() })
	return l
}

func bal(t *testing.T, l *Ledger, account string) int64 {
	t.Helper()
	v, err := l.Balance(context.Background(), account, "USD")
	if err != nil {
		t.Fatalf("balance %s: %v", account, err)
	}
	return v
}

// The full lifecycle, with the money in the right places at every step.
func TestOutcomeLifecycleMovesMoneyCorrectly(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	const buyer, prov, out = "ed25519:buyer", "ed25519:prov", "th_1"

	if _, err := l.Topup(ctx, "k-top", buyer, 5000, "USD", "pi_1"); err != nil {
		t.Fatalf("topup: %v", err)
	}
	if got := bal(t, l, BalanceOf(buyer)); got != 5000 {
		t.Fatalf("after topup balance = %d, want 5000", got)
	}

	// Accepting commits the most the terms could pay.
	if _, err := l.Hold(ctx, "k-hold", out, buyer, 500, "USD"); err != nil {
		t.Fatalf("hold: %v", err)
	}
	if got := bal(t, l, BalanceOf(buyer)); got != 4500 {
		t.Fatalf("after hold balance = %d, want 4500", got)
	}
	if got := bal(t, l, EscrowOf(out)); got != 500 {
		t.Fatalf("escrow = %d, want 500", got)
	}

	// Evidence was admissible, predicate false: base fee only.
	if _, err := l.Capture(ctx, "k-cap", out, prov, 150, 3, "USD"); err != nil {
		t.Fatalf("capture: %v", err)
	}
	if _, err := l.Release(ctx, "k-rel", out, buyer, 350, "USD"); err != nil {
		t.Fatalf("release: %v", err)
	}

	if got := bal(t, l, PayableOf(prov)); got != 147 {
		t.Fatalf("provider payable = %d, want 147", got)
	}
	if got := bal(t, l, AccountFees); got != 3 {
		t.Fatalf("fees = %d, want 3", got)
	}
	if got := bal(t, l, BalanceOf(buyer)); got != 4850 {
		t.Fatalf("buyer balance = %d, want 4850 (5000 - 150 spent)", got)
	}
	// The escrow is empty: everything committed went somewhere.
	if got := bal(t, l, EscrowOf(out)); got != 0 {
		t.Fatalf("escrow left %d behind", got)
	}
	// The outside world is owed exactly what is held inside.
	if got := bal(t, l, AccountExternal); got != -5000 {
		t.Fatalf("external = %d, want -5000", got)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// An unbalanced operation is the only way to create money, so Post must refuse
// one even when a caller insists.
func TestUnbalancedPostRefused(t *testing.T) {
	l := open(t)
	_, err := l.Post(context.Background(), "k", "bogus", "th", "USD", []Posting{
		{Account: BalanceOf("a"), AmountMinor: 100},
		{Account: AccountExternal, AmountMinor: -99},
	})
	if err == nil {
		t.Fatal("an operation that creates 1 minor unit was accepted")
	}
	if err := l.Audit(context.Background()); err != nil {
		t.Fatalf("a refused operation still wrote postings: %v", err)
	}
}

// Spending money that was never topped up must fail, and must leave nothing
// behind when it does.
func TestOverdraftRefused(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	if _, err := l.Topup(ctx, "k-top", "buyer", 100, "USD", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := l.Hold(ctx, "k-hold", "th", "buyer", 500, "USD"); err == nil {
		t.Fatal("a buyer held 500 against a balance of 100")
	}
	if got := bal(t, l, BalanceOf("buyer")); got != 100 {
		t.Fatalf("balance is %d after a refused hold, want 100", got)
	}
	if got := bal(t, l, EscrowOf("th")); got != 0 {
		t.Fatalf("escrow gained %d from a refused hold", got)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// An outcome cannot pay out more than was committed to it.
func TestCaptureCannotExceedEscrow(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "k1", "buyer", 5000, "USD", "")
	l.Hold(ctx, "k2", "th", "buyer", 500, "USD")
	if _, err := l.Capture(ctx, "k3", "th", "prov", 900, 0, "USD"); err == nil {
		t.Fatal("captured 900 from an escrow of 500")
	}
	if got := bal(t, l, PayableOf("prov")); got != 0 {
		t.Fatalf("provider was credited %d by a refused capture", got)
	}
}

// The same signed instruction applied twice must move money once. This is the
// property that makes crash recovery safe.
func TestReplayedKeyMovesMoneyOnce(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "k-top", "buyer", 1000, "USD", "")
	for i := 0; i < 3; i++ {
		if _, err := l.Hold(ctx, "k-hold", "th", "buyer", 400, "USD"); err != nil {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
	if got := bal(t, l, EscrowOf("th")); got != 400 {
		t.Fatalf("escrow = %d after three identical holds, want 400", got)
	}
	r, err := l.Hold(ctx, "k-hold", "th", "buyer", 400, "USD")
	if err != nil {
		t.Fatal(err)
	}
	if !r.Replay {
		t.Fatal("a repeated key was not reported as a replay")
	}
}

// Concurrent spending of one balance must not overdraw it. Without the check
// inside the transaction, two holds can each see enough money.
func TestConcurrentHoldsCannotOverdraw(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "k-top", "buyer", 1000, "USD", "")

	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, err := l.Hold(ctx, key(i), "th", "buyer", 400, "USD")
			if err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()

	if ok > 2 {
		t.Fatalf("%d holds of 400 succeeded against a balance of 1000", ok)
	}
	if got := bal(t, l, BalanceOf("buyer")); got < 0 {
		t.Fatalf("balance went negative: %d", got)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

func key(i int) string { return "k-" + string(rune('a'+i)) }

// Earnings below the payout threshold wait rather than being paid at a loss.
func TestDueOnlyListsProvidersWorthPaying(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "t", "buyer", 100000, "USD", "")
	l.Hold(ctx, "h", "th", "buyer", 100000, "USD")
	l.Capture(ctx, "c1", "th", "small", 150, 0, "USD")
	l.Capture(ctx, "c2", "th", "big", 5000, 0, "USD")

	due, err := l.Due(ctx, "USD", 2000)
	if err != nil {
		t.Fatal(err)
	}
	if _, listed := due["small"]; listed {
		t.Fatal("a provider owed $1.50 was queued for a payout that costs more than that")
	}
	if got := due["big"]; got != 5000 {
		t.Fatalf("big is owed %d, want 5000", got)
	}
}

// A payout empties the payable account and shows up as money leaving.
func TestPayoutLeavesTheExchange(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "t", "buyer", 5000, "USD", "")
	l.Hold(ctx, "h", "th", "buyer", 5000, "USD")
	l.Capture(ctx, "c", "th", "prov", 5000, 100, "USD")

	if _, err := l.Payout(ctx, "p", "prov", 4900, "USD", "tr_1"); err != nil {
		t.Fatalf("payout: %v", err)
	}
	if got := bal(t, l, PayableOf("prov")); got != 0 {
		t.Fatalf("payable = %d after paying it all out", got)
	}
	// 5000 came in, 4900 went out, 100 is ours.
	if got := bal(t, l, AccountExternal); got != -100 {
		t.Fatalf("external = %d, want -100", got)
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// A provider cannot be paid more than they earned.
func TestPayoutCannotExceedEarnings(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	if _, err := l.Payout(ctx, "p", "prov", 100, "USD", ""); err == nil {
		t.Fatal("a provider who earned nothing was paid 100")
	}
}

// Currencies are separate ledgers that happen to share a table.
func TestCurrenciesDoNotMix(t *testing.T) {
	ctx := context.Background()
	l := open(t)
	l.Topup(ctx, "k-usd", "buyer", 1000, "USD", "")
	l.Topup(ctx, "k-eur", "buyer", 500, "EUR", "")

	usd, _ := l.Balance(ctx, BalanceOf("buyer"), "USD")
	eur, _ := l.Balance(ctx, BalanceOf("buyer"), "EUR")
	if usd != 1000 || eur != 500 {
		t.Fatalf("balances leaked across currencies: USD=%d EUR=%d", usd, eur)
	}
	// Spending dollars must not be fundable by euros.
	if _, err := l.Hold(ctx, "k-h", "th", "buyer", 1200, "USD"); err == nil {
		t.Fatal("a USD hold was funded from a EUR balance")
	}
	if err := l.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}
