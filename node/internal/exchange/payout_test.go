package exchange

import (
	"context"
	"crypto/ed25519"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
)

// Money must be able to leave.
//
// For a long time it could not, and nothing said so. The rail hook was
// declared on the server and never assigned anywhere in the codebase, so
// payoutStatusFor returned "unavailable" on every call forever while the board
// advertised getting paid. Earnings accrued correctly in a double-entry ledger
// with no exit.
//
// Every test passed throughout, because no test asked whether the hooks were
// connected to anything.
func TestPaymentHooksAreWiredWhenARailIsConfigured(t *testing.T) {
	// A test-mode key shape. Nothing is called; Open only builds the adapter,
	// and a live key would be refused by the adapter itself.
	t.Setenv("STRIPE_SECRET_KEY", "sk_test_0000000000000000000000000000")

	key := ed25519.NewKeyFromSeed(make([]byte, ed25519.SeedSize))
	srv, err := Open(key, "https://example.test", Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}

	// Each of these is a direction money has to travel. A nil one is not a
	// missing feature — it is a promise the product makes and cannot keep.
	missing := map[string]bool{
		"Deposit (nobody can add funds)":                srv.Deposit == nil,
		"Payout (nobody can ever be paid)":              srv.Payout == nil,
		"PayoutAccount (the console cannot report why)": srv.PayoutAccount == nil,
		"Rail (no connected accounts can be opened)":    srv.Rail == nil,
		"PayoutAccounts (payees cannot be remembered)":  srv.PayoutAccounts == nil,
	}
	for what, isNil := range missing {
		if isNil {
			t.Errorf("a rail is configured but %s is nil", what)
		}
	}
}

// The routes a worker needs to get paid must be mounted, not merely written.
func TestPayoutRoutesAreMounted(t *testing.T) {
	key := ed25519.NewKeyFromSeed(make([]byte, ed25519.SeedSize))
	srv, err := NewServer(key, "https://example.test")
	if err != nil {
		t.Fatal(err)
	}
	h := srv.Handler()
	for _, rt := range []struct{ method, path string }{
		{"GET", "/v1/payout"},
		{"POST", "/v1/payout/connect"},
		{"POST", "/v1/balance/confirm"},
		{"GET", "/payout/done"},
	} {
		req, _ := http.NewRequest(rt.method, "https://example.test"+rt.path, nil)
		if _, pattern := h.Handler(req); pattern == "" {
			t.Errorf("%s %s is not mounted; a worker cannot get paid without it",
				rt.method, rt.path)
		}
	}
}

// With no rail at all, the worker must be told the exchange is the thing
// missing — not sent looking for a setting that does not exist.
func TestNoRailBlamesTheExchangeNotTheWorker(t *testing.T) {
	s := &Server{}
	st := s.payoutAccountFor("worker-1")
	if !st.Unavailable {
		t.Fatal("with no rail configured the state must say unavailable")
	}
	if st.Connected {
		t.Error("reported a connected account on an exchange with no rail")
	}
}

// A payout to somebody with no connected account must refuse rather than
// silently succeed against an empty destination.
func TestPayoutRefusesWithoutAnAccount(t *testing.T) {
	s := &Server{Rail: stubRail{}, PayoutAccounts: NewPayoutAccounts("")}
	if _, err := s.payOut(context.Background(), "worker-1", 5000, "USD"); err == nil {
		t.Fatal("paid out to a person with no connected account")
	}
}

// The mapping must never be repointed: that is how earned money reaches
// somebody else's bank.
func TestAPayoutAccountCannotBeSilentlyRepointed(t *testing.T) {
	p := NewPayoutAccounts("")
	if err := p.Put("worker-1", "acct_first"); err != nil {
		t.Fatal(err)
	}
	if err := p.Put("worker-1", "acct_attacker"); err == nil {
		t.Fatal("a second account replaced the first without complaint")
	}
	if got, _ := p.Get("worker-1"); got != "acct_first" {
		t.Errorf("account is now %q", got)
	}
}

