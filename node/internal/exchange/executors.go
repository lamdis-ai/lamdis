package exchange

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/evidence"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/provider/sim"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// Simulated adapts a seeded fake provider to the Executor interface. Its
// evidence is fabricated and its "model reading" is a struct literal — it
// exercises the money lifecycle and the aggregation, and proves nothing about
// perception.
type Simulated struct {
	P      *sim.Provider
	Truth  bool
	Corpus *verify.Corpus
	Params verify.Params
}

func (s *Simulated) Name() string { return s.P.Arch.Name }

func (s *Simulated) Bid(job string) (int64, time.Duration) { return s.P.Bid(job) }

func (s *Simulated) Execute(_ context.Context, job, nonce string, required verify.Tier,
	_ string, start time.Time, deadline time.Duration) (Delivery, error) {

	sub := s.P.Execute(job, nonce, s.Truth, start, deadline)
	signals := verify.Deterministic(sub.Evidence, s.Corpus)
	signals = append(signals, verify.FromVision(sub.Vision)...)
	tier := verify.TierFor(sub.Evidence, true, false)
	res := verify.Aggregate(0.5, signals, tier, required,
		verify.HasProvenance(sub.Evidence), s.Params)

	return Delivery{
		Evidence: sub.Evidence, Result: res, SubmittedAt: sub.SubmittedAt,
		Detail: "simulated photo",
	}, nil
}

// Photo is a real provider: a real image file, whose provenance is read out of
// the file's own EXIF and whose content is read by a real model.
type Photo struct {
	Path       string
	PriceMinor int64
	ETA        time.Duration
	Model      vision.Model
	Corpus     *verify.Corpus
	Params     verify.Params

	// DeviceKey records whether the submitter signed with their own key rather
	// than a capability link the exchange signed on their behalf.
	DeviceKey bool
	ViaPage   bool

	// Target, when set, is the location the job was bound to.
	TargetLat, TargetLon float64
	RadiusM              float64
	Window               time.Duration

	// Spend is charged as the model is called.
	Spend func(cents int) error
}

func (p *Photo) Name() string { return "photo submission" }

func (p *Photo) Bid(string) (int64, time.Duration) {
	price, eta := p.PriceMinor, p.ETA
	if price == 0 {
		price = 1820
	}
	if eta == 0 {
		eta = 45 * time.Minute
	}
	return price, eta
}

func (p *Photo) Execute(ctx context.Context, _, nonce string, required verify.Tier,
	predicate string, start time.Time, _ time.Duration) (Delivery, error) {

	var zero Delivery
	data, err := os.ReadFile(p.Path)
	if err != nil {
		return zero, fmt.Errorf("reading evidence: %w", err)
	}
	art, err := evidence.Analyze(data, "image/jpeg")
	if err != nil {
		return zero, err
	}
	// Provenance comes out of the file, never from what anyone asserts.
	ex, _ := evidence.ParseEXIF(data)

	submittedAt := start.Add(20 * time.Minute)
	ev := verify.Evidence{
		SHA256: art.SHA256, MediaType: art.MediaType, Bytes: art.Bytes,
		PerceptualHash: art.DHash, MirrorHash: art.MirrorHash, SubmittedAt: submittedAt,
		Window: p.Window, NonceExpected: nonce,
		ViaOurPage: p.ViaPage, AttestedBy: "capability",
	}
	if p.DeviceKey {
		ev.AttestedBy = "device_key"
	}
	if ex.HasDateTime {
		ev.CapturedAt = ex.DateTimeOriginal
	}
	if ex.HasGPS && p.RadiusM > 0 {
		ev.GeoLat, ev.GeoLon, ev.HasGeo = ex.Lat, ex.Lon, true
		ev.TargetLat, ev.TargetLon, ev.RadiusM = p.TargetLat, p.TargetLon, p.RadiusM
	}

	// The blind describer: told nothing about the job.
	obs, u1, err := p.Model.Describe(ctx, data)
	if err != nil {
		return zero, fmt.Errorf("describe: %w", err)
	}
	if p.Spend != nil {
		if err := p.Spend(costCents(u1)); err != nil {
			return zero, err
		}
	}
	// The challenge code is compared here, in Go, against what a model that
	// did not know what to look for happened to read.
	if nonce != "" {
		for _, t := range obs.Transcribed() {
			if equalFoldTrim(t, nonce) {
				ev.NonceTranscribed = t
				break
			}
		}
	}

	adj, u2, err := p.Model.Adjudicate(ctx, predicate, obs)
	if err != nil {
		return zero, fmt.Errorf("adjudicate: %w", err)
	}
	if p.Spend != nil {
		if err := p.Spend(costCents(u2)); err != nil {
			return zero, err
		}
	}

	signals := verify.Deterministic(ev, p.Corpus)
	signals = append(signals, verify.FromVision(verify.VisionVerdict{
		Verdict:             adj.Verdict,
		SelfConfidence:      adj.SelfConfidence,
		SyntheticSuspicion:  obs.SyntheticSuspicion,
		RecaptureSuspicion:  obs.RecaptureSuspicion,
		InjectionDetected:   adj.InjectionAttemptDetected,
		InstructionLikeText: obs.InstructionLikeText,
		Cents:               costCents(u1) + costCents(u2),
	})...)

	tier := verify.TierFor(ev, true, false)
	res := verify.Aggregate(0.5, signals, tier, required, verify.HasProvenance(ev), p.Params)

	return Delivery{
		Evidence: ev, Result: res, SubmittedAt: submittedAt,
		Detail: fmt.Sprintf("real photo (%s)", ex.Summary()),
	}, nil
}

// costCents prices a call at Opus rates: $5/M input, $25/M output, rounded up
// so spend is never under-reported.
func costCents(u vision.Usage) int {
	micros := u.InputTokens*500 + u.OutputTokens*2500
	c := micros / 1_000_000
	if micros%1_000_000 != 0 {
		c++
	}
	return c
}

func equalFoldTrim(a, b string) bool {
	trim := func(s string) string {
		for len(s) > 0 && (s[0] == ' ' || s[0] == '\n' || s[0] == '\t') {
			s = s[1:]
		}
		for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\n' || s[len(s)-1] == '\t') {
			s = s[:len(s)-1]
		}
		return s
	}
	a, b = trim(a), trim(b)
	if len(a) != len(b) {
		return false
	}
	lower := func(c byte) byte {
		if c >= 'A' && c <= 'Z' {
			return c + 32
		}
		return c
	}
	for i := 0; i < len(a); i++ {
		if lower(a[i]) != lower(b[i]) {
			return false
		}
	}
	return true
}
