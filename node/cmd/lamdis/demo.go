package main

import (
	"context"
	"crypto/ed25519"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/exchange"
	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/outcome"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/provider/sim"
)

// cmdDemo plays the canonical scenario end to end, twice: once with an honest
// provider, once with a fraudulent one. The second run is the important one —
// the refund is the product, not the payout.
func cmdDemo(args []string) error {
	fs := flag.NewFlagSet("demo", flag.ContinueOnError)
	seed := fs.Uint64("seed", 42, "seed for the simulated providers")
	predicate := fs.String("predicate", "a FOR LEASE sign is displayed at 742 Evergreen Rd", "what must be true")
	jsonOut := fs.Bool("json", false, "print the final folded state as JSON")
	railName := fs.String("rail", "mock", "where money moves: mock, or balance for a real ledger")
	if err := fs.Parse(args); err != nil {
		return err
	}

	start := time.Date(2026, 8, 17, 9, 0, 0, 0, time.UTC)

	// The mock rail proves the lifecycle; the balance rail proves it against
	// real double-entry bookkeeping, where an unfunded buyer or a settlement
	// that does not conserve is refused rather than recorded.
	var (
		rail  payment.Adapter
		mock  *payment.Mock
		led   *ledger.Ledger
		ops   func() int
		held  func(string) int64
		audit func() error
	)
	switch *railName {
	case "mock":
		m := payment.NewMock()
		m.Now = func() time.Time { return start }
		rail, mock = m, m
		ops = m.Operations
		held = m.HeldFor
	case "balance":
		dir, err := os.MkdirTemp("", "lamdis-demo-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(dir)
		l, err := ledger.Open(filepath.Join(dir, "ledger.db"))
		if err != nil {
			return err
		}
		defer l.Close()
		led = l
		rail = payment.NewBalance(l)
		ops = func() int { return 0 }
		held = func(thread string) int64 {
			n, _ := l.Held(context.Background(), thread, "USD")
			return n
		}
		audit = func() error { return l.Audit(context.Background()) }
	default:
		return fmt.Errorf("demo: unknown rail %q; use mock or balance", *railName)
	}

	x, err := exchange.New(seededKey(1), rail, start)
	if err != nil {
		return err
	}
	if mock != nil {
		mock.Now = x.Now
	}
	// A real ledger holds no money until somebody puts some there. The buyer
	// funds their balance exactly as they would in production.
	if led != nil {
		buyerPID, err := principalOf(seededKey(2))
		if err != nil {
			return err
		}
		if _, err := led.Topup(context.Background(), "demo-topup", buyerPID,
			100000, "USD", "demo"); err != nil {
			return err
		}
		fmt.Printf("\n  %s\n", dim("Buyer funded with $1000.00 on a real double-entry ledger."))
	}

	order := exchange.Order{
		Predicate: *predicate,
		Category:  "signage.presence",
		Currency:  "USD",
	}

	fmt.Println()
	title("Lamdis Exchange — buying an outcome")
	fmt.Printf("  %s\n", dim("An agent states what must become true. Money is held. Someone executes."))
	fmt.Printf("  %s\n\n", dim("Evidence is verified. Only then does money move."))

	// Act one: an honest provider, and the sign really is there.
	honest, err := x.Purchase(context.Background(),
		seededKey(2), seededKey(3),
		&exchange.Simulated{P: sim.New(sim.GigHuman, *seed), Truth: true, Corpus: x.Corpus, Params: x.Params},
		order, true)
	if err != nil {
		return fmt.Errorf("honest run: %w", err)
	}
	report("Run 1 — honest provider, sign is present", honest, ops)

	// Act two: the same request, a fraudulent provider, and the sign is not
	// there. This is the run that matters.
	x.Advance(time.Hour)
	fraud, err := x.Purchase(context.Background(),
		seededKey(2), seededKey(4),
		&exchange.Simulated{P: sim.New(sim.Fraud, *seed), Truth: false, Corpus: x.Corpus, Params: x.Params},
		order, false)
	if err != nil {
		return fmt.Errorf("fraud run: %w", err)
	}
	report("Run 2 — fraudulent provider, sign is absent", fraud, ops)

	if *jsonOut {
		b, err := fraud.State.JSON()
		if err != nil {
			return err
		}
		fmt.Println(string(b))
	}

	return checkInvariants(honest, fraud, held, audit)
}

func report(heading string, r *exchange.Run, ops func() int) {
	fmt.Println()
	title(heading)

	for _, s := range r.Steps {
		fmt.Printf("  %-14s %s\n", s.Act, s.Detail)
	}

	st := r.State
	fmt.Println()
	fmt.Printf("  %-14s %s / %s", "state", st.Phase, st.Money)
	if st.Resolution != "" {
		fmt.Printf(" (%s)", st.Resolution)
	}
	fmt.Println()

	if st.Settlement != nil {
		cur := st.Currency
		fmt.Printf("  %-14s escrowed %s  →  provider %s  ·  fee %s  ·  refunded %s\n", "money",
			exchange.Money(st.Settlement.EscrowMinor, cur),
			exchange.Money(st.Settlement.ProviderNet, cur),
			exchange.Money(st.Settlement.FeeMinor, cur),
			exchange.Money(st.Settlement.RefundMinor, cur))
		sum := st.Settlement.ProviderNet + st.Settlement.FeeMinor + st.Settlement.RefundMinor
		mark := "✓"
		if sum != st.Settlement.EscrowMinor {
			mark = "✗"
		}
		fmt.Printf("  %-14s %s %s = %s escrowed\n", "conserves", mark,
			exchange.Money(sum, cur), exchange.Money(st.Settlement.EscrowMinor, cur))
	}

	// What the exchange concluded, next to what was actually true. Only a
	// simulation can print the second column.
	got := st.Verdict != nil && st.Verdict.Result == outcome.VerdictPass
	verdictMark := "✓ correct"
	if got != r.TruthWas {
		verdictMark = "✗ WRONG"
	}
	fmt.Printf("  %-14s said %v, truth was %v — %s\n", "judgment", got, r.TruthWas, verdictMark)

	fmt.Printf("  %-14s %d entries, %d signers, chain verified %s\n", "trail",
		len(r.Log.Entries()), countSigners(r.Log), chainOK(r.Log))
	if len(st.Errors) > 0 {
		for _, e := range st.Errors {
			fmt.Printf("  %-14s %s: %s\n", "refused", e.Kind, e.Reason)
		}
	}
	if n := ops(); n > 0 {
		fmt.Printf("  %-14s %d rail operations so far\n", "rail", n)
	}
}

// checkInvariants makes the demo a smoke test as well as a story: it exits
// non-zero if anything that must hold did not.
func checkInvariants(honest, fraud *exchange.Run, held func(string) int64, audit func() error) error {
	var problems []string

	for name, r := range map[string]*exchange.Run{"honest": honest, "fraud": fraud} {
		st := r.State
		if st.Settlement == nil {
			problems = append(problems, name+": no settlement was computed")
			continue
		}
		if st.Settlement.ProviderNet+st.Settlement.FeeMinor+st.Settlement.RefundMinor != st.Settlement.EscrowMinor {
			problems = append(problems, name+": settlement does not conserve the escrow")
		}
		if !st.Terminal() {
			problems = append(problems, fmt.Sprintf("%s: outcome is not terminal (%s/%s)", name, st.Phase, st.Money))
		}
		if len(st.Errors) > 0 {
			problems = append(problems, fmt.Sprintf("%s: %d entries were refused", name, len(st.Errors)))
		}
		if err := verifyChain(r.Log); err != nil {
			problems = append(problems, name+": "+err.Error())
		}
		// The fold must be replayable by anyone holding only the thread.
		again := outcome.Fold(r.Log.Thread, r.Log.Entries())
		a, _ := again.JSON()
		b, _ := st.JSON()
		if string(a) != string(b) {
			problems = append(problems, name+": replaying the thread produced different state")
		}
	}

	// The fraudulent provider must not have been paid the success bonus.
	if fraud.State.Settlement != nil && fraud.State.Settlement.GrossMinor > 500 {
		problems = append(problems, fmt.Sprintf(
			"fraud: provider was paid %d minor units, more than the base fee",
			fraud.State.Settlement.GrossMinor))
	}
	// Nothing may remain held once both outcomes are terminal.
	for _, r := range []*exchange.Run{honest, fraud} {
		if n := held(r.Log.Thread); n != 0 {
			problems = append(problems, fmt.Sprintf("%s: %d minor units still held on the rail", r.Log.Thread, n))
		}
	}
	// On a real ledger, nothing may have been created or destroyed along the
	// way. The mock cannot answer this, which is the reason to run both.
	if audit != nil {
		if err := audit(); err != nil {
			problems = append(problems, err.Error())
		}
	}

	fmt.Println()
	if len(problems) > 0 {
		title("Invariants FAILED")
		for _, p := range problems {
			fmt.Printf("  ✗ %s\n", p)
		}
		fmt.Println()
		return fmt.Errorf("%d invariant(s) failed", len(problems))
	}
	title("Invariants hold")
	fmt.Println("  ✓ every settlement conserves the escrowed amount exactly")
	fmt.Println("  ✓ both outcomes reached a terminal state with nothing left held")
	fmt.Println("  ✓ every entry is signed and every chain links")
	fmt.Println("  ✓ replaying each thread reproduces identical state")
	fmt.Println("  ✓ the fraudulent submission earned no success bonus")
	fmt.Println()
	return nil
}

// verifyChain re-checks every signature and every prev link, the way a third
// party auditing an attestation would.
func verifyChain(l *protolog.ThreadLog) error {
	heads := map[protolog.ChainKey]string{}
	for _, e := range l.Entries() {
		if err := e.Validate(); err != nil {
			return fmt.Errorf("entry %s failed validation: %w", e.ID, err)
		}
		k := protolog.ChainKey{Thread: e.Thread, Author: e.Author, Lane: e.Lane}
		want := heads[k]
		if want == "" {
			want = protolog.GenesisPrev
		}
		if e.Prev != want {
			return fmt.Errorf("entry %s breaks its chain", e.ID)
		}
		h, err := e.Hash()
		if err != nil {
			return err
		}
		heads[k] = h
	}
	return nil
}

func chainOK(l *protolog.ThreadLog) string {
	if err := verifyChain(l); err != nil {
		return "✗ " + err.Error()
	}
	return "✓"
}

func countSigners(l *protolog.ThreadLog) int {
	seen := map[string]bool{}
	for _, e := range l.Entries() {
		seen[e.Author] = true
	}
	return len(seen)
}

// seededKey derives a stable key so demo output is reproducible. A real node
// generates keys from crypto/rand and never does this.
// principalOf names a key the same way the protocol does, so the ledger and
// the signed log agree on who the buyer is.
func principalOf(k ed25519.PrivateKey) (string, error) {
	return protolog.PrincipalID(k.Public().(ed25519.PublicKey))
}

func seededKey(seed byte) ed25519.PrivateKey {
	raw := make([]byte, ed25519.SeedSize)
	for i := range raw {
		raw[i] = seed
	}
	return ed25519.NewKeyFromSeed(raw)
}

func title(s string) {
	fmt.Printf("%s\n%s\n", bold(s), dim(strings.Repeat("─", len(s))))
}

func bold(s string) string {
	if noColor() {
		return s
	}
	return "\x1b[1m" + s + "\x1b[0m"
}

func dim(s string) string {
	if noColor() {
		return s
	}
	return "\x1b[2m" + s + "\x1b[0m"
}

func noColor() bool {
	if os.Getenv("NO_COLOR") != "" {
		return true
	}
	fi, err := os.Stdout.Stat()
	return err != nil || fi.Mode()&os.ModeCharDevice == 0
}
