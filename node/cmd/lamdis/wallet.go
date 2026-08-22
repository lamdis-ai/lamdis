package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/ncruces/go-sqlite3/driver"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/account"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
)

// cmdWallet plays the economics of the exchange end to end against a real
// ledger: a buyer tops up once, their agent spends that balance across many
// small outcomes, and earnings accumulate until they are worth paying out.
//
// It exists because the reason for prefunded balances is quantitative, and an
// argument about basis points is unconvincing until you watch the same set of
// outcomes settle both ways. The card figures here are the ones measured
// against Stripe's API, not estimates.
func cmdWallet(args []string) error {
	fs := flag.NewFlagSet("wallet", flag.ContinueOnError)
	topup := fs.Int64("topup", 5000, "minor units the buyer funds their balance with")
	price := fs.Int64("price", 150, "what each outcome pays a reviewer")
	n := fs.Int("outcomes", 12, "how many outcomes the agent buys")
	feeBP := fs.Int64("fee-bp", 250, "the exchange's cut, in basis points")
	threshold := fs.Int64("payout-threshold", 2000, "minor units below which a payout is not worth making")
	limit := fs.Int64("key-limit", 3000, "total minor units this agent key may commit")
	fs.Parse(args)

	ctx := context.Background()
	dir, err := os.MkdirTemp("", "lamdis-wallet-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	l, err := ledger.Open(filepath.Join(dir, "ledger.db"))
	if err != nil {
		return err
	}
	defer l.Close()
	rail := payment.NewBalance(l)

	const buyer = "ed25519:BUYER"
	const reviewer = "ed25519:REVIEWER"

	// The account and the key its agent will carry.
	db, err := driver.Open("file:" + filepath.Join(dir, "accounts.db") +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return err
	}
	defer db.Close()
	acct, err := account.New(db)
	if err != nil {
		return err
	}
	if err := acct.CreateAccount(ctx, buyer, "buyer@example.com"); err != nil {
		return err
	}
	secret, key, err := acct.Issue(ctx, buyer, "shopping agent",
		account.Limits{MaxPerOutcomeMinor: 500, MaxTotalMinor: *limit, MaxOpen: 50}, 0)
	if err != nil {
		return err
	}

	fmt.Println()
	title("Funding")
	if _, err := l.Topup(ctx, "topup-1", buyer, *topup, "USD", "pi_demo"); err != nil {
		return err
	}
	fmt.Printf("  %-16s %s\n", "buyer balance", money(*topup))
	fmt.Printf("  %-16s %s… (%s) limit %s total\n", "agent key",
		secret[:11], key.Last4, money(*limit))
	fmt.Printf("  %s\n", dim("The secret is shown once. Only its hash is stored."))

	fmt.Println()
	title("The agent spends")
	fmt.Printf("  %s\n", dim("Each outcome: hold, verify, capture what was earned, release the rest."))
	fmt.Println()

	paid, stopped := 0, ""
	for i := 0; i < *n; i++ {
		out := fmt.Sprintf("th_%02d", i+1)
		// The key's own limit is checked before any money moves.
		if err := acct.Commit(ctx, key, out, *price, "USD"); err != nil {
			stopped = err.Error()
			break
		}
		if _, err := rail.Hold(ctx, payment.Request{
			Key: payment.Key("hold-" + out), Outcome: out,
			Source: buyer, AmountMinor: *price, Currency: "USD"}); err != nil {
			stopped = err.Error()
			break
		}
		fee := *price * *feeBP / 10000
		if _, err := rail.Capture(ctx, payment.Request{
			Key: payment.Key("cap-" + out), Outcome: out,
			Source: buyer, Destination: reviewer,
			AmountMinor: *price, FeeMinor: fee, Currency: "USD"}); err != nil {
			return err
		}
		acct.CloseOut(ctx, out)
		paid++
	}
	fmt.Printf("  %-16s %d outcomes at %s\n", "settled", paid, money(*price))
	if stopped != "" {
		fmt.Printf("  %-16s %s\n", "stopped", stopped)
		fmt.Printf("  %s\n", dim("The exchange stopped it, not the agent."))
	}

	fmt.Println()
	title("Where the money is")
	accounts, err := l.Accounts(ctx, "USD")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(accounts))
	for a := range accounts {
		names = append(names, a)
	}
	sort.Strings(names)
	for _, a := range names {
		fmt.Printf("  %-28s %10s\n", a, money(accounts[a]))
	}
	if err := l.Audit(ctx); err != nil {
		return err
	}
	fmt.Printf("  %-28s %10s\n", dim("sum"), "0.00")
	fmt.Printf("  %s\n", dim("Every posting ever written sums to zero. Nothing was created."))

	fmt.Println()
	title("Paying the reviewer")
	owed, _ := l.Balance(ctx, ledger.PayableOf(reviewer), "USD")
	due, err := l.Due(ctx, "USD", *threshold)
	if err != nil {
		return err
	}
	fmt.Printf("  %-16s %s earned over %d reviews\n", "owed", money(owed), paid)
	if _, ok := due[reviewer]; ok {
		fmt.Printf("  %-16s yes, above the %s threshold\n", "pay out now", money(*threshold))
		if _, err := l.Payout(ctx, "payout-1", reviewer, owed, "USD", "tr_demo"); err != nil {
			return err
		}
		fmt.Printf("  %-16s one transfer, one fee\n", "sent")
	} else {
		fmt.Printf("  %-16s not yet — below the %s threshold\n", "pay out now", money(*threshold))
		fmt.Printf("  %s\n", dim("The earnings are not lost. A transfer just costs more than they are worth."))
	}

	// The comparison the whole design rests on.
	fmt.Println()
	title("Why not just charge a card each time")
	cardFee := int64(0)
	for i := 0; i < paid; i++ {
		cardFee += (*price*290)/10000 + 30 // 2.9% + 30c, as measured
	}
	ourFee := *price * int64(paid) * *feeBP / 10000
	fmt.Printf("  %-24s %s across %d outcomes\n", "card fees would be", money(cardFee), paid)
	fmt.Printf("  %-24s %s\n", "the exchange earned", money(ourFee))
	fmt.Printf("  %-24s %s\n", "balance rail cost", money(0))
	if cardFee > ourFee {
		fmt.Printf("  %s\n", dim(fmt.Sprintf(
			"Per-outcome cards would cost %s more than the exchange makes. That is the whole argument.",
			money(cardFee-ourFee))))
	}
	fmt.Println()
	return nil
}
