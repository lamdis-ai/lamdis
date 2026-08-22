package exchange

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

// A job belongs to whoever is paying for it, and to nobody else.
//
// This test exists because for a while it did not. Every buyer-side route took
// an authenticated account and then ignored it: the sealed-bid list, the
// receipt, the status, and — worst — the award. Any stranger who signed up and
// created a key could read a competitor's sealed bids, then award that
// competitor's job to a colluding bidder and spend escrow that was never
// theirs. Nothing in the marketplace's design mattered past that point.
//
// The board sealing bids in its HTML view counted for nothing, because the API
// handed the same bids to whoever asked.
func TestOnlyTheBuyerCanSeeOrAwardTheirJob(t *testing.T) {
	now := time.Date(2026, 8, 20, 9, 0, 0, 0, time.UTC)
	board := api.NewBoard(api.NewCapabilities())
	board.Now = func() time.Time { return now }

	job := &api.Listing{
		Job: "do-1", Kind: "do", Title: "Swap the condenser fan motor",
		Instructions: "Replace the fan motor and photograph the nameplate.",
		Deliverable:  "A photo of the new motor installed.",
		Owner:        "acct_northline", Pricing: api.PriceBids, MaxBidMinor: 40000,
		Currency: "usd", Slots: 1,
		Expires: now.Add(24 * time.Hour), Posted: now,
		BidsCloseAt: now.Add(6 * time.Hour),
	}
	if err := board.Post(job); err != nil {
		t.Fatalf("post: %v", err)
	}

	srv := &Server{Board: board}

	// The buyer gets their job.
	rec := newRecorder()
	if _, ok := srv.ownedBy(rec, "do-1", "acct_northline"); !ok {
		t.Fatal("the account paying for the job cannot reach it")
	}

	// A stranger does not — and is not told the job exists.
	rec = newRecorder()
	if _, ok := srv.ownedBy(rec, "do-1", "acct_someone_else"); ok {
		t.Fatal("a stranger reached another buyer's job; they could read the " +
			"sealed bids and award it, spending escrow that is not theirs")
	}
	if rec.Code != 404 {
		t.Errorf("refused with %d; 403 confirms the job exists, which is "+
			"itself more than a stranger should learn", rec.Code)
	}

	// An unowned job is nobody's, not everybody's. A listing created before
	// ownership existed must not become a free-for-all.
	orphan := &api.Listing{
		Job: "do-2", Kind: "do", Title: "Legacy job with no owner recorded",
		Instructions: "Do the thing.", Deliverable: "A photo of the thing.",
		Currency: "usd", Slots: 1, PayMinor: 1000,
		Expires: now.Add(time.Hour), Posted: now,
	}
	if err := board.Post(orphan); err != nil {
		t.Fatalf("post orphan: %v", err)
	}
	rec = newRecorder()
	if _, ok := srv.ownedBy(rec, "do-2", "acct_anyone"); ok {
		t.Error("a job with no recorded owner was handed to whoever asked")
	}
}

// The board must never publish the owner, or the sealed auction leaks the one
// fact that makes collusion easy: who to talk to.
func TestPublicListingHidesTheOwner(t *testing.T) {
	l := &api.Listing{
		Job: "do-1", Kind: "do", Title: "Swap the motor",
		Owner: "acct_northline", Currency: "usd",
	}
	if l.Public().Owner != "" {
		t.Error("the public board view carries the buyer's account")
	}
}

func newRecorder() *httptest.ResponseRecorder { return httptest.NewRecorder() }
