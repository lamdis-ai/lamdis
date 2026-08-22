package api

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// A ceiling a bidder can see is a ceiling every bid lands on. It leaked twice
// — as pay_minor and as max_bid_minor — which turned an auction into a posted
// price and cost the buyer the whole difference.
func TestBidCeilingNeverLeaves(t *testing.T) {
	l := &Listing{
		Job: "lawn", Kind: KindDo, Title: "mow the lawn",
		// Scope is public: nobody can price a job they cannot see the size of.
		Detail: "cut both lawns, front and back, roughly 40 feet each",
		// Access is not. These are different questions and they used to share
		// a field, which is how gate codes reached an open endpoint.
		Instructions: "Gate code 4471, mower is in the shed",
		Where:        "812 Marlow Street",
		Area:         "Marlow Street area",
		Pricing:      PriceBids, MaxBidMinor: 8000, PayMinor: 8000, BonusMinor: 500,
		Currency: "USD", Slots: 1, Expires: time.Now().Add(time.Hour),
	}
	b, err := json.Marshal(l.Public())
	if err != nil {
		t.Fatal(err)
	}
	got := string(b)
	// 8000 in any field at all would tell a bidder what to ask for.
	if strings.Contains(got, "8000") {
		t.Fatalf("the ceiling is visible to bidders: %s", got)
	}
	for _, field := range []string{"max_bid_minor", "pay_minor", "bonus_minor"} {
		if strings.Contains(got, field) {
			t.Fatalf("%s is published on an open job: %s", field, got)
		}
	}
	// What a bidder does need is still there: without the scope, nobody can
	// price the work and the auction is guesswork.
	for _, field := range []string{"mow the lawn", "cut both lawns", "bids_close_at",
		"Marlow Street area"} {
		if !strings.Contains(got, field) {
			t.Fatalf("a bidder cannot see %q: %s", field, got)
		}
	}
	// And what nobody bidding is entitled to yet.
	for _, secret := range []string{"4471", "812 Marlow Street", "shed"} {
		if strings.Contains(got, secret) {
			t.Fatalf("the open board publishes %q: %s", secret, got)
		}
	}
}

// A fixed-price job must still show its price, or nobody knows what taking it
// is worth.
func TestFixedPriceIsStillPublished(t *testing.T) {
	l := &Listing{
		Job: "obs", Kind: KindObserve, Title: "is the sign up",
		PayMinor: 500, BonusMinor: 1800, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	b, _ := json.Marshal(l.Public())
	got := string(b)
	if !strings.Contains(got, "500") || !strings.Contains(got, "1800") {
		t.Fatalf("a fixed price is not published: %s", got)
	}
}

// The board must serve the redacted view, not the stored one. Redacting in the
// type and forgetting at the handler is the classic way this leaks anyway.
func TestBoardServesTheRedactedView(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	if err := b.Post(&Listing{
		Job: "lawn", Kind: KindDo, Title: "mow", Instructions: "cut",
		Pricing: PriceBids, MaxBidMinor: 8000, PayMinor: 8000,
		Currency: "USD", Slots: 1, Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	_, body := do(t, srv, "GET", "/v1/board", nil, nil)
	if strings.Contains(string(body), "8000") {
		t.Fatalf("the board published the ceiling: %s", body)
	}
}
