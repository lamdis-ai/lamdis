package exchange

import (
	"context"
	"crypto/ed25519"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
)

func srvWithMoney(t *testing.T) (*Server, context.Context) {
	t.Helper()
	key := ed25519.NewKeyFromSeed(make([]byte, ed25519.SeedSize))
	s, err := Open(key, "https://example.test", Options{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := s.Ledger.Topup(ctx, "t", "buyer", 100000, "USD", ""); err != nil {
		t.Fatal(err)
	}
	return s, ctx
}

func fund(t *testing.T, s *Server, ctx context.Context, l *api.Listing) {
	t.Helper()
	if _, err := s.Ledger.Hold(ctx, "h:"+l.Job, l.Job, "buyer",
		MaxPayoutFor(l), l.Currency); err != nil {
		t.Fatal(err)
	}
	if err := s.Board.Post(l); err != nil {
		t.Fatal(err)
	}
	s.mu.Lock()
	s.buyers[l.Job] = "buyer"
	s.mu.Unlock()
}

// The gap the review found: accepted evidence credited nobody.
func TestAcceptedWorkCreditsTheWorker(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve, Title: "is the sign up",
		PayMinor: 500, BonusMinor: 1800, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)

	sub := api.Submission{Job: "obs_1", Holder: "cap1", Verified: true, Finding: true}
	if err := s.settle(ctx, "obs_1", sub, "worker"); err != nil {
		t.Fatalf("settling: %v", err)
	}
	// Derived from FeeBP rather than written out, so changing the fee is one
	// edit in one place. Hard-coding 57 here meant the constant had a second,
	// invisible copy that had to be found and updated by hand.
	const gross = 2300
	wantFee := int64(gross) - net(gross)
	pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("worker"), "USD")
	fee, _ := s.Ledger.Balance(ctx, ledger.AccountFees, "USD")
	if pay != net(gross) || fee != wantFee {
		t.Fatalf("worker %d, fee %d; want %d and %d", pay, fee, net(gross), wantFee)
	}
	if err := s.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// Honest evidence that the answer is no must pay as well as evidence that it
// is yes, or a market of strangers learns to say yes.
func TestHonestNoStillPays(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve, Title: "is the sign up",
		PayMinor: 500, BonusMinor: 1800, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)

	// A submission follows a claim, so the seat is used by the time we settle.
	if _, _, err := s.Board.Claim("obs_1", "worker"); err != nil {
		t.Fatal(err)
	}
	sub := api.Submission{Job: "obs_1", Holder: "cap1", Verified: true, Finding: false}
	if err := s.settle(ctx, "obs_1", sub, "worker"); err != nil {
		t.Fatal(err)
	}
	pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("worker"), "USD")
	if pay == 0 {
		t.Fatal("a worker who honestly reported 'no' was paid nothing")
	}
	if pay >= 2300 {
		t.Fatalf("a 'no' paid the success bonus: %d", pay)
	}
	// And the buyer gets the unearned bonus back, because the seat is used up.
	bal, _ := s.Ledger.Balance(ctx, ledger.BalanceOf("buyer"), "USD")
	if held, _ := s.Ledger.Held(ctx, "obs_1", "USD"); held != 0 {
		t.Fatalf("%d is still stuck in escrow", held)
	}
	if bal <= 100000-2300 {
		t.Fatalf("the buyer was not refunded the unearned part: %d", bal)
	}
}

// A do-job pays on completion, because there the worker controls the answer.
func TestDoJobPaysOnCompletionAndForAttempts(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "do_1", Kind: api.KindDo, Title: "put the sign up",
		Instructions: "fix it in the window",
		PayMinor:     4000, AttemptMinor: 800, Currency: "USD", Slots: 2,
		Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)

	// Verified means the evidence is admissible — the code was legible and the
	// location matched. Finding means it shows the work finished. A do-job
	// needs both, because presence is not completion.
	done := api.Submission{Job: "do_1", Holder: "c1", Verified: true, Finding: true}
	if err := s.settle(ctx, "do_1", done, "finisher"); err != nil {
		t.Fatal(err)
	}
	if pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("finisher"), "USD"); pay != net(4000) {
		t.Fatalf("completion paid %d, want %d", pay, net(4000))
	}

	// Admissible evidence that does not show the job done is not a completion.
	// This is what used to pay in full: a photograph of the front of the
	// property, with the code in frame, and nothing moved.
	present := api.Submission{Job: "do_1", Holder: "c9", Verified: true}
	if err := s.settle(ctx, "do_1", present, "loiterer"); err != nil {
		t.Fatal(err)
	}
	if pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("loiterer"), "USD"); pay != 0 {
		t.Fatalf("turning up and photographing the address paid %d", pay)
	}

	// Somebody who went, could not finish, and evidenced the trip gets the
	// attempt fee. The evidence still has to be admissible.
	tried := api.Submission{Job: "do_1", Holder: "c2", Verified: true, Attempted: true}
	if err := s.settle(ctx, "do_1", tried, "tryer"); err != nil {
		t.Fatal(err)
	}
	if pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("tryer"), "USD"); pay != net(800) {
		t.Fatalf("a documented attempt paid %d, want %d", pay, net(800))
	}
	if err := s.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// A refused submission is not an attempt. Paying for one would pay for
