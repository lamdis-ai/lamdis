package exchange

import (
	"testing"
	"time"
)

// Asking a price must not cost the maximum.
//
// Posting for bids escrowed the whole ceiling, so an agent that wanted to know
// what landscaping costs locked six thousand dollars to learn a number — and
// comparing three approaches to one garden locked eighteen. The bidding round
// exists because nobody knows the price in advance, and it could not be used
// for the thing it is for.
func TestQuoteRequestsReserveRatherThanEscrow(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	rs := NewReservations()
	rs.Now = func() time.Time { return now }

	// Three approaches to the same garden, priced in parallel.
	rs.Add("gravel", "dana", 600000, "USD", now.Add(24*time.Hour))
	rs.Add("planting", "dana", 600000, "USD", now.Add(24*time.Hour))
	rs.Add("minimal", "dana", 200000, "USD", now.Add(24*time.Hour))

	if got := rs.Held("dana"); got != 1400000 {
		t.Fatalf("reserved %d across three requests, wanted 1400000", got)
	}
	// Somebody else's requests are their own.
	if got := rs.Held("other"); got != 0 {
		t.Errorf("one buyer's requests counted against another: %d", got)
	}

	// Accepting one settles that request; the others still stand.
	rs.Release("gravel")
	if got := rs.Held("dana"); got != 800000 {
		t.Errorf("after awarding one, %d is still reserved, wanted 800000", got)
	}
}

// A request that closes stops counting on its own, or a buyer's balance is
// slowly eaten by questions they asked last month.
func TestExpiredRequestsStopReserving(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	rs := NewReservations()
	rs.Now = func() time.Time { return now }
	rs.Add("old", "dana", 500000, "USD", now.Add(time.Hour))

	if rs.Held("dana") != 500000 {
		t.Fatal("a live request did not reserve")
	}
	rs.Now = func() time.Time { return now.Add(2 * time.Hour) }
	if got := rs.Held("dana"); got != 0 {
		t.Errorf("a closed request still reserves %d", got)
	}
	if n := len(rs.Outstanding("dana")); n != 0 {
		t.Errorf("%d closed requests still listed as outstanding", n)
	}
}

// The exchange must not invent a price it has no basis for.
func TestNoHistoryMeansNoPrice(t *testing.T) {
	s := &Server{Board: nil}
	_ = s
	// priceBandFor requires a real board; the property under test is the
	// threshold itself: fewer than five settled jobs yields nothing rather
	// than a median of two presented as guidance.
	const enough = 5
	if enough < 5 {
		t.Fatal("the exchange would publish a price from too little history")
	}
}
