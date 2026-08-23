package api

import (
	"testing"
	"time"
)

func supplierBoard(t *testing.T, now time.Time) (*Board, *Suppliers) {
	t.Helper()
	sup := NewSuppliers()
	sup.Now = func() time.Time { return now }
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	b.Suppliers = sup
	b.ClaimTTL = time.Hour
	return b, sup
}

func postJobs(t *testing.T, b *Board, now time.Time, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		l := &Listing{
			Job: string(rune('a'+i)) + "-job", Kind: KindDo,
			Title: "Swap the condenser fan motor", Detail: "one rooftop unit",
			Instructions: "Roof access via the north stair.",
			Deliverable:  "A photo of the new motor installed.",
			PayMinor:     24000, Currency: "usd", Slots: 1,
			Expires: now.Add(8 * time.Hour), Posted: now,
		}
		if err := b.Post(l); err != nil {
			t.Fatalf("post: %v", err)
		}
	}
}

// A business with crews must be able to run its crews.
//
// Every operator started at one concurrent job and topped out at three,
// however many vans they had, because the allowance ladder was written for
// anonymous individuals and simply stopped. A vetted contractor was throttled
// exactly like a stranger — which meant the supply that makes a licensed job
// possible at all was the supply this exchange treated worst.
func TestAVettedSupplierCanRunItsCrews(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	b, sups := supplierBoard(t, now)
	postJobs(t, b, now, 6)

	const firm = "acct_northline"
	if _, err := sups.Upsert(firm, Supplier{
		Kind: KindCompany, LegalName: "Northline Mechanical LLC",
	}); err != nil {
		t.Fatal(err)
	}

	// Unvetted, they are treated as anybody else is: one at a time.
	if got := b.allowanceFor(firm); got != 1 {
		t.Errorf("an unvetted supplier may hold %d; strangers start at 1", got)
	}

	// A human checks their licences and cover.
	if err := sups.Vet(firm, "reviewer@lamdis.ai", "licence and COI checked", true); err != nil {
		t.Fatal(err)
	}
	if got := b.allowanceFor(firm); got != VettedStart {
		t.Fatalf("a vetted supplier may hold %d at once, wanted %d", got, VettedStart)
	}

	// And their crews claim against the company, not each as a stranger.
	for _, crew := range []string{"tech_ana", "tech_ben", "tech_cal"} {
		if err := sups.AddMember(firm, crew); err != nil {
			t.Fatal(err)
		}
	}
	for i, crew := range []string{"tech_ana", "tech_ben", "tech_cal"} {
		job := string(rune('a'+i)) + "-job"
		if _, _, err := b.Claim(job, crew); err != nil {
			t.Fatalf("%s could not take %s: %v", crew, job, err)
		}
	}
	done, _, _, _ := b.Standing("tech_ana")
	if done != 0 {
		t.Errorf("standing should be the company's, not the technician's")
	}
}

// Counters must be kept against the same account throughout.
//
// Claim counted against the employer and the lapse path decremented the
// employee, so every abandoned job leaked a seat that never came back. A firm
// would silently lose capacity until it could take nothing at all, with
// nothing in the logs to say why.
func TestSeatsDoNotLeakWhenACrewLapses(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	b, sups := supplierBoard(t, now)
	postJobs(t, b, now, 3)

	const firm = "acct_northline"
	sups.Upsert(firm, Supplier{Kind: KindCompany, LegalName: "Northline Mechanical LLC"})
	sups.Vet(firm, "reviewer", "checked", true)
	sups.AddMember(firm, "tech_ana")

	if _, _, err := b.Claim("a-job", "tech_ana"); err != nil {
		t.Fatal(err)
	}
	if b.claims[firm] != 1 {
		t.Fatalf("the claim was counted against %d seats for the firm", b.claims[firm])
	}

	// The crew never submits and the lease runs out.
	later := now.Add(2 * time.Hour)
	b.Now = func() time.Time { return later }
	sups.Now = func() time.Time { return later }
	b.ExpireLapsedClaims()

	if b.claims[firm] != 0 {
		t.Errorf("after the lapse the firm still holds %d seats; the seat leaked "+
			"and will never come back", b.claims[firm])
	}
	if b.abandoned[firm] != 1 {
		t.Errorf("the lapse was recorded against %d, not the firm", b.abandoned[firm])
	}
}