// uploading anything at all.
func TestRefusedSubmissionEarnsNothing(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "do_1", Kind: api.KindDo, Title: "put the sign up",
		Instructions: "fix it", PayMinor: 4000, AttemptMinor: 800,
		Currency: "USD", Slots: 1, Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)

	bad := api.Submission{Job: "do_1", Holder: "c1", Why: "the code was not legible"}
	if err := s.settle(ctx, "do_1", bad, "chancer"); err != nil {
		t.Fatal(err)
	}
	if pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("chancer"), "USD"); pay != 0 {
		t.Fatalf("a refused submission earned %d", pay)
	}
}

// Settling twice for the same submission must credit once.
func TestSettlementIsIdempotent(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve, Title: "x",
		PayMinor: 500, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)
	if _, _, err := s.Board.Claim("obs_1", "worker"); err != nil {
		t.Fatal(err)
	}
	sub := api.Submission{Job: "obs_1", Holder: "cap1", Verified: true}
	for i := 0; i < 3; i++ {
		if err := s.settle(ctx, "obs_1", sub, "worker"); err != nil {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
	if pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("worker"), "USD"); pay != net(500) {
		t.Fatalf("three settlements credited %d, want %d", pay, net(500))
	}
	if err := s.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// A job nobody takes must give the money back. Before the sweeper it stayed
// in escrow forever.
func TestExpiredJobReturnsTheEscrow(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "gone", Kind: api.KindObserve, Title: "nobody wanted this",
		PayMinor: 900, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(-time.Minute),
	}
	// Post it directly: an expired listing cannot go through the funded path.
	if _, err := s.Ledger.Hold(ctx, "h:gone", "gone", "buyer", 900, "USD"); err != nil {
		t.Fatal(err)
	}
	s.Board.Post(l)
	s.mu.Lock()
	s.buyers["gone"] = "buyer"
	s.mu.Unlock()

	before, _ := s.Ledger.Balance(ctx, ledger.BalanceOf("buyer"), "USD")
	n, err := s.Sweep(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("swept %d jobs", n)
	}
	after, _ := s.Ledger.Balance(ctx, ledger.BalanceOf("buyer"), "USD")
	if after != before+900 {
		t.Fatalf("buyer went from %d to %d; the escrow was not returned", before, after)
	}
	if held, _ := s.Ledger.Held(ctx, "gone", "USD"); held != 0 {
		t.Fatalf("%d still held on an expired job", held)
	}
	if err := s.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// No settlement may pay out more than was committed to the job.
func TestSettlementCannotExceedEscrow(t *testing.T) {
	s, ctx := srvWithMoney(t)
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve, Title: "x",
		PayMinor: 500, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	fund(t, s, ctx, l)
	// The listing is quietly edited to promise more than was escrowed.
	got, _ := s.Board.Get("obs_1")
	got.PayMinor = 999999
	s.Board.Post(got)

	sub := api.Submission{Job: "obs_1", Holder: "c1", Verified: true}
	if err := s.settle(ctx, "obs_1", sub, "worker"); err != nil {
		t.Fatal(err)
	}
	pay, _ := s.Ledger.Balance(ctx, ledger.PayableOf("worker"), "USD")
	if pay > 500 {
		t.Fatalf("paid %d out of an escrow of 500", pay)
	}
	if err := s.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// net is what a worker keeps of a gross amount, derived from the fee constant.
//
// Every one of these figures used to be written out — 2300-57, 4000-100,
// 500-12 — which made the fee a constant with four undocumented copies. Change
// it and the tests fail in four places with no clue that they are the same
// fact. Derived once here instead.
func net(gross int64) int64 { return gross - gross*FeeBP/10000 }
