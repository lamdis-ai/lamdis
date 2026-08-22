package verify

import (
	"testing"
	"time"
)

// honest is a well-formed submission: bound to a device, captured recently,
// through our own page, with the challenge code visible in the shot.
func honest(id, sha string, phash, mirror uint64, nonce string, now time.Time) Evidence {
	return Evidence{
		EntryID: id, SHA256: sha, MediaType: "image/jpeg", Bytes: 200_000,
		PerceptualHash: phash, MirrorHash: mirror,
		AttestedBy: "device_key", ViaOurPage: true,
		SubmittedAt:   now,
		CapturedAt:    now.Add(-5 * time.Minute),
		Window:        2 * time.Hour,
		NonceExpected: nonce, NonceTranscribed: nonce,
	}
}

func agg(t *testing.T, ev Evidence, c *Corpus, vis VisionVerdict, required Tier) Result {
	t.Helper()
	sig := Deterministic(ev, c)
	sig = append(sig, FromVision(vis)...)
	tier := TierFor(ev, true, false)
	return Aggregate(0.5, sig, tier, required, HasProvenance(ev), DefaultParams())
}

var sawIt = VisionVerdict{Verdict: "satisfied", SelfConfidence: 0.96}

func TestHonestSubmissionIsPaid(t *testing.T) {
	now := time.Now()
	c := NewCorpus()
	ev := honest("e1", "aaa", 0x0123456789abcdef, 0xfedcba9876543210, "K7QM2X", now)
	r := agg(t, ev, c, sawIt, TierV2)
	if !r.Admissible {
		t.Fatalf("an honest submission was refused: %s", r.Explain(9000))
	}
	// 75%, not 90%: a single photograph at V2 tops out around 80%, and asking
	// for more than the tier can deliver is what CheckAchievable exists to
	// refuse at quote time rather than discover at settlement.
	if !r.Satisfied(7500) {
		t.Errorf("expected certification, got %s (p=%.3f)", r.Explain(7500), r.PTrue)
	}
}

func TestUnachievableConfidenceIsRefusedUpFront(t *testing.T) {
	// The exchange must not sell what the evidence cannot deliver.
	if err := CheckAchievable(TierV2, 9900); err == nil {
		t.Error("selling 99% on single-source evidence was allowed")
	}
	if err := CheckAchievable(TierV2, 7000); err != nil {
		t.Errorf("70%% should be sellable: %v", err)
	}

	// Corroboration used to buy 99%. It no longer does, and this test is here
	// to make that a deliberate decision rather than a regression.
	//
	// Two independent sources agreeing is only strong if they are independent.
	// Generated imagery breaks that: one person can produce both, so what used
	// to be corroboration becomes one adversary with two accounts. Until a
	// capture is attested in hardware, no tier can honestly promise 99%.
	if err := CheckAchievable(TierV3, 9900); err == nil {
		t.Error("99% is being sold on evidence that could be two generated images")
	}
	if CaptureAttested {
		t.Error("CaptureAttested is set but nothing parses C2PA or hardware " +
			"attestation; the ladder must not be restored until it does")
	}
}

// Every tier collapses to the same ceiling while capture is unattested,
// because the thing that separated them — independence — is what generated
// imagery removes.
func TestTiersCollapseWithoutCaptureAttestation(t *testing.T) {
	if CaptureAttested {
		t.Skip("capture is attested; the ladder applies")
	}
	for _, tier := range []Tier{TierV1, TierV2, TierV3} {
		if got := tier.Ceiling(false); got != 0.72 {
			t.Errorf("%v without provenance tops out at %.3f, want 0.72", tier, got)
		}
		if got := tier.Ceiling(true); got != 0.85 {
			t.Errorf("%v with provenance tops out at %.3f, want 0.85", tier, got)
		}
	}
}

// TestExactReuseIsFatal covers the fraud that actually happens: a real photo,
// submitted again for a job it was never taken for.
func TestExactReuseIsFatal(t *testing.T) {
	now := time.Now()
	c := NewCorpus()
	first := honest("e1", "aaa", 0x0123456789abcdef, 0xfedcba9876543210, "N1", now)
	if r := agg(t, first, c, sawIt, TierV2); !r.Admissible {
		t.Fatalf("setup: the first submission should be admissible")
	}
	c.Add(first)

	// A different job, the same bytes.
	again := honest("e2", "aaa", 0x0123456789abcdef, 0xfedcba9876543210, "N2", now)
	r := agg(t, again, c, sawIt, TierV2)
	if r.Fatal == "" {
		t.Fatal("resubmitting the identical file was not treated as fatal")
	}
	if r.Admissible || r.Decision != DecisionReject {
		t.Errorf("a reused photo was admitted: %+v", r.Decision)
	}
}

// TestNearDuplicateIsRefused covers the evasions measured against a real
// photograph: re-encoding, brightening, downscaling and cropping all leave the
// fingerprint within NearDuplicateBits of the original.
func TestNearDuplicateIsRefused(t *testing.T) {
	now := time.Now()
	base := uint64(0x0123456789abcdef)

	for _, tc := range []struct {
		name  string
		phash uint64
	}{
		{"re-encoded, fingerprint unchanged", base},
		{"lightly perturbed, 4 bits", base ^ 0x0F},
		{"cropped, 12 bits", base ^ 0x0FFF},
		{"at the threshold, 16 bits", base ^ 0xFFFF},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := NewCorpus()
			c.Add(honest("e1", "aaa", base, 0xfedcba9876543210, "N1", now))
			// Different bytes, so the exact-hash check cannot catch it.
			ev := honest("e2", "bbb", tc.phash, 0xfedcba9876543210, "N2", now)
			r := agg(t, ev, c, sawIt, TierV2)
			if r.Admissible {
				t.Errorf("a near-duplicate was admitted (p=%.3f, provenance %+.2f)",
					r.PTrue, r.ProvenanceLogit)
			}
		})
	}
}