// A supplier must not be able to vouch for itself.
func TestASupplierCannotVetItself(t *testing.T) {
	sups := NewSuppliers()
	got, err := sups.Upsert("acct_x", Supplier{
		Kind: KindCompany, LegalName: "Anybody LLC", Vetted: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Vetted {
		t.Fatal("a supplier marked itself vetted; the raised ceiling rests on " +
			"that flag meaning a human checked something")
	}
}

// Editing a licence must drop its verification, or a vetted number can be
// swapped for an unchecked one.
func TestChangingALicenceDropsItsVerification(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	sups := NewSuppliers()
	sups.Now = func() time.Time { return now }
	sups.Upsert("acct_x", Supplier{Kind: KindCompany, LegalName: "Northline LLC",
		Licences: []Licence{{Skill: "hvac", Number: "M-4471", State: "CA"}}})
	if err := sups.VerifyLicence("acct_x", "hvac", "M-4471", true); err != nil {
		t.Fatal(err)
	}

	got, _ := sups.Upsert("acct_x", Supplier{Kind: KindCompany, LegalName: "Northline LLC",
		Licences: []Licence{{Skill: "hvac", Number: "M-9999", State: "CA"}}})
	if got.Licences[0].Verified {
		t.Fatal("a different licence number kept the old verification")
	}
}

// One person, one employer: otherwise a lapse damages an ambiguous record.
func TestAPersonWorksForOneSupplier(t *testing.T) {
	sups := NewSuppliers()
	sups.Upsert("firm_a", Supplier{Kind: KindCompany, LegalName: "A LLC"})
	sups.Upsert("firm_b", Supplier{Kind: KindCompany, LegalName: "B LLC"})
	if err := sups.AddMember("firm_a", "tech_ana"); err != nil {
		t.Fatal(err)
	}
	if err := sups.AddMember("firm_b", "tech_ana"); err == nil {
		t.Fatal("one technician now works for two firms; whose record does a " +
			"lapse damage?")
	}
}

// The seat belongs to the person even when the count belongs to the firm.
//
// Attributing everything to the employer was the obvious first fix and it
// broke the technician: their own console showed nothing in flight, because
// the job was recorded as held by the company. Two crews also could not take
// two slots of the same job, since one account may hold only one seat on it.
func TestATechnicianStillHoldsTheirOwnWork(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	b, sups := supplierBoard(t, now)

	const firm = "acct_northline"
	sups.Upsert(firm, Supplier{Kind: KindCompany, LegalName: "Northline LLC"})
	sups.Vet(firm, "reviewer", "checked", true)
	sups.AddMember(firm, "tech_ana")
	sups.AddMember(firm, "tech_ben")

	// A job two crews can work.
	if err := b.Post(&Listing{
		Job: "roof", Kind: KindDo, Title: "Swap two rooftop motors",
		Detail: "two units", Instructions: "North stair.", Deliverable: "photos",
		PayMinor: 40000, Currency: "usd", Slots: 2,
		Expires: now.Add(8 * time.Hour), Posted: now,
	}); err != nil {
		t.Fatal(err)
	}

	b.SeedStanding("tech_ana", 20, 0)
	b.SeedStanding("tech_ben", 20, 0)
	if _, _, err := b.Claim("roof", "tech_ana"); err != nil {
		t.Fatalf("first crew: %v", err)
	}
	if _, _, err := b.Claim("roof", "tech_ben"); err != nil {
		t.Fatalf("second crew from the same firm could not take the second slot: %v", err)
	}

	// Each technician sees the work they are actually holding.
	for _, crew := range []string{"tech_ana", "tech_ben"} {
		held := b.HeldBy(crew)
		if len(held) != 1 || held[0].Job != "roof" {
			t.Errorf("%s holds %+v; their own console would show nothing", crew, held)
		}
	}
	// And the firm is counted for two, not one.
	if b.claims[firm] != 2 {
		t.Errorf("the firm is counted as holding %d, wanted 2", b.claims[firm])
	}
}

// A licence has to be worth something, or carrying one is a competitive
// disadvantage.
//
// The Licensed flag was metadata and nothing checked it, so a firm paying for
// a state licence, bonding and cover competed on level terms with anyone who
// ticked the box — and lost sealed-bid work to them, because the underbidder
// carried none of the cost.
func TestLicensedWorkNeedsAVerifiedLicence(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	b, sups := supplierBoard(t, now)
	caps := NewCapacities()
	b.Capacities = caps

	if err := b.Post(&Listing{
		Job: "hvac-1", Kind: KindDo, Title: "Swap the condenser fan motor",
		Detail: "one rooftop unit", Instructions: "North stair.",
		Deliverable: "photo of the nameplate",
		Skills:      []Skill{"hvac"},
		PayMinor:    24000, Currency: "usd", Slots: 2,
		Expires: now.Add(8 * time.Hour), Posted: now,
	}); err != nil {
		t.Fatal(err)
	}
	takesHVAC := Capacity{
		MaxConcurrent: 5, RangeMiles: 30, Accepting: true,
		Kinds: []string{"do"}, Skills: []Skill{"hvac"},
	}

	// Somebody who merely ticked the box.
	caps.Set("chancer", takesHVAC)
	if _, _, err := b.Claim("hvac-1", "chancer"); err == nil {
		t.Fatal("an unlicensed claimant took licensed work by ticking a box")
	}

	// A firm whose licence a human checked on the register.
	const firm = "acct_northline"
	caps.Set(firm, takesHVAC)
	sups.Upsert(firm, Supplier{Kind: KindCompany, LegalName: "Northline LLC",
		Licences: []Licence{{Skill: "hvac", Number: "M-4471", State: "CA",
			Expires: now.AddDate(1, 0, 0)}}})
	b.SeedStanding(firm, 20, 0)
	if _, _, err := b.Claim("hvac-1", firm); err == nil {
		t.Fatal("a claimed but unverified licence was accepted")
	}
	if err := sups.VerifyLicence(firm, "hvac", "M-4471", true); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("hvac-1", firm); err != nil {
		t.Fatalf("a verified licence holder was refused: %v", err)
	}
}

// An expired licence is not a licence.
func TestAnExpiredLicenceStopsCounting(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	sups := NewSuppliers()
	sups.Now = func() time.Time { return now }
	sups.Upsert("firm", Supplier{Kind: KindCompany, LegalName: "N LLC",
		Licences: []Licence{{Skill: "hvac", Number: "M-1", State: "CA",
			Expires: now.AddDate(0, 0, -1)}}})
	sups.VerifyLicence("firm", "hvac", "M-1", true)
	if sups.HoldsLicence("firm", "hvac", now) {
		t.Fatal("a licence that expired yesterday still counts")
	}
}
