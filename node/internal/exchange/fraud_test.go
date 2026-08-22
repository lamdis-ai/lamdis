package exchange

import (
	"strings"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

// One photograph must not pay a whole job.
//
// Every stage of a job shared a single dedupe identity, and the reuse corpus
// deliberately skips a match whose EntryID equals the incoming one — so a
// byte-identical file submitted for prep, base and surface was not merely
// undetected, it was ignored by design. Exact hash, perceptual hash and mirror
// hash all passed it through.
func TestEachStageIsItsOwnEvidence(t *testing.T) {
	base := api.Submission{Job: "drive-1", Holder: "cap-abc"}
	seen := map[string]bool{}
	for stage := 0; stage < 4; stage++ {
		s := base
		s.Stage = stage
		id := submissionID(s)
		if seen[id] {
			t.Fatalf("stage %d shares a reuse identity with an earlier stage (%q); "+
				"the same photograph would satisfy both", stage, id)
		}
		seen[id] = true
	}
	// A different holder on the same stage is still distinct.
	other := base
	other.Holder = "cap-xyz"
	if submissionID(other) == submissionID(base) {
		t.Error("two crews share a reuse identity")
	}
}

// A tier is a promise about what the evidence supports. It has to bite.
//
// checkGeofence returns cleanly when nothing carries a location, and a comment
// claimed that "caps what the evidence can prove". Nothing capped anything, so
// stripping metadata turned a V2 job into an unfenced one and a photograph of
// any driveway on earth would do.
func TestStrippedMetadataCannotSatisfyAFencedTier(t *testing.T) {
	stripped := api.Submission{
		Tier:      "V2",
		Artifacts: []api.Artifact{{SHA256: "a", Kind: "image"}},
	}
	err := checkProvenance(&stripped)
	if err == nil {
		t.Fatal("a photograph carrying neither a time nor a place satisfied V2")
	}
	if !strings.Contains(err.Error(), "location") {
		t.Errorf("the refusal does not tell the worker how to fix it: %v", err)
	}

	// With capture metadata it passes.
	withGeo := stripped
	withGeo.Artifacts = []api.Artifact{{SHA256: "a", Kind: "image", HasGeo: true}}
	if err := checkProvenance(&withGeo); err != nil {
		t.Errorf("a located photograph was refused: %v", err)
	}
	withTime := stripped
	withTime.Artifacts = []api.Artifact{{SHA256: "a", Kind: "image",
		CapturedAt: time.Now()}}
	if err := checkProvenance(&withTime); err != nil {
		t.Errorf("a timestamped photograph was refused: %v", err)
	}

	// A tier that never claimed provenance is unaffected.
	v1 := stripped
	v1.Tier = "V1"
	if err := checkProvenance(&v1); err != nil {
		t.Errorf("V1 was held to a V2 standard: %v", err)
	}
}

// The attempt fee is for a wasted trip, and a trip is wasted once.
//
// The staged path paid the job's attempt fee per stage, and an attempted
// submission proves presence — so it advanced the stage and the next one could
// be attempted too. Four stages, one visit, four fees.
func TestTheAttemptFeeIsPaidOnce(t *testing.T) {
	s := &Server{submissions: map[string][]api.Submission{}}
	s.submissions["drive-1"] = []api.Submission{
		{Job: "drive-1", Holder: "cap-abc", Stage: 0, Attempted: true, Verified: true},
	}
	second := api.Submission{Job: "drive-1", Holder: "cap-abc", Stage: 1,
		Attempted: true, Verified: true}
	if !s.alreadyAttempted("drive-1", second) {
		t.Fatal("a second stage would be paid another attempt fee for the same visit")
	}
	// A different crew has its own trip to waste.
	otherCrew := api.Submission{Job: "drive-1", Holder: "cap-xyz", Stage: 1,
		Attempted: true, Verified: true}
	if s.alreadyAttempted("drive-1", otherCrew) {
		t.Error("one crew's attempt blocked another crew's")
	}
}

// The exact position of somebody's property must not be on an open endpoint.
//
// Removing the street address is undone by publishing the same point to seven
// decimal places, which is about a centimetre.
func TestTheBoardDoesNotPublishCoordinates(t *testing.T) {
	l := &api.Listing{
		Job: "do-1", Kind: api.KindDo, Title: "The bins are back",
		Where: "812 Marlow Street", Area: "Marlow Street area",
		LatE7: 377801000, LonE7: -1224151000, RadiusM: 120,
		Currency: "usd",
	}
	p := l.Public()
	if p.LatE7 != 0 || p.LonE7 != 0 || p.RadiusM != 0 {
		t.Fatalf("the open board publishes the property's position: %d,%d r%d",
			p.LatE7, p.LonE7, p.RadiusM)
	}
	if p.Area == "" {
		t.Error("nothing is left to judge whether the job is worth travelling to")
	}
}

// An attempt is a claim about the world and has to be evidenced like one.
//
// The worker's stated reason was stored, shown to the buyer, and never judged,
// so "the gate was padlocked" and "nope" paid identically: presence plus an
// arbitrary sentence collected the attempt fee.
func TestTheAttemptPredicateIsFixedNotTheWorkersWords(t *testing.T) {
	// The predicate is the adjudicator's trusted slot. Building it from
	// submitter-supplied prose would hand a submitter the instruction channel,
	// which is the one thing the blind-describe design exists to prevent.
	if strings.Contains(attemptPredicate, "%s") ||
		strings.Contains(attemptPredicate, "%v") {
		t.Fatal("the attempt predicate interpolates caller text into the " +
			"adjudicator's trusted slot")
	}
	for _, want := range []string{"obstruction", "prevent"} {
		if !strings.Contains(attemptPredicate, want) {
			t.Errorf("the attempt predicate does not ask about %q, so it does "+
				"not check that anything actually stopped the work", want)
		}
	}
}

// The threshold has to be one that separates the measured sets.
func TestTheSyntheticThresholdSitsInTheMeasuredGap(t *testing.T) {
	const realMax = 0.30       // 18 genuine phone photographs
	const fabricatedMin = 0.45 // qwen diffusion, plain scenes
	if SyntheticThreshold <= realMax {
		t.Errorf("threshold %.2f is at or below the highest genuine photograph "+
			"(%.2f); honest workers would be refused", SyntheticThreshold, realMax)
	}
	if SyntheticThreshold > fabricatedMin {
		t.Errorf("threshold %.2f is above the lowest fabricated image (%.2f); "+
			"a generated photograph would pass", SyntheticThreshold, fabricatedMin)
	}
}

// A geofence the submitter can opt out of is not a fence.
//
// V2 accepted any capture metadata, so a photograph carrying only a timestamp
// satisfied the tier — and checkGeofence then found nothing located and
// returned clean. A picture taken anywhere passed both checks.
func TestAFencedJobRequiresALocatedPhotograph(t *testing.T) {
	fenced := api.Submission{
		Tier: "V2", LatE7: 377849000, LonE7: -1224094000, RadiusM: 150,
		Artifacts: []api.Artifact{{SHA256: "a", Kind: "image",
			CapturedAt: time.Now()}}, // a time, but no place
	}
	if err := checkProvenance(&fenced); err == nil {
		t.Fatal("a timestamp-only photograph satisfied a job tied to a place; " +
			"the geofence would then find nothing to check and pass it")
	}

	located := fenced
	located.Artifacts = []api.Artifact{{SHA256: "a", Kind: "image", HasGeo: true}}
	if err := checkProvenance(&located); err != nil {
		t.Errorf("a located photograph was refused on a fenced job: %v", err)
	}

	// A job with no fence is unaffected: a timestamp still satisfies V2.
	unfenced := fenced
	unfenced.RadiusM = 0
	if err := checkProvenance(&unfenced); err != nil {
		t.Errorf("an unfenced V2 job refused a timestamped photograph: %v", err)
	}
}
