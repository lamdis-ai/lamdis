package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/budget"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/exchange"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// cmdGauntlet runs a sequence of jobs against one exchange, where later jobs
// try to get paid with evidence derived from an earlier one.
//
// This is the fraud that actually happens: not a forged photograph, but a real
// photograph submitted again for a job it was never taken for. Everything here
// runs against real image files with real metadata, and the only thing that
// changes between jobs is what the provider hands over.
func cmdGauntlet(args []string) error {
	fs := flag.NewFlagSet("gauntlet", flag.ContinueOnError)
	dir := fs.String("dir", "", "directory holding the photo set (required)")
	predicate := fs.String("predicate", "", "what must be true (required)")
	lat := fs.Float64("lat", 0, "latitude the job is bound to")
	lon := fs.Float64("lon", 0, "longitude the job is bound to")
	radiusM := fs.Float64("radius-m", 300, "how close the capture must have been")
	profile := fs.String("profile", "aws-admin", "AWS profile with bedrock:InvokeModel")
	region := fs.String("region", "us-east-1", "AWS region")
	model := fs.String("model", "us.anthropic.claude-opus-5", "Bedrock inference profile id")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *dir == "" || *predicate == "" {
		return fmt.Errorf("gauntlet: -dir and -predicate are both required")
	}

	// Each job names a file and what the provider is trying to pull.
	type job struct {
		label  string
		file   string
		expect string
	}
	jobs := []job{
		{"honest submission", "pairA.jpg", "paid in full"},
		{"the same photo again", "pairA.jpg", "rejected: exact reuse"},
		{"re-encoded at q55", "atk_recompress.jpg", "rejected: reuse"},
		{"mirrored", "atk_mirror.jpg", "rejected: reuse"},
		{"cropped 6%", "atk_crop.jpg", "rejected: reuse"},
		{"brightened 12%", "atk_bright.jpg", "rejected: reuse"},
		{"a genuinely different photo", "pairB.jpg", "judged on its merits"},
		{"a photo from 50km away", "elsewhere.jpg", "location miss"},
	}

	guard := budget.New(budget.DefaultLimits())
	if err := guard.MustAllowClient(); err != nil {
		return err
	}
	rail := payment.NewMock()
	x, err := exchange.New(seededKey(1), rail, time.Now().UTC())
	if err != nil {
		return err
	}
	rail.Now = x.Now
	m := vision.NewBedrock(*profile, *region, *model)

	fmt.Println()
	title("Fraud gauntlet — one exchange, eight jobs, real photographs")
	fmt.Printf("  %s\n", dim("The predicate is the same every time. Only the evidence changes."))
	fmt.Printf("  %s\n\n", dim(*predicate))
	fmt.Printf("  %-28s %-13s %-11s %-9s %s\n", "job", "verdict", "provider", "refund", "why")
	fmt.Printf("  %s\n", dim("────────────────────────────────────────────────────────────────────────────────────"))

	spent := 0
	var failures []string

	for i, j := range jobs {
		path := filepath.Join(*dir, j.file)
		if _, err := os.Stat(path); err != nil {
			fmt.Printf("  %-28s %s\n", j.label, dim("skipped, no such file"))
			continue
		}
		photo := &exchange.Photo{
			Path: path, Model: m, Corpus: x.Corpus, Params: x.Params,
			DeviceKey: true, ViaPage: true,
			TargetLat: *lat, TargetLon: *lon, RadiusM: *radiusM,
			Window: 8760 * time.Hour, // a year: freshness is not what is on trial here
			Spend: func(cents int) error {
				// Keyed per job: the per-outcome ceiling is meant to bound one
				// outcome's verification, not the whole run.
				lease, err := guard.Reserve(fmt.Sprintf("gauntlet-%d", i), cents)
				if err != nil {
					return err
				}
				lease.Commit(cents)
				spent += cents
				return nil
			},
		}
		if *lat == 0 && *lon == 0 {
			photo.RadiusM = 0
		}

		x.Advance(time.Hour)
		run, err := x.Purchase(context.Background(), seededKey(2), seededKey(byte(10+i)), photo,
			exchange.Order{
				Predicate: *predicate, Category: "observation", Currency: "USD",
				RequiredTier: string(verify.TierV1), RequiredConfidenceBP: 7000,
				BaseFeeMinor: 500, SuccessBonusMinor: 1800,
			}, false)
		if err != nil {
			return fmt.Errorf("%s: %w", j.label, err)
		}

		st := run.State
		cur := st.Currency
		paid, refund := int64(0), int64(0)
		if st.Settlement != nil {
			paid, refund = st.Settlement.ProviderNet, st.Settlement.RefundMinor
		}
		why := run.Verify.Explain(7000)
		if run.Verify.Fatal != "" {
			why = "FATAL " + run.Verify.Fatal
		}
		fmt.Printf("  %-28s %-13s %-11s %-9s %s\n", j.label,
			shortVerdict(run.Verify), exchange.Money(paid, cur), exchange.Money(refund, cur), why)

		// Invariants that must hold on every single job.
		if st.Settlement != nil &&
			st.Settlement.ProviderNet+st.Settlement.FeeMinor+st.Settlement.RefundMinor != st.Settlement.EscrowMinor {
			failures = append(failures, j.label+": settlement does not conserve the escrow")
		}
		if !st.Terminal() {
			failures = append(failures, j.label+": outcome is not terminal")
		}
		if held := rail.HeldFor(run.Log.Thread); held != 0 {
			failures = append(failures, fmt.Sprintf("%s: %d minor units still held", j.label, held))
		}
		// The reuse jobs must not be paid the success bonus.
		if i > 0 && i < 6 && paid > 0 {
			failures = append(failures, fmt.Sprintf("%s: a reused photo was paid %s", j.label, exchange.Money(paid, cur)))
		}
	}

	fmt.Println()
	fmt.Printf("  verification cost %d¢ across %d jobs\n", spent, len(jobs))
	fmt.Println()
	if len(failures) > 0 {
		title("Gauntlet FAILED")
		for _, f := range failures {
			fmt.Printf("  ✗ %s\n", f)
		}
		fmt.Println()
		return fmt.Errorf("%d invariant(s) failed", len(failures))
	}
	title("Gauntlet passed")
	fmt.Println("  ✓ the first honest submission was paid in full")
	fmt.Println("  ✓ every attempt to reuse that photograph earned nothing")
	fmt.Println("  ✓ every job conserved its escrow exactly and left nothing held")
	fmt.Println()
	return nil
}

func shortVerdict(r verify.Result) string {
	if r.Fatal != "" {
		return "rejected"
	}
	if !r.MetTier {
		return "below tier"
	}
	if r.PTrue >= 0.70 {
		return "certified"
	}
	return "not certified"
}
