package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"strings"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/budget"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/evidence"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// cmdVerifyPhoto runs the real verification pipeline over a real image file:
// deterministic checks on the bytes, a blind description, a nonce comparison
// done in Go, then adjudication. It exists so the perception path can be
// inspected on its own, separately from the money.
func cmdVerifyPhoto(args []string) error {
	fs := flag.NewFlagSet("verify-photo", flag.ContinueOnError)
	image := fs.String("image", "", "path to a JPEG or PNG to verify")
	predicate := fs.String("predicate", "A FOR LEASE sign is displayed and legible at 742 Evergreen Rd.", "what must be true")
	nonce := fs.String("nonce", "", "challenge code the provider was told to include in the shot")
	profile := fs.String("profile", "aws-admin", "AWS profile with bedrock:InvokeModel")
	region := fs.String("region", "us-east-1", "AWS region")
	model := fs.String("model", "us.anthropic.claude-opus-5", "Bedrock inference profile id")
	tier := fs.String("tier", "V2", "verification tier the buyer paid for")
	viaPage := fs.Bool("via-capture-page", false, "the bytes arrived through our capture page rather than an upload")
	deviceKey := fs.Bool("device-key", false, "the submitter signed with a real device key")
	atLat := fs.Float64("lat", 0, "expected latitude of the subject, if the job is location-bound")
	atLon := fs.Float64("lon", 0, "expected longitude of the subject")
	radiusM := fs.Float64("radius-m", 250, "how close the capture must have been to count")
	window := fs.Duration("window", 2*time.Hour, "how fresh the capture must be")
	confidence := fs.Int64("confidence", 9000, "required confidence in basis points")
	jsonOut := fs.Bool("json", false, "print the full signal set as JSON")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *image == "" {
		return fmt.Errorf("verify-photo: -image is required")
	}

	// The budget guard is constructed before the model client, and refuses to
	// hand one out if spend has already blown past the hard ceiling.
	guard := budget.New(budget.DefaultLimits())
	if err := guard.MustAllowClient(); err != nil {
		return err
	}

	data, art, err := evidence.LoadJPEG(*image)
	if err != nil {
		return fmt.Errorf("reading %s: %w", *image, err)
	}

	fmt.Println()
	title("Verifying a real image")
	fmt.Printf("  %-18s %s\n", "file", *image)
	fmt.Printf("  %-18s %d×%d, %d bytes\n", "decoded", art.Width, art.Height, art.Bytes)
	fmt.Printf("  %-18s %s\n", "sha256", art.SHA256)
	fmt.Printf("  %-18s %016x (mirror %016x)\n", "dhash", art.DHash, art.MirrorHash)
	fmt.Printf("  %-18s %s\n", "predicate", *predicate)

	// Provenance is read out of the file, not asserted by whoever ran this.
	ex, exErr := evidence.ParseEXIF(data)
	if exErr != nil {
		fmt.Printf("  %-18s %s\n", "exif", "malformed: "+exErr.Error())
	}
	fmt.Printf("  %-18s %s\n", "exif", ex.Summary())
	for _, w := range ex.Warnings {
		fmt.Printf("  %-18s %s\n", "", dim("warning: "+w))
	}
	if !ex.Present {
		fmt.Printf("  %-18s %s\n", "",
			dim("no capture binding in the file, which caps the achievable tier"))
	}
	if *nonce != "" {
		fmt.Printf("  %-18s %s\n", "challenge code", *nonce)
	}
	fmt.Println()

	m := vision.NewBedrock(*profile, *region, *model)
	fmt.Printf("  %-18s %s (prompt contract %s)\n", "model", m.ID(), vision.PromptVersion)

	ctx := context.Background()

	// --- call one: the blind describer ------------------------------------
	// It is not told the predicate or the challenge code.
	lease, err := guard.Reserve("verify-photo", estimateCents(art))
	if err != nil {
		return err
	}
	t0 := time.Now()
	obs, usage, err := m.Describe(ctx, data)
	if err != nil {
		lease.Release()
		return fmt.Errorf("describe: %w", err)
	}
	lease.Commit(costCents(usage))
	fmt.Printf("  %-18s %s, %d in / %d out tokens\n", "describe", time.Since(t0).Round(time.Millisecond),
		usage.InputTokens, usage.OutputTokens)

	fmt.Println()
	subtitle("What the describer saw (it was not told the question)")
	fmt.Printf("    scene: %s\n", wrap(obs.Scene, 74, "           "))
	for _, s := range obs.Signage {
		fmt.Printf("    signage: %q (%s, %s)\n", s.Text, s.Color, s.Mount)
	}
	transcribed := obs.Transcribed()
	if len(transcribed) > 0 {
		fmt.Printf("    text read: %s\n", strings.Join(quoteAll(transcribed), ", "))
	}
	fmt.Printf("    synthetic suspicion %.2f · recapture suspicion %.2f · instruction-like text %v\n",
		obs.SyntheticSuspicion, obs.RecaptureSuspicion, obs.InstructionLikeText)

	// --- the nonce comparison happens here, in Go -------------------------
	// Provenance is asserted by the caller, never invented here. A file handed
	// to this command over the command line has no capture binding unless one
	// is supplied, and pretending otherwise would inflate every score.
	ev := verify.Evidence{
		SHA256: art.SHA256, MediaType: art.MediaType, Bytes: art.Bytes,
		PerceptualHash: art.DHash, MirrorHash: art.MirrorHash, SubmittedAt: time.Now(),
		Window:        *window,
		NonceExpected: *nonce,
		ViaOurPage:    *viaPage,
		AttestedBy:    "capability",
	}
	if *deviceKey {
		ev.AttestedBy = "device_key"
	}
	if ex.HasDateTime {
		ev.CapturedAt = ex.DateTimeOriginal
	}
	if ex.HasGPS && (*atLat != 0 || *atLon != 0) {
		ev.GeoLat, ev.GeoLon, ev.HasGeo = ex.Lat, ex.Lon, true
		ev.TargetLat, ev.TargetLon, ev.RadiusM = *atLat, *atLon, *radiusM
	}
	if *nonce != "" {
		for _, t := range transcribed {
			if strings.EqualFold(strings.TrimSpace(t), *nonce) {
				ev.NonceTranscribed = t
				break
			}
		}
		fmt.Println()
		if ev.NonceTranscribed != "" {
			fmt.Printf("    ✓ challenge code %s found in the transcription\n", *nonce)
		} else {
			fmt.Printf("    ✗ challenge code %s NOT found in the transcription\n", *nonce)
		}
		fmt.Printf("      %s\n", dim("compared in Go, not by the model — the describer never knew what to look for"))
	}

	// --- call two: adjudication -------------------------------------------
	lease, err = guard.Reserve("verify-photo", 2)
	if err != nil {
		return err
	}
	t1 := time.Now()
	adj, usage2, err := m.Adjudicate(ctx, *predicate, obs)
	if err != nil {
		lease.Release()
		return fmt.Errorf("adjudicate: %w", err)
	}
	lease.Commit(costCents(usage2))
	fmt.Println()
	fmt.Printf("  %-18s %s, %d in / %d out tokens\n", "adjudicate", time.Since(t1).Round(time.Millisecond),
		usage2.InputTokens, usage2.OutputTokens)

	subtitle("What the adjudicator concluded (it never saw the image)")
	fmt.Printf("    verdict: %s (self-reported confidence %.2f)\n", adj.Verdict, adj.SelfConfidence)
	for _, s := range adj.SupportingObservations {
		fmt.Printf("    supports: %q\n", s)
	}
	for _, s := range adj.ContradictingObservations {
		fmt.Printf("    contradicts: %q\n", s)
	}
	if adj.InjectionAttemptDetected {
		fmt.Printf("    %s\n", "⚠ injection attempt detected")
	}

	// --- aggregation ------------------------------------------------------
	signals := verify.Deterministic(ev, verify.NewCorpus())
	signals = append(signals, verify.FromVision(verify.VisionVerdict{
		Verdict:             adj.Verdict,
		SelfConfidence:      adj.SelfConfidence,
		SyntheticSuspicion:  obs.SyntheticSuspicion,
		RecaptureSuspicion:  obs.RecaptureSuspicion,
		InjectionDetected:   adj.InjectionAttemptDetected,
		InstructionLikeText: obs.InstructionLikeText,
		Cents:               costCents(usage) + costCents(usage2),
	})...)

	achieved := verify.TierFor(ev, true, false)
	res := verify.Aggregate(0.5, signals, achieved, verify.Tier(*tier),
		verify.HasProvenance(ev), verify.DefaultParams())

	fmt.Println()
	subtitle("Signals")
	for _, s := range res.Signals {
		mark := " "
		if s.Fatal {
			mark = "✗"
		}
		fmt.Printf("    %s %-32s %-18s %+.2f nats  [%s]\n", mark, s.Feature, s.Value, s.LLR, s.Class)
	}

	fmt.Println()
	subtitle("Aggregate")
	fmt.Printf("    tier achieved %s, buyer paid for %s\n", res.Tier, res.Required)
	fmt.Printf("    p(predicate holds) = %.3f  (ceiling for this tier: %.3f)\n",
		res.PTrue, res.Tier.Ceiling(verify.HasProvenance(ev)))
	fmt.Printf("    admissible %v · decision %s\n", res.Admissible, res.Decision)
	fmt.Printf("    %s\n", res.Explain(*confidence))
	fmt.Printf("    aggregate hash %s\n", res.AggregateHash)
	fmt.Printf("    spent %d¢ of the %d¢ daily ceiling\n", guard.SpentToday(), budget.DefaultLimits().PerDayCents)
	fmt.Println()

	if *jsonOut {
		b, _ := json.MarshalIndent(map[string]any{
			"artifact": art, "observation": obs, "adjudication": adj, "result": res,
		}, "", "  ")
		fmt.Println(string(b))
	}
	return nil
}

