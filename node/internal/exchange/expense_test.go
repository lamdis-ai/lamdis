package exchange

import (
	"testing"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

// Money escrowed for expenses must be reachable.
//
// The cap was set by the buyer, held in escrow from the moment the job was
// posted, and there was no path to claim against it — a buyer set aside five
// dollars for bin bags and the person who bought them could never ask for it.
// Money held for somebody with no way to reach it is worse than money never
// offered: it looks like a term of the deal.
func TestExpensesArePaidAgainstTheCap(t *testing.T) {
	job := &api.Listing{
		Job: "do-1", Kind: api.KindDo,
		PayMinor: 1200, AttemptMinor: 300, ExpenseCapMinor: 500,
		Currency: "usd",
	}
	cases := []struct {
		what      string
		sub       api.Submission
		wantTotal int64
	}{
		{"completed, claimed within the cap",
			api.Submission{Verified: true, Finding: true, ExpenseMinor: 420}, 1620},
		{"completed, claimed over the cap — paid the cap, not the claim",
			api.Submission{Verified: true, Finding: true, ExpenseMinor: 5000}, 1700},
		{"completed, claimed nothing",
			api.Submission{Verified: true, Finding: true}, 1200},
		{"attempted, out of pocket anyway",
			api.Submission{Verified: true, Attempted: true, ExpenseMinor: 420}, 720},
		{"refused outright — an expense line is not a way to be paid for nothing",
			api.Submission{ExpenseMinor: 420}, 0},
		{"present but the work is not done — expenses do not rescue it",
			api.Submission{Verified: true, ExpenseMinor: 420}, 420},
	}
	for _, c := range cases {
		if got := earnedFor(job, c.sub); got != c.wantTotal {
			t.Errorf("%s: earned %d, wanted %d", c.what, got, c.wantTotal)
		}
	}
}

// A job with no expense cap must never pay an expense, however it is claimed.
func TestExpensesNeedACapToBePaid(t *testing.T) {
	job := &api.Listing{Job: "do-2", Kind: api.KindDo, PayMinor: 1200, Currency: "usd"}
	got := earnedFor(job, api.Submission{Verified: true, Finding: true, ExpenseMinor: 9000})
	if got != 1200 {
		t.Fatalf("paid %d on a job that budgeted nothing for expenses", got)
	}
}