// TestMirroredReuseIsRefused covers the cheapest evasion of all.
func TestMirroredReuseIsRefused(t *testing.T) {
	now := time.Now()
	orig, mirror := uint64(0x0123456789abcdef), uint64(0xfedcba9876543210)
	c := NewCorpus()
	c.Add(honest("e1", "aaa", orig, mirror, "N1", now))

	// The flipped resubmission: its plain fingerprint is the original's
	// mirror, and vice versa.
	flipped := honest("e2", "bbb", mirror, orig, "N2", now)
	r := agg(t, flipped, c, sawIt, TierV2)
	if r.Admissible {
		t.Errorf("a mirrored resubmission was admitted (p=%.3f)", r.PTrue)
	}
}

func TestGenuinelyDifferentPhotoIsNotFlaggedAsReuse(t *testing.T) {
	now := time.Now()
	c := NewCorpus()
	c.Add(honest("e1", "aaa", 0x0123456789abcdef, 0xfedcba9876543210, "N1", now))
	// 27+ bits apart, which is where real distinct photographs measured.
	other := honest("e2", "bbb", 0x0123456789abcdef^0x7FFFFFF, 0x1111, "N2", now)
	r := agg(t, other, c, sawIt, TierV2)
	if !r.Admissible {
		t.Errorf("a distinct photograph was wrongly refused as reuse: %s", r.Explain(9000))
	}
}

// TestWrongLocationIsRefused: an authentic, fresh, novel photograph of the
// wrong place is still the wrong place.
func TestWrongLocationIsRefused(t *testing.T) {
	now := time.Now()
	ev := honest("e1", "aaa", 1, 2, "N1", now)
	ev.HasGeo = true
	ev.GeoLat, ev.GeoLon = 42.32974, -83.05259 // ~50km away
	ev.TargetLat, ev.TargetLon, ev.RadiusM = 42.84211, -83.42735, 300

	r := agg(t, ev, NewCorpus(), sawIt, TierV2)
	if r.Admissible {
		t.Errorf("a photo from 50km away was admitted (p=%.3f, provenance %+.2f)",
			r.PTrue, r.ProvenanceLogit)
	}
}

// TestInjectionIsFatal: attacking the verifier must be strictly worse than
// failing honestly, or it becomes a free option.
func TestInjectionIsFatal(t *testing.T) {
	now := time.Now()
	ev := honest("e1", "aaa", 1, 2, "N1", now)
	r := agg(t, ev, NewCorpus(), VisionVerdict{
		Verdict: "satisfied", SelfConfidence: 0.99, InjectionDetected: true,
	}, TierV2)
	if r.Fatal == "" || r.Admissible {
		t.Errorf("an injection attempt was not fatal: %+v", r)
	}
}

// TestProvenanceCannotCertifyContent is the bug this suite exists to prevent:
// a perfectly authenticated photograph must not, on the strength of its
// authenticity alone, certify a claim the picture does not support.
func TestProvenanceCannotCertifyContent(t *testing.T) {
	now := time.Now()
	ev := honest("e1", "aaa", 1, 2, "N1", now) // every provenance signal positive
	r := agg(t, ev, NewCorpus(), VisionVerdict{
		Verdict: "not_satisfied", SelfConfidence: 0.93,
	}, TierV2)
	if r.PTrue > 0.35 {
		t.Errorf("impeccable provenance dragged a contradicted claim up to %.3f", r.PTrue)
	}
	if r.Satisfied(9000) {
		t.Error("a claim the photo contradicts was certified")
	}
}

// TestTierIsCappedByEvidence: no amount of model confidence lifts a verdict
// past what the evidence structurally supports.
func TestTierIsCappedByEvidence(t *testing.T) {
	now := time.Now()
	// No nonce, no capture binding: an unbound upload.
	ev := Evidence{
		EntryID: "e1", SHA256: "aaa", MediaType: "image/jpeg", Bytes: 1000,
		PerceptualHash: 7, SubmittedAt: now, AttestedBy: "capability",
	}
	r := agg(t, ev, NewCorpus(), VisionVerdict{Verdict: "satisfied", SelfConfidence: 1.0}, TierV1)
	if r.PTrue > TierV1.Ceiling(false)+1e-9 {
		t.Errorf("p=%.3f exceeds the %.3f ceiling for unbound evidence",
			r.PTrue, TierV1.Ceiling(false))
	}
	if r.Tier != TierV1 {
		t.Errorf("tier = %s, want V1 for an unbound upload", r.Tier)
	}
}

func TestBelowRequestedTierEarnsNothing(t *testing.T) {
	now := time.Now()
	ev := Evidence{ // unbound: reaches V1 at best
		EntryID: "e1", SHA256: "aaa", MediaType: "image/jpeg", Bytes: 1000,
		PerceptualHash: 7, SubmittedAt: now, AttestedBy: "capability",
	}
	r := agg(t, ev, NewCorpus(), sawIt, TierV2) // but V2 was paid for
	if r.Admissible {
		t.Error("evidence below the paid-for tier was admitted; 'submit anything' would pay")
	}
	if r.MetTier {
		t.Error("MetTier should be false")
	}
}