// Rail field names are the provider's; workers are not.
func TestNeedsAreTranslatedForPeople(t *testing.T) {
	got := humanizeNeeds([]string{
		"individual.verification.document",
		"external_account",
		"individual.dob.year",
	}, "")
	want := map[string]bool{
		"a photo of your ID":         true,
		"a bank account to pay into": true,
		"your date of birth":         true,
	}
	if len(got) != 3 {
		t.Fatalf("got %v", got)
	}
	for _, g := range got {
		if !want[g] {
			t.Errorf("%q is the provider's words, not a person's", g)
		}
	}
}

type stubRail struct{}

func (stubRail) CreateAccount(context.Context, string, string) (payment.ConnectAccount, error) {
	return payment.ConnectAccount{ID: "acct_stub"}, nil
}
func (stubRail) CreateAccountAs(_ context.Context, _, _, kind, _ string) (payment.ConnectAccount, error) {
	return payment.ConnectAccount{ID: "acct_stub_" + kind}, nil
}
func (stubRail) AccountLink(context.Context, string, string, string) (string, error) {
	return "https://connect.example/onboard", nil
}
func (stubRail) Account(context.Context, string) (payment.ConnectAccount, error) {
	return payment.ConnectAccount{ID: "acct_stub", PayoutsEnabled: true}, nil
}
func (stubRail) PayOut(context.Context, payment.Key, string, int64, string, string) (payment.Result, error) {
	return payment.Result{Ref: "tr_stub"}, nil
}

var _ PayoutRail = stubRail{}
var _ = api.PayoutState{}

// A background loop that is written but never started is indistinguishable
// from one that does not exist.
//
// This has now happened three times in this codebase: the dispatcher, the
// settlement wiring, and — while fixing those — the payout sweeper itself.
// Each compiled, each had passing tests, and each did nothing. The pattern is
// always the same: the function is correct and nobody calls it.
//
// Checking the command source is crude. It is also the only place the
// difference is visible.
func TestBackgroundLoopsAreActuallyStarted(t *testing.T) {
	src, err := os.ReadFile("../../cmd/lamdis/serve_exchange.go")
	if err != nil {
		t.Skipf("cannot read the command source: %v", err)
	}
	for _, loop := range []struct{ call, why string }{
		{"StartSweeper", "escrow on finished jobs is never returned to buyers"},
		{"StartPayoutSweeper", "nobody is ever actually paid, however much they are owed"},
		{"WarmPayoutAccounts", "the first person to open payout settings waits " +
			"for a full rebuild of the account mapping"},
	} {
		if !strings.Contains(string(src), loop.call+"(") {
			t.Errorf("%s is never started, so %s", loop.call, loop.why)
		}
	}
}

// A payout key must never depend on the clock.
//
// It once contained the hour. The sweeper runs hourly, so if a transfer
// succeeded and the ledger write failed, the next sweep derived a different
// key for the same money and the rail paid it out a second time. The
// idempotency key is the only thing standing between a retry and a double
// payment; deriving it from wall-clock time removes that protection precisely
// when it is needed.
func TestPayoutKeyDoesNotDependOnTheClock(t *testing.T) {
	src, err := os.ReadFile("payout.go")
	if err != nil {
		t.Fatal(err)
	}
	// Isolate the key derivation and check no clock reaches it.
	i := strings.Index(string(src), `payment.DeriveKey("payout"`)
	if i < 0 {
		t.Fatal("cannot find the payout key derivation")
	}
	derivation := string(src)[i : i+220]
	for _, clock := range []string{"s.now()", "time.Now()", "2006-01-02", "Format("} {
		if strings.Contains(derivation, clock) {
			t.Errorf("the payout idempotency key contains %q; a retry after a "+
				"failed ledger write would derive a new key and pay twice", clock)
		}
	}
	if !strings.Contains(derivation, "credited") {
		t.Error("the key should be derived from ledger state, which is stable " +
			"across retries and moves after each recorded payout")
	}
}
