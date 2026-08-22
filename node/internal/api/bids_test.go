package api

import (
	"testing"
	"time"
)

func openJob(t *testing.T, b *Board, job string, ceiling int64) {
	t.Helper()
	if err := b.Post(&Listing{
		Job: job, Kind: KindDo, Title: "mow the lawn at 1306 Kent Rd",
		Instructions: "Cut the front and back, bag the clippings.",
		Where:        "1306 Kent Rd, Ortonville",
		Pricing:      PriceBids, MaxBidMinor: ceiling,
		BidsCloseAt: time.Now().Add(24 * time.Hour),
		PayMinor:    ceiling, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(72 * time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
}

// A buyer who cannot know what a job is worth posts it open and lets the
// people who do know say.
func TestOpenJobCollectsBids(t *testing.T) {
	b := board(t)
	openJob(t, b, "lawn_1", 8000)

	if _, err := b.PlaceBid("lawn_1", "alice", 4500, "USD", "I do this street already", time.Time{}); err != nil {
		t.Fatal(err)
	}
	if _, err := b.PlaceBid("lawn_1", "bob", 3800, "USD", "Can come Saturday", time.Time{}); err != nil {
		t.Fatal(err)
	}
	bids := b.Bids("lawn_1")
	if len(bids) != 2 {
		t.Fatalf("collected %d bids", len(bids))
	}
	if bids[0].Worker != "bob" {
		t.Fatalf("bids are not cheapest first: %s", bids[0].Worker)
	}
	// The note is why somebody picks the dearer bid, so it must survive.
	if bids[1].Note == "" {
		t.Fatal("a bid lost its note")
	}
}

// Revising a bid replaces it. Stacking would let one worker fill the list.
func TestRevisingABidReplacesIt(t *testing.T) {
	b := board(t)
	openJob(t, b, "lawn_1", 8000)
	b.PlaceBid("lawn_1", "alice", 4500, "USD", "first thought", time.Time{})
	b.PlaceBid("lawn_1", "alice", 4000, "USD", "sharper pencil", time.Time{})

	bids := b.Bids("lawn_1")
	if len(bids) != 1 {
		t.Fatalf("one worker left %d bids", len(bids))
	}
	if bids[0].AmountMinor != 4000 {
		t.Fatalf("the revision did not take: %d", bids[0].AmountMinor)
	}
}

// The winning bid becomes the price, so everything downstream reads one number.
func TestAwardSetsThePrice(t *testing.T) {
	b := board(t)
	openJob(t, b, "lawn_1", 8000)
	b.PlaceBid("lawn_1", "alice", 4500, "USD", "", time.Time{})
	b.PlaceBid("lawn_1", "bob", 3800, "USD", "", time.Time{})

	won, err := b.Award("lawn_1", "lawn_1:bob", nil)
	if err != nil {
		t.Fatal(err)
	}
	if won.Worker != "bob" || !won.Won {
		t.Fatalf("awarded %+v", won)
	}
	l, _ := b.Get("lawn_1")
	if l.PayMinor != 3800 {
		t.Fatalf("the job still pays %d, not the winning bid", l.PayMinor)
	}
	if l.Awarded != "bob" {
		t.Fatalf("awarded to %q", l.Awarded)
	}
	// Once awarded it is not awarded again.
	if _, err := b.Award("lawn_1", "lawn_1:alice", nil); err == nil {
		t.Fatal("a job was awarded twice")
	}
}

// A bid above the ceiling cannot be accepted, however good it reads. The
// ceiling is what an open job escrowed against.
func TestBidAboveTheCeilingIsRefused(t *testing.T) {
	b := board(t)
	openJob(t, b, "lawn_1", 5000)
	b.PlaceBid("lawn_1", "alice", 9000, "USD", "premium service", time.Time{})
	if _, err := b.Award("lawn_1", "lawn_1:alice", nil); err == nil {
		t.Fatal("a bid above the buyer's ceiling was accepted")
	}
}

// Awarding must not proceed if the money is not there.
func TestAwardChecksFunding(t *testing.T) {
	b := board(t)
	openJob(t, b, "lawn_1", 8000)
	b.PlaceBid("lawn_1", "alice", 4500, "USD", "", time.Time{})

	broke := func(l *Listing) error { return errUnfunded }
	if _, err := b.Award("lawn_1", "lawn_1:alice", broke); err == nil {
		t.Fatal("a job was awarded with no money behind it")
	}
	l, _ := b.Get("lawn_1")
	if l.Awarded != "" {
		t.Fatal("a failed award still marked the job awarded")
	}
}

// Bidding closes when it says it closes.
func TestBiddingClosesOnTime(t *testing.T) {
	b := board(t)
	if err := b.Post(&Listing{
		Job: "lawn_1", Kind: KindDo, Title: "mow", Instructions: "cut it",
		Pricing: PriceBids, MaxBidMinor: 5000, PayMinor: 5000, Currency: "USD",
		Slots: 1, BidsCloseAt: time.Now().Add(-time.Minute),
		Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := b.PlaceBid("lawn_1", "late", 4000, "USD", "", time.Time{}); err == nil {
		t.Fatal("a bid landed after bidding closed")
	}
}

// A fixed-price job is taken, not bid on. Mixing the two would let somebody
// bid a job down that was already claimed at its posted price.
func TestFixedPriceJobsRefuseBids(t *testing.T) {
	b := board(t)
	listTask(t, b, "task_1", 1)
	if _, err := b.PlaceBid("task_1", "alice", 100, "USD", "", time.Time{}); err == nil {
		t.Fatal("a fixed-price job accepted a bid")
	}
}