// estimateCents bounds a describe call before it happens. Image tokens are
// roughly (w*h)/750, which is why a reservation is possible at all.
func estimateCents(a evidence.Artifact) int {
	imageTokens := (a.Width * a.Height) / 750
	if imageTokens > 4784 {
		imageTokens = 4784 // the high-resolution ceiling
	}
	return costCents(vision.Usage{InputTokens: imageTokens + 800, OutputTokens: 900}) + 1
}

// costCents prices a call at Opus rates: $5/M input, $25/M output.
func costCents(u vision.Usage) int {
	micros := u.InputTokens*500 + u.OutputTokens*2500 // in millionths of a cent
	c := micros / 1_000_000
	if micros%1_000_000 != 0 {
		c++ // round up; never under-report spend
	}
	return c
}

func subtitle(s string) { fmt.Printf("  %s\n", bold(s)) }

func quoteAll(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		out = append(out, fmt.Sprintf("%q", s))
	}
	return out
}

func wrap(s string, width int, indent string) string {
	if len(s) <= width {
		return s
	}
	var b strings.Builder
	line := 0
	for _, w := range strings.Fields(s) {
		if line+len(w)+1 > width {
			b.WriteString("\n" + indent)
			line = 0
		} else if line > 0 {
			b.WriteString(" ")
			line++
		}
		b.WriteString(w)
		line += len(w)
	}
	return b.String()
}
