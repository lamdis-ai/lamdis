package api

import (
	"testing"
	"time"
)

func enterpriseBoard(t *testing.T, now time.Time) (*Board, *Suppliers, *Capacities) {
	t.Helper()
	sup := NewSuppliers()
	sup.Now = func() time.Time { return now }
	caps := NewCapacities()
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	b.Suppliers, b.Capacities = sup, caps
	return b, sup, caps
}

func directedJob(now time.Time, to string) *Listing {
	return &Listing{
		Job: "hvac-214", Kind: KindDo,
		Title:        "Rooftop unit 3 is serviced and running",
		Detail:       "annual service, one unit",
		Instructions: "Roof access via the north stair.",
		Deliverable:  "Photo of the service tag.",
		Where:        "1400 Retail Row", Area: "Store 214",
		DirectedTo: []string{to},
		PayMinor:   48000, Currency: "usd", Slots: 1,
		SiteID: "store-214", Reference: "PO-88431",
		Expires: now.Add(48 * time.Hour), Posted: now,
	}
}

// Work a buyer assigned to their own vendor is not a market event.
//
// The exchange was an open spot market and nothing else, so the largest reason
// a company with an existing vendor book would arrive — already-approved
// supply doing already-priced work — was the one thing it could not carry.
func TestDirectedWorkReachesOnlyTheNamedVendor(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b, _, caps := enterpriseBoard(t, now)
	if err := b.Post(directedJob(now, "acme")); err != nil {
		t.Fatal(err)
	}
	takes := Capacity{MaxConcurrent: 5, RangeMiles: 40, Accepting: true,
		Kinds: []string{"do"}}
	caps.Set("acme", takes)
	caps.Set("stranger", takes)

	if _, _, err := b.Claim("hvac-214", "stranger"); err == nil {
		t.Fatal("a stranger took work assigned to somebody else's vendor")
	}
	if _, _, err := b.Claim("hvac-214", "acme"); err != nil {
		t.Fatalf("the named vendor could not take their own work: %v", err)
	}
}

// A directed job must not appear on the open board at all.
//
// Publishing it wastes every other operator's attention and tells the world
// who this buyer works with, which is a commercial relationship rather than a
// listing.
func TestDirectedWorkIsNotPublished(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b, _, caps := enterpriseBoard(t, now)
	b.Post(directedJob(now, "acme"))
	caps.Set("stranger", Capacity{MaxConcurrent: 5, RangeMiles: 40,
		Accepting: true, Kinds: []string{"do"}})

	for _, l := range b.ForOperator("stranger", caps.Get("stranger")) {
		if l.Job == "hvac-214" {
			t.Fatal("a stranger's queue offered work directed to another vendor")
		}
	}
	// And the vendor does see it.
	caps.Set("acme", caps.Get("stranger"))
	var found bool
	for _, l := range b.ForOperator("acme", caps.Get("acme")) {
		if l.Job == "hvac-214" {
			found = true
		}
	}
	if !found {
		t.Error("the named vendor's own queue did not show their work")
	}
}

// A buyer's insurance requirement has to be enforced against verified cover,
// not against a claim.
func TestInsuranceRequirementIsEnforced(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b, sups, caps := enterpriseBoard(t, now)
	l := directedJob(now, "acme")
	l.DirectedTo = nil // open work, but with a floor
	l.Requires = &Requirements{InsuredToMinor: 200000000}
	b.Post(l)
	caps.Set("acme", Capacity{MaxConcurrent: 5, RangeMiles: 40,
		Accepting: true, Kinds: []string{"do"}})

	// No cover recorded.
	sups.Upsert("acme", Supplier{Kind: KindCompany, LegalName: "Acme Mechanical"})
	if _, _, err := b.Claim("hvac-214", "acme"); err == nil {
		t.Fatal("somebody with no cover took work that required it")
	}

	// Claimed but unverified cover is still not cover.
	sups.Upsert("acme", Supplier{Kind: KindCompany, LegalName: "Acme Mechanical",
		Insurance: &Insurance{Carrier: "X", PolicyNumber: "P1",
			CoverageMinor: 200000000, Currency: "usd",
			Expires: now.AddDate(1, 0, 0)}})
	if _, _, err := b.Claim("hvac-214", "acme"); err == nil {
		t.Fatal("unverified cover satisfied a requirement")
	}
}

// The vendor book is the buyer's, and approval is theirs to withdraw.
func TestOnlyApprovedVendorsCanBeDirectedWork(t *testing.T) {
	book := NewBook()
	if book.IsApproved("retailer", "acme") {
		t.Fatal("an unknown supplier counted as approved")
	}
	book.Approve("retailer", Vendor{Supplier: "acme", Label: "Acme Mechanical",
		Approved: true, Rates: map[string]int64{"HVAC Service": 48000}})
	if !book.IsApproved("retailer", "acme") {
		t.Fatal("an approved vendor did not count")
	}
	// Another buyer's book is their own.
	if book.IsApproved("someone-else", "acme") {
		t.Fatal("one buyer's approval leaked into another's book")
	}
	// Rates are normalised so a buyer's own casing does not matter.
	v, _ := book.Vendor("retailer", "acme")
	if r, ok := v.Rate("hvac service"); !ok || r != 48000 {
		t.Errorf("agreed rate came back as %d (%v)", r, ok)
	}
	if err := book.Revoke("retailer", "acme"); err != nil {
		t.Fatal(err)
	}
	if book.IsApproved("retailer", "acme") {
		t.Error("a revoked vendor is still approved")
	}
}

// Sites let one instruction cover many locations.
func TestSitesCarryPlaceAndAccess(t *testing.T) {
	book := NewBook()
	if _, err := book.PutSite("retailer", Site{ID: "", Where: "x"}); err == nil {
		t.Error("a site with no id was accepted; it could never be referred to again")
	}
	if _, err := book.PutSite("retailer", Site{ID: "store-214"}); err == nil {
		t.Error("a site with no address was accepted")
	}
	s, err := book.PutSite("retailer", Site{
		ID: "store-214", Name: "Store 214", Where: "1400 Retail Row",
		Area: "North side", LatE7: 423314000, LonE7: -830458000, RadiusM: 120,
		Access: "Roof access via the north stair. Alarm code with the manager.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if s.Access == "" || s.Where == "" {
		t.Fatal("the site lost its access notes or address")
	}
	if len(book.Sites("retailer")) != 1 {
		t.Error("the site list is empty after adding one")
	}
}
