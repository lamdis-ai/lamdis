// Package sim provides simulated providers with seeded, deterministic
// behaviour — including dishonest ones.
//
// Honest-only fakes would let verification pass trivially and prove nothing.
// The archetypes here include a provider that reuses an old photo, one that
// strips metadata and embeds instructions aimed at the model, and one that
// simply shows up late. Because behaviour is derived from (seed, job id), the
// same run produces byte-identical results, which turns fraud detection into
// an assertion rather than an impression.
package sim

import (
	"fmt"
	"hash/fnv"
	"math/rand/v2"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
)

// Archetype is one simulated provider's disposition.
type Archetype struct {
	ID   string
	Name string

	// TruthRate is how often the provider's report actually matches reality.
	TruthRate float64
	// MedianLatency is the typical time to submit.
	MedianLatency time.Duration
	// LateRate is how often it blows the deadline.
	LateRate float64
	// OmitNonceRate is how often it forgets the challenge code.
	OmitNonceRate float64
	// ReuseRate is how often it resubmits an earlier photo.
	ReuseRate float64
	// StripMetadataRate is how often it uploads with no capture binding.
	StripMetadataRate float64
	// InjectionRate is how often it embeds instructions aimed at the verifier.
	InjectionRate float64
	// PriceMinor is what it bids.
	PriceMinor int64
	// UsesDeviceKey reports whether it can hold a real key.
	UsesDeviceKey bool
}

// The roster. Their reliability is genuinely different, which is what gives
// the routing posterior something to learn.
var (
	GigHuman = Archetype{
		ID: "sim-gig", Name: "gig worker",
		TruthRate: 0.93, MedianLatency: 45 * time.Minute,
		OmitNonceRate: 0.02, PriceMinor: 1820, UsesDeviceKey: true,
	}
	Courier = Archetype{
		ID: "sim-courier", Name: "courier",
		TruthRate: 0.97, MedianLatency: 15 * time.Minute,
		OmitNonceRate: 0.08, PriceMinor: 3100, UsesDeviceKey: true,
	}
	WebAgent = Archetype{
		ID: "sim-agent", Name: "web agent",
		TruthRate: 0.71, MedianLatency: 3 * time.Hour,
		StripMetadataRate: 0.40, PriceMinor: 1250,
	}
	Flaky = Archetype{
		ID: "sim-flaky", Name: "unreliable human",
		TruthRate: 0.62, MedianLatency: 90 * time.Minute,
		LateRate: 0.25, OmitNonceRate: 0.15, ReuseRate: 0.10,
		PriceMinor: 900, UsesDeviceKey: true,
	}
	Fraud = Archetype{
		ID: "sim-fraud", Name: "fraudulent provider",
		TruthRate: 0.20, MedianLatency: 4 * time.Minute,
		ReuseRate: 1.0, StripMetadataRate: 1.0, InjectionRate: 0.20,
		PriceMinor: 700,
	}
)

// Roster is the default set used by the demo and the fraud corpus.
var Roster = []Archetype{GigHuman, Courier, WebAgent, Flaky, Fraud}

// Submission is what a simulated provider hands the exchange.
type Submission struct {
	Provider    string
	Evidence    verify.Evidence
	Vision      verify.VisionVerdict
	SubmittedAt time.Time
	Late        bool
	// GroundTruth is what is actually true at the address, which only the
	// simulation knows. It is what the fraud tests score against.
	GroundTruth bool
}

// Provider is a simulated executor bound to a seed.
type Provider struct {
	Arch Archetype
	Seed uint64
	// priorPhoto lets a dishonest provider resubmit something it used before.
	priorPhoto  string
	priorPHash  uint64
	priorLoaded bool
}

func New(a Archetype, seed uint64) *Provider { return &Provider{Arch: a, Seed: seed} }

// rng derives a deterministic stream from (seed, job), so the same provider
// behaves identically on the same job every run, and differently across jobs.
func (p *Provider) rng(job string) *rand.Rand {
	h := fnv.New64a()
	_, _ = h.Write([]byte(job))
	return rand.New(rand.NewPCG(p.Seed, h.Sum64()))
}

// Execute simulates going to the address and submitting evidence.
func (p *Provider) Execute(job, nonce string, truth bool, start time.Time, deadline time.Duration) Submission {
	r := p.rng(job)
	a := p.Arch

	latency := jitter(r, a.MedianLatency)
	late := r.Float64() < a.LateRate
	if late {
		latency = deadline + jitter(r, 20*time.Minute)
	}
	submittedAt := start.Add(latency)

	// What the provider reports, which is not always what is true.
	reports := truth
	if r.Float64() > a.TruthRate {
		reports = !truth
	}

	photo := fmt.Sprintf("%s/%s/%v", job, a.ID, reports)
	phash := hashOf(photo)
	reused := false
	if r.Float64() < a.ReuseRate && p.priorLoaded {
		// The classic fraud: yesterday's photo, submitted again today.
		photo, phash, reused = p.priorPhoto, p.priorPHash, true
	}
	if !p.priorLoaded {
		p.priorPhoto, p.priorPHash, p.priorLoaded = photo, phash, true
	}

	ev := verify.Evidence{
		SHA256:         sha256Of(photo),
		MediaType:      "image/jpeg",
		Bytes:          140_000 + int64(r.IntN(90_000)),
		PerceptualHash: phash,
		SubmittedAt:    submittedAt,
		Window:         2 * time.Hour,
	}
	if a.UsesDeviceKey {
		ev.AttestedBy, ev.ViaOurPage = "device_key", true
	} else {
		ev.AttestedBy = "capability"
	}
	// A stripped upload has no capture binding at all, which is what caps its
	// achievable tier no matter how good the picture looks.
	if r.Float64() < a.StripMetadataRate {
		ev.CapturedAt = time.Time{}
		ev.ViaOurPage = false
		ev.Recompressed = true
	} else {
		ev.CapturedAt = submittedAt.Add(-time.Duration(r.IntN(600)) * time.Second)
	}
	// A reused photo is old, whatever else it claims.
	if reused {
		ev.CapturedAt = start.Add(-48 * time.Hour)
	}
	ev.NonceExpected = nonce
	if r.Float64() >= a.OmitNonceRate && !reused {
		ev.NonceTranscribed = nonce
	}

	vis := verify.VisionVerdict{
		Verdict:        map[bool]string{true: "satisfied", false: "not_satisfied"}[reports],
		SelfConfidence: 0.86 + r.Float64()*0.13,
		Cents:          2,
	}
	if reused {
		vis.RecaptureSuspicion = 0.2
	}
	if r.Float64() < a.InjectionRate {
		vis.InjectionDetected = true
		vis.InstructionLikeText = true
	}

	return Submission{
		Provider: a.ID, Evidence: ev, Vision: vis,
		SubmittedAt: submittedAt, Late: late, GroundTruth: truth,
	}
}

// Bid is what the provider offers for a job.
func (p *Provider) Bid(job string) (int64, time.Duration) {
	r := p.rng(job + "/bid")
	return p.Arch.PriceMinor, jitter(r, p.Arch.MedianLatency)
}

func jitter(r *rand.Rand, median time.Duration) time.Duration {
	if median <= 0 {
		return time.Minute
	}
	// A right tail: most jobs land near the median, a few take much longer.
	f := 0.6 + r.Float64()*1.2
	if r.Float64() < 0.1 {
		f *= 2.5
	}
	return time.Duration(float64(median) * f)
}
