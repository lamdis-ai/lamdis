package api

import (
	"strings"
	"testing"
	"time"
)

func thousandDollarJob(now time.Time) *Listing {
	return &Listing{
		Job: "do-big", Kind: KindDo,
		Title:        "Clear and re-turf the back garden",
		Instructions: "Strip the old turf, level, and lay new. Photograph each stage.",
		Deliverable:  "The finished lawn, code legible in shot.",
		Where:        "812 Marlow Street", Area: "Detroit, MI",
		PayMinor: 100000, Currency: "USD", Slots: 1,
		Stages: []Stage{
			{Name: "Strip and level", Deliverable: "old turf up, ground level", PayMinor: 30000},
			{Name: "Turf delivered", Deliverable: "delivery ticket", PayMinor: 25000, Materials: true},
			{Name: "Lay and finish", Deliverable: "lawn laid, edges cut", PayMinor: 45000},
		},
		Expires: now.Add(14 * 24 * time.Hour), Posted: now,
	}
}

// The attack the buyer is actually afraid of: a fresh account takes an
// expensive job, submits something that clears the checks, and disappears.
//
// The photograph is not what stops this and never was. What stops it is that
// the account could not take the job in the first place.
func TestAStrangerCannotTakeAThousandDollarJob(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	if err := b.Post(thousandDollarJob(now)); err != nil {
		t.Fatalf("post: %v", err)
	}

	if _, _, err := b.Claim("do-big", "brand-new"); err == nil {
		t.Fatal("an account with no record took a thousand-dollar job")
	} else if !strings.Contains(err.Error(), "record") {
		t.Errorf("the refusal does not explain itself: %v", err)
	}

	// Somebody who has done the work to get there can.
	b.SeedStanding("proven", 12, 0)
	if _, _, err := b.Claim("do-big", "proven"); err != nil {
		t.Fatalf("an established account was refused: %v", err)
	}
}

// Fraud has to cost more than it pays, so one rejection for fabricated
// evidence takes the ceiling away rather than costing a warning.
func TestFabricatedEvidenceCollapsesTheCeiling(t *testing.T) {
	good := Standing{Settled: 40, Abandoned: 0}
	if ValueCeiling(good) < EstablishedCeilingMinor {
		t.Fatalf("a clean record does not reach the established ceiling")
	}
	caught := good
	caught.Rejected = 1
	if got := ValueCeiling(caught); got != ShakenCeilingMinor {
		t.Errorf("after one fabrication the ceiling is %d, want %d",
			got, ShakenCeilingMinor)
	}
	// Even a vetted business. Vetting is a claim about licences and cover, not
	// a licence to submit fake photographs.
	vetted := Standing{Settled: 40, Vetted: true, Rejected: 1}
	if got := ValueCeiling(vetted); got != ShakenCeilingMinor {
		t.Errorf("a vetted business kept %d after fabricating evidence", got)
	}
}

// Exposure is counted across everything held at once, or three medium jobs are
// the same attack as one large one and nothing sees it.
func TestExposureIsCountedAcrossEverythingHeld(t *testing.T) {
	s := Standing{Settled: 12} // established: $1,200
	if err := CheckExposure(s, 0, 100000); err != nil {
		t.Fatalf("one job inside the ceiling was refused: %v", err)
	}
	if err := CheckExposure(s, 100000, 100000); err == nil {
		t.Error("a second job taking them over the ceiling was allowed")
	}
}

// A staged job risks the stage in front of them, not the whole contract: the
// earlier stages are already evidenced and paid.
func TestStagingBoundsWhatIsAtRisk(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	l := thousandDollarJob(now)
	if got := l.AtRiskMinor(); got != 45000 {
		t.Errorf("at risk is %d, want the largest stage 45000", got)
	}
	flat := *l
	flat.Stages = nil
	if got := flat.AtRiskMinor(); got != 100000 {
		t.Errorf("an unstaged job risks %d, want the whole 100000", got)
	}
}

// Above the threshold a job may not settle in one lump — but how it breaks
// down is the operator's business, not ours.
func TestLargeJobsMustNotSettleInOneLump(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	l := thousandDollarJob(now)
	l.Stages = nil
	if err := RequireStaging(l); err == nil {
		t.Error("a thousand-dollar job was allowed to settle on one photograph")
	}

	// Letting the winner propose the breakdown satisfies it, because that is
	// the same protection arrived at from the other side.
	l.PlanBy = PlanBySupplier
	if err := RequireStaging(l); err != nil {
		t.Errorf("supplier-planned work was refused: %v", err)
	}

	// And we do not second-guess the shape of somebody else's plan. A stage
	// worth most of the job is their call and their customer's.
	l.PlanBy = ""
	l.Stages = []Stage{
		{Name: "Everything but the last bit", Deliverable: "x", PayMinor: 95000},
		{Name: "Snagging", Deliverable: "y", PayMinor: 5000},
	}
	if err := RequireStaging(l); err != nil {
		t.Errorf("the exchange second-guessed an operator's own staging: %v", err)
	}

	// Small work is unchanged.
	small := &Listing{Job: "s", Kind: KindTask, Title: "t", PayMinor: 2000, Currency: "USD"}
	if err := RequireStaging(small); err != nil {
		t.Errorf("an ordinary errand was made complicated: %v", err)
	}
}
