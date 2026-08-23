package api

import (
	"testing"
	"time"
)

func pavingJob(now time.Time) *Listing {
	return &Listing{
		Job: "drive-1", Kind: KindDo,
		Title:  "The driveway at the address is paved and open to traffic",
		Detail: "roughly 900 square feet, existing surface to come up",
		Where:  "812 Marlow Street", Area: "Marlow Street area",
		Instructions: "Access from the alley. Skip goes on the verge.",
		Deliverable:  "Photographs of the finished surface.",
		WorkHours:    72,
		PayMinor:     1200000, Currency: "usd", Slots: 1,
		Stages: []Stage{
			{Name: "Materials", Deliverable: "the delivery ticket for the asphalt",
				PayMinor: 400000, Materials: true},
			{Name: "Prep", Deliverable: "the old surface removed and the base graded",
				PayMinor: 300000},
			{Name: "Base course", Deliverable: "the base course laid and rolled",
				PayMinor: 250000},
			{Name: "Surface", Deliverable: "the finished surface, rolled and edged",
				PayMinor: 250000},
		},
		Expires: now.Add(14 * 24 * time.Hour), Posted: now,
	}
}

// A three-day job must not lapse forty-five minutes in.
//
// The lease was a fixed forty-five minutes with no per-job override, so a
// paving crew lost the job they were standing on: the listing went back on the
// board, the firm was recorded as having abandoned it, and the whole company
// went into cooldown. Three of those dropped a vetted supplier's ceiling to
// three concurrent jobs — a penalty for doing the work.
func TestALongJobKeepsItsLease(t *testing.T) {
	now := time.Date(2026, 8, 21, 8, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	b.ClaimTTL = 45 * time.Minute

	job := pavingJob(now)
	if err := b.Post(job); err != nil {
		t.Fatal(err)
	}
	if err := b.SeedVetted("calder"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("drive-1", "calder"); err != nil {
		t.Fatal(err)
	}

	// Two hours in, mid-prep.
	later := now.Add(2 * time.Hour)
	b.Now = func() time.Time { return later }
	b.ExpireLapsedClaims()

	held := b.HeldBy("calder")
	if len(held) != 1 {
		t.Fatalf("the crew lost a 72-hour job after two hours: %+v", held)
	}
	if _, ab, _, _ := b.Standing("calder"); ab != 0 {
		t.Errorf("recorded %d abandonments against a crew that is still working", ab)
	}
}

// Stages have to add up to the price, or the buyer and the crew disagree about
// what the job costs and the record cannot settle it.
func TestStagesMustAddUpToThePrice(t *testing.T) {
	now := time.Now()
	l := pavingJob(now)
	l.Stages[0].PayMinor = 1
	if err := l.ValidateStages(); err == nil {
		t.Fatal("a job whose stages do not sum to its price was accepted")
	}
	l.Stages[0].PayMinor = 400000
	if err := l.ValidateStages(); err != nil {
		t.Fatalf("a correct staged job was refused: %v", err)
	}
}

// Each stage is submitted and paid separately, in order, and the seat is held
// until the last one.
func TestStagesRunInOrderAndHoldTheSeat(t *testing.T) {
	now := time.Date(2026, 8, 21, 8, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	if err := b.Post(pavingJob(now)); err != nil {
		t.Fatal(err)
	}
	if err := b.SeedVetted("calder"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("drive-1", "calder"); err != nil {
		t.Fatal(err)
	}

	want := []string{"Materials", "Prep", "Base course", "Surface"}
	for i, name := range want {
		idx, st, all := b.NextStage("drive-1", "calder")
		if all {
			t.Fatalf("job reported finished before %s", name)
		}
		if st.Name != name || idx != i {
			t.Fatalf("stage %d is %q, wanted %q", idx, st.Name, name)
		}
		if err := b.Progress("drive-1", "calder", idx); err != nil {
			t.Fatal(err)
		}
		// The seat stays theirs until the whole job is done.
		if i < len(want)-1 && len(b.HeldBy("calder")) != 1 {
			t.Fatalf("the seat was released after %s, mid-job", name)
		}
	}
	if _, _, all := b.NextStage("drive-1", "calder"); !all {
		t.Error("every stage is done and the job does not report finished")
	}
}

// Reporting progress must extend the lease, because somebody working is the
// opposite of somebody who has walked away.
func TestProgressKeepsTheLeaseAlive(t *testing.T) {
	now := time.Date(2026, 8, 21, 8, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	job := pavingJob(now)
	job.WorkHours = 8
	if err := b.Post(job); err != nil {
		t.Fatal(err)
	}
	if err := b.SeedVetted("calder"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("drive-1", "calder"); err != nil {
		t.Fatal(err)
	}

	// Seven hours in they finish the materials stage.
	at := now.Add(7 * time.Hour)
	b.Now = func() time.Time { return at }
	if err := b.Progress("drive-1", "calder", 0); err != nil {
		t.Fatal(err)
	}

	// Well past the original lease, still theirs.
	b.Now = func() time.Time { return now.Add(12 * time.Hour) }
	b.ExpireLapsedClaims()
	if len(b.HeldBy("calder")) != 1 {
		t.Fatal("a crew that reported progress still lost the job")
	}
}

// A job with no stages behaves exactly as it always did.
func TestAnUnstagedJobIsUnchanged(t *testing.T) {
	now := time.Date(2026, 8, 21, 8, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	b.ClaimTTL = 45 * time.Minute
	l := &Listing{
		Job: "obs-1", Kind: KindObserve, Title: "is the sign up",
		PayMinor: 500, Currency: "usd", Slots: 1,
		Expires: now.Add(6 * time.Hour), Posted: now,
	}
	if err := b.Post(l); err != nil {
		t.Fatal(err)
	}
	if got := l.LeaseFor(45 * time.Minute); got != 45*time.Minute {
		t.Errorf("an errand's lease became %v", got)
	}
	if l.Staged() {
		t.Error("a job with no stages reported itself staged")
	}
}
