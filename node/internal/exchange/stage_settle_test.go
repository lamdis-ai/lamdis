package exchange

import (
	"testing"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

func stagedPaving() *api.Listing {
	return &api.Listing{
		Job: "drive-1", Kind: api.KindDo, Title: "The driveway is paved",
		PayMinor: 120000, AttemptMinor: 15000, Currency: "usd", Slots: 1,
		Stages: []api.Stage{
			{Name: "Materials", Deliverable: "the delivery ticket",
				PayMinor: 40000, Materials: true},
			{Name: "Prep", Deliverable: "old surface up, base graded", PayMinor: 30000},
			{Name: "Base course", Deliverable: "base laid and rolled", PayMinor: 25000},
			{Name: "Surface", Deliverable: "finished surface", PayMinor: 25000},
		},
	}
}

// Each stage pays when it is evidenced, not when the whole job ends.
//
// Waiting for the last stage left a crew three days and forty tons of asphalt
// out of pocket on work that was already done and already accepted.
func TestEachStagePaysWhenItIsEvidenced(t *testing.T) {
	l := stagedPaving()
	for i, want := range []int64{40000, 30000, 25000, 25000} {
		sub := api.Submission{Stage: i, Verified: true, Finding: true}
		if got := earnedFor(l, sub); got != want {
			t.Errorf("stage %d (%s) paid %d, wanted %d",
				i, l.Stages[i].Name, got, want)
		}
	}
}

// A materials stage must still be evidenced.
//
// It once skipped adjudication on the reasoning that a receipt is not finished
// work — which made it the most exploitable line in the system. Verified means
// only that a challenge code was legible, so a four-thousand-dollar stage paid
// for a photograph of a code card on a kitchen table.
//
// What "materials" changes is what has to be *shown*: the stage is judged
// against its own deliverable, which is a delivery ticket rather than a paved
// driveway. Nothing has to be bypassed to get that.
func TestAMaterialsStageStillHasToBeEvidenced(t *testing.T) {
	l := stagedPaving()
	if got := earnedFor(l, api.Submission{Stage: 0, Verified: true, Finding: false}); got != 0 {
		t.Fatalf("a photograph with a legible code and nothing else paid %d "+
			"for the materials stage", got)
	}
	// With the delivery ticket actually shown, it pays.
	if got := earnedFor(l, api.Submission{Stage: 0, Verified: true, Finding: true}); got != 40000 {
		t.Errorf("an evidenced materials stage paid %d, wanted 40000", got)
	}
	// A labour stage is unchanged.
	if got := earnedFor(l, api.Submission{Stage: 1, Verified: true, Finding: false}); got != 0 {
		t.Errorf("a labour stage paid %d without the work showing", got)
	}
}

// Turning up and photographing the site must not pay a stage.
func TestPresenceAloneStillPaysNothingOnAStage(t *testing.T) {
	l := stagedPaving()
	if got := earnedFor(l, api.Submission{Stage: 3, Verified: true}); got != 0 {
		t.Fatalf("photographing the site paid %d for the surface stage", got)
	}
}

// The stages must never pay out more than the job was sold for.
func TestStagesNeverExceedTheJobPrice(t *testing.T) {
	l := stagedPaving()
	var total int64
	for i := range l.Stages {
		total += earnedFor(l, api.Submission{Stage: i, Verified: true, Finding: true})
	}
	if total != l.PayMinor {
		t.Fatalf("every stage paid totals %d against a job price of %d",
			total, l.PayMinor)
	}
}

// A stage index that does not exist pays nothing rather than the whole job.
func TestAnUnknownStagePaysNothing(t *testing.T) {
	l := stagedPaving()
	if got := earnedFor(l, api.Submission{Stage: 99, Verified: true, Finding: true}); got != 0 {
		t.Fatalf("an out-of-range stage paid %d", got)
	}
}
