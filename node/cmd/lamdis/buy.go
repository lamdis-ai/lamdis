package main

import (
	"context"
	"flag"
	"fmt"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/budget"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/exchange"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// cmdBuy runs the whole outcome lifecycle against a real photograph: an agent
// states what must be true, money is held, the photo is submitted as evidence,
// a real model reads it, and settlement follows the verdict. Everything except
// the payment rail is real.
func cmdBuy(args []string) error {
	fs := flag.NewFlagSet("buy", flag.ContinueOnError)
	predicate := fs.String("predicate", "", "what must be true (required)")
	image := fs.String("image", "", "the photo the provider submits as evidence (required)")
	tier := fs.String("tier", "V1", "verification tier to buy: V0..V3")
	confidence := fs.Int64("confidence", 7000, "required confidence in basis points")
	lat := fs.Float64("lat", 0, "latitude the job is bound to, if any")
	lon := fs.Float64("lon", 0, "longitude the job is bound to")
	radiusM := fs.Float64("radius-m", 250, "how close the capture must have been")
	window := fs.Duration("window", 720*time.Hour, "how fresh the capture must be")
	deviceKey := fs.Bool("device-key", true, "the submitter signed with their own device key")
	profile := fs.String("profile", "aws-admin", "AWS profile with bedrock:InvokeModel")
	region := fs.String("region", "us-east-1", "AWS region")
	model := fs.String("model", "us.anthropic.claude-opus-5", "Bedrock inference profile id")
	base := fs.Int64("base-fee", 500, "minor units paid for admissible evidence, whatever the verdict")
	bonus := fs.Int64("bonus", 1800, "minor units paid additionally if the predicate holds")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *predicate == "" || *image == "" {
		return fmt.Errorf("buy: -predicate and -image are both required")
	}

	guard := budget.New(budget.DefaultLimits())
	if err := guard.MustAllowClient(); err != nil {
		return err
	}

	rail := payment.NewMock()
	start := time.Now().UTC()
	x, err := exchange.New(seededKey(1), rail, start)
	if err != nil {
		return err
	}
	rail.Now = x.Now

	fmt.Println()
	title("Buying an outcome against a real photograph")
	fmt.Printf("  %s\n", dim("Everything here is real except the payment rail: real EXIF, real model, real verdict."))
	fmt.Println()

	spent := 0
	photo := &exchange.Photo{
		Path: *image, Model: vision.NewBedrock(*profile, *region, *model),
		Corpus: x.Corpus, Params: x.Params,
		DeviceKey: *deviceKey, ViaPage: *deviceKey,
		TargetLat: *lat, TargetLon: *lon, RadiusM: *radiusM, Window: *window,
		Spend: func(cents int) error {
			lease, err := guard.Reserve("buy", cents)
			if err != nil {
				return err
			}
			lease.Commit(cents)
			spent += cents
			return nil
		},
	}
	if *lat == 0 && *lon == 0 {
		photo.RadiusM = 0 // the job is not location-bound
	}

	run, err := x.Purchase(context.Background(), seededKey(2), seededKey(3), photo,
		exchange.Order{
			Predicate: *predicate, Category: "observation", Currency: "USD",
			RequiredTier: *tier, RequiredConfidenceBP: *confidence,
			BaseFeeMinor: *base, SuccessBonusMinor: *bonus,
		}, false)
	if err != nil {
		return err
	}

	for _, s := range run.Steps {
		fmt.Printf("  %-14s %s\n", s.Act, s.Detail)
	}

	st := run.State
	fmt.Println()
	subtitle("Verification")
	for _, s := range run.Verify.Signals {
		mark := " "
		if s.Fatal {
			mark = "✗"
		}
		fmt.Printf("    %s %-30s %-16s %+.2f nats [%s]\n", mark, s.Feature, s.Value, s.LLR, s.Class)
	}
	fmt.Printf("    tier achieved %s, buyer paid for %s\n", run.Verify.Tier, run.Verify.Required)
	fmt.Printf("    p(predicate holds) = %.3f · %s\n", run.Verify.PTrue, run.Verify.Explain(*confidence))

	fmt.Println()
	subtitle("Settlement")
	cur := st.Currency
	fmt.Printf("    state      %s / %s (%s)\n", st.Phase, st.Money, st.Resolution)
	if st.Settlement != nil {
		fmt.Printf("    escrowed   %s\n", exchange.Money(st.Settlement.EscrowMinor, cur))
		fmt.Printf("    provider   %s\n", exchange.Money(st.Settlement.ProviderNet, cur))
		fmt.Printf("    fee        %s\n", exchange.Money(st.Settlement.FeeMinor, cur))
		fmt.Printf("    refunded   %s\n", exchange.Money(st.Settlement.RefundMinor, cur))
		sum := st.Settlement.ProviderNet + st.Settlement.FeeMinor + st.Settlement.RefundMinor
		mark := "✓"
		if sum != st.Settlement.EscrowMinor {
			mark = "✗"
		}
		fmt.Printf("    conserves  %s %s\n", mark, exchange.Money(sum, cur))
	}
	fmt.Printf("    trail      %d signed entries, chain verified %s\n", len(run.Log.Entries()), chainOK(run.Log))
	for _, e := range st.Errors {
		fmt.Printf("    refused    %s: %s\n", e.Kind, e.Reason)
	}
	fmt.Printf("    verification cost %d¢\n", spent)
	fmt.Println()

	if held := rail.HeldFor(run.Log.Thread); held != 0 {
		return fmt.Errorf("%d minor units are still held on the rail", held)
	}
	if !st.Terminal() {
		return fmt.Errorf("outcome did not reach a terminal state: %s/%s", st.Phase, st.Money)
	}
	if st.Settlement != nil &&
		st.Settlement.ProviderNet+st.Settlement.FeeMinor+st.Settlement.RefundMinor != st.Settlement.EscrowMinor {
		return fmt.Errorf("settlement does not conserve the escrowed amount")
	}
	return nil
}

var _ = verify.TierV1
