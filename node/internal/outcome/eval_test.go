package outcome

import (
	"crypto/ed25519"
	"encoding/json"
	"flag"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// testPrincipal derives a real principal id from a fixed seed so terms in
// tests satisfy the same validation real terms do.
func testPrincipal(t *testing.T, seed byte) string {
	t.Helper()
	s := make([]byte, ed25519.SeedSize)
	for i := range s {
		s[i] = seed
	}
	pid, err := protolog.PrincipalID(ed25519.NewKeyFromSeed(s).Public().(ed25519.PublicKey))
	if err != nil {
		t.Fatalf("PrincipalID: %v", err)
	}
	return pid
}

// baseTerms is a valid skeleton; tests override the parts they exercise.
func baseTerms(t *testing.T) *Terms {
	t.Helper()
	return &Terms{
		V: TermsVersion, Currency: "USD", Scale: 2,
		Verifier:    testPrincipal(t, 1),
		Arbiter:     testPrincipal(t, 2),
		EscrowAgent: testPrincipal(t, 3),
		Timekeeper:  testPrincipal(t, 4),
		Payout: PayoutRule{Clauses: []Clause{
			{Pay: []PayItem{{Op: PayFixed, AmountMinor: 0}}},
		}},
		Deadlines: []Deadline{
			{ID: DeadlineEvidence, After: AnchorAward, Seconds: 172800},
			{ID: DeadlineDispute, After: AnchorVerdict, Seconds: 86400},
		},
		OnVerificationTimeout: TimeoutFail,
		OnArbitrationTimeout:  TimeoutRefund,
	}
}

// contingentSavings is the essay's first example:
// "$0 if savings < $50, else 20% of realized savings".
func contingentSavings(t *testing.T) *Terms {
	tm := baseTerms(t)
	tm.Measures = []Measure{{
		ID: "realized_savings", Kind: MeasureMoney, Min: 0, Max: 10_000_000,
		Definition: "Invoice total before minus after, same billing period.",
		Required:   true,
	}}
	tm.Criteria = []Criterion{{ID: "c_threshold", Measure: "realized_savings", Op: OpGTE, Value: 5000}}
	tm.Payout = PayoutRule{Clauses: []Clause{
		{When: "c_threshold", Pay: []PayItem{{Op: PayPctOf, Measure: "realized_savings", BP: 2000, Round: RoundDown}}},
		{Pay: []PayItem{{Op: PayFixed, AmountMinor: 0}}},
	}}
	return tm
}

// qualifyingQuotes is the essay's second example:
// "$40 only if 3 quotes under $14k".
func qualifyingQuotes(t *testing.T) *Terms {
	tm := baseTerms(t)
	tm.Measures = []Measure{{
		ID: "qualifying_quotes", Kind: MeasureCount, Min: 0, Max: 20,
		Definition: "Distinct written quotes with total_minor < 1400000, each backed by a document.",
		Required:   true,
	}}
	tm.Criteria = []Criterion{{ID: "c_three", Measure: "qualifying_quotes", Op: OpGTE, Value: 3}}
	tm.Payout = PayoutRule{Clauses: []Clause{
		{When: "c_three", Pay: []PayItem{{Op: PayFixed, AmountMinor: 4000}}},
		{Pay: []PayItem{{Op: PayFixed, AmountMinor: 0}}},
	}}
	return tm
}

func TestEvaluateWorkedExamples(t *testing.T) {
	savings := contingentSavings(t)
	quotes := qualifyingQuotes(t)

	cases := []struct {
		name   string
		terms  *Terms
		m      Measures
		escrow int64
		gross  int64
		clause int
	}{
		{"savings below threshold", savings, Measures{"realized_savings": 4999}, 2_000_000, 0, 1},
		{"savings exactly at threshold", savings, Measures{"realized_savings": 5000}, 2_000_000, 1000, 0},
		{"savings above threshold", savings, Measures{"realized_savings": 11500}, 2_000_000, 2300, 0},
		{"savings rounds down not up", savings, Measures{"realized_savings": 5009}, 2_000_000, 1001, 0},
		{"quotes short of three", quotes, Measures{"qualifying_quotes": 2}, 4000, 0, 1},
		{"quotes exactly three", quotes, Measures{"qualifying_quotes": 3}, 4000, 4000, 0},
		{"quotes more than three", quotes, Measures{"qualifying_quotes": 9}, 4000, 4000, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := c.terms.Validate(); err != nil {
				t.Fatalf("Validate: %v", err)
			}
			got, err := Evaluate(c.terms, c.m, c.escrow)
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got.GrossMinor != c.gross {
				t.Errorf("gross = %d, want %d", got.GrossMinor, c.gross)
			}
			if got.ClauseIndex != c.clause {
				t.Errorf("clause = %d, want %d", got.ClauseIndex, c.clause)
			}
			if got.ProviderNet+got.FeeMinor+got.RefundMinor != c.escrow {
				t.Errorf("conservation violated: %+v", got)
			}
		})
	}
}

func TestMaxPayoutSizesEscrow(t *testing.T) {
	// 20% of a $100,000 savings ceiling is $20,000 — that is what must be held.
	if got, err := MaxPayout(contingentSavings(t)); err != nil || got != 2_000_000 {
		t.Errorf("MaxPayout(savings) = %d, %v; want 2000000", got, err)
	}
	if got, err := MaxPayout(qualifyingQuotes(t)); err != nil || got != 4000 {
		t.Errorf("MaxPayout(quotes) = %d, %v; want 4000", got, err)
	}
}

// TestBaseFeePlusSuccessBonus covers the incentive-correcting payout shape:
// a provider that submits admissible evidence is paid whether or not the
// predicate turns out to be true, so reporting an honest "not satisfied" is
// not a losing move. Without this, every corroborating provider is biased
// toward "yes" and V3 corroboration is theater.
func TestBaseFeePlusSuccessBonus(t *testing.T) {
	tm := baseTerms(t)
	tm.Measures = []Measure{
		{ID: "admissible", Kind: MeasureBool, Min: 0, Max: 1, Required: true,
			Definition: "Evidence met the requested verification tier."},
		{ID: "satisfied", Kind: MeasureBool, Min: 0, Max: 1, Required: true,
			Definition: "The predicate was observed to be true."},
	}
	tm.Criteria = []Criterion{
		{ID: "c_admissible", Measure: "admissible", Op: OpEQ, Value: 1},
		{ID: "c_satisfied", Measure: "satisfied", Op: OpEQ, Value: 1},
		{ID: "c_success", AllOf: []string{"c_admissible", "c_satisfied"}},
	}
	tm.Payout = PayoutRule{Clauses: []Clause{
		{When: "c_success", Pay: []PayItem{{Op: PayFixed, AmountMinor: 500}, {Op: PayFixed, AmountMinor: 1800}}},
		{When: "c_admissible", Pay: []PayItem{{Op: PayFixed, AmountMinor: 500}}},
		{Pay: []PayItem{{Op: PayFixed, AmountMinor: 0}}},
	}}
	if err := tm.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	escrow, err := MaxPayout(tm)
	if err != nil || escrow != 2300 {
		t.Fatalf("MaxPayout = %d, %v; want 2300", escrow, err)
	}

	for _, c := range []struct {
		name      string
		m         Measures
		wantGross int64
	}{
		{"admissible and true pays base plus bonus", Measures{"admissible": 1, "satisfied": 1}, 2300},
		{"admissible but false still pays the base fee", Measures{"admissible": 1, "satisfied": 0}, 500},
		{"inadmissible pays nothing", Measures{"admissible": 0, "satisfied": 0}, 0},
		{"inadmissible pays nothing even when true", Measures{"admissible": 0, "satisfied": 1}, 0},
	} {
		t.Run(c.name, func(t *testing.T) {
			got, err := Evaluate(tm, c.m, escrow)
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got.GrossMinor != c.wantGross {
				t.Errorf("gross = %d, want %d", got.GrossMinor, c.wantGross)
			}
		})
	}
}

func TestEvaluateRejectsOutOfBoundsMeasure(t *testing.T) {
	tm := contingentSavings(t)
	// A verdict reporting beyond the declared ceiling would let the payout
	// exceed the escrowed amount, so it must be refused outright.
	if _, err := Evaluate(tm, Measures{"realized_savings": 10_000_001}, 2_000_000); err == nil {
		t.Fatal("expected an error for a measure above its declared max")
	}
	if _, err := Evaluate(tm, Measures{}, 2_000_000); err == nil {
		t.Fatal("expected an error for a missing required measure")
	}
	if _, err := Evaluate(tm, Measures{"realized_savings": 100, "surprise": 1}, 2_000_000); err == nil {
		t.Fatal("expected an error for an undeclared measure")
	}
}

func TestEvaluateClampsToEscrow(t *testing.T) {
	tm := contingentSavings(t)
	// Under-escrowed (should not happen via MaxPayout, but the clamp is the
	// backstop that keeps conservation true regardless).
	got, err := Evaluate(tm, Measures{"realized_savings": 1_000_000}, 5000)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.GrossMinor != 5000 || got.RefundMinor != 0 {
		t.Errorf("expected gross clamped to escrow, got %+v", got)
	}
}

func TestFeeNeverExceedsGross(t *testing.T) {
	tm := qualifyingQuotes(t)
	tm.Fee = FeeRule{BP: 500, MinMinor: 100_000} // absurd floor
	if err := tm.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	got, err := Evaluate(tm, Measures{"qualifying_quotes": 3}, 4000)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.ProviderNet < 0 || got.FeeMinor > got.GrossMinor {
		t.Errorf("fee floor ate past the payout: %+v", got)
	}
}

func TestValidateRejectsMalformedTerms(t *testing.T) {
	cases := []struct {
		name string
		mut  func(*Terms)
		want string
	}{
		{"guarded final clause", func(tm *Terms) {
			tm.Criteria = []Criterion{{ID: "c", Measure: "m", Op: OpGTE, Value: 1}}
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5, Definition: "x"}}
			tm.Payout = PayoutRule{Clauses: []Clause{{When: "c", Pay: []PayItem{{Op: PayFixed}}}}}
		}, "total"},
		{"unguarded clause before others", func(tm *Terms) {
			tm.Criteria = []Criterion{{ID: "c", Measure: "m", Op: OpGTE, Value: 1}}
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5, Definition: "x"}}
			tm.Payout = PayoutRule{Clauses: []Clause{
				{Pay: []PayItem{{Op: PayFixed}}},
				{When: "c", Pay: []PayItem{{Op: PayFixed}}},
			}}
		}, "unreachable"},
		{"forward reference in combinator", func(tm *Terms) {
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5, Definition: "x"}}
			tm.Criteria = []Criterion{
				{ID: "c_a", AllOf: []string{"c_b"}},
				{ID: "c_b", Measure: "m", Op: OpGTE, Value: 1},
			}
		}, "declared earlier"},
		{"measure without max above min", func(tm *Terms) {
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Min: 5, Max: 1, Definition: "x"}}
		}, "max < min"},
		{"measure without definition", func(tm *Terms) {
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5}}
		}, "definition"},
		{"pct_of on a non-money measure", func(tm *Terms) {
			tm.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5, Definition: "x"}}
			tm.Payout = PayoutRule{Clauses: []Clause{
				{Pay: []PayItem{{Op: PayPctOf, Measure: "m", BP: 100}}},
			}}
		}, "money measure"},
		{"unknown deadline anchor", func(tm *Terms) {
			tm.Deadlines = []Deadline{{ID: "d", After: "whenever", Seconds: 10}}
		}, "anchor"},
		{"non-principal verifier", func(tm *Terms) { tm.Verifier = "alice" }, "principal"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			tm := baseTerms(t)
			c.mut(tm)
			err := tm.Validate()
			if err == nil {
				t.Fatalf("expected a validation error mentioning %q", c.want)
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not mention %q", err, c.want)
			}
		})
	}
}

// TestConservationProperty is the load-bearing property: across random valid
// measures, money is neither created nor destroyed, and the payout never
// exceeds what was escrowed on the strength of MaxPayout.
func TestConservationProperty(t *testing.T) {
	builders := []func(*testing.T) *Terms{contingentSavings, qualifyingQuotes}
	rng := rand.New(rand.NewSource(20260817))

	for _, build := range builders {
		tm := build(t)
		if err := tm.Validate(); err != nil {
			t.Fatalf("Validate: %v", err)
		}
		escrow, err := MaxPayout(tm)
		if err != nil {
			t.Fatalf("MaxPayout: %v", err)
		}
		for i := 0; i < 2000; i++ {
			m := Measures{}
			for _, d := range tm.Measures {
				span := d.Max - d.Min
				m[d.ID] = d.Min + rng.Int63n(span+1)
			}
			got, err := Evaluate(tm, m, escrow)
			if err != nil {
				t.Fatalf("Evaluate(%v): %v", m, err)
			}
			if got.ProviderNet+got.FeeMinor+got.RefundMinor != escrow {
				t.Fatalf("conservation violated for %v: %+v", m, got)
			}
			if got.GrossMinor > escrow {
				t.Fatalf("payout %d exceeds escrow %d for %v", got.GrossMinor, escrow, m)
			}
			if got.GrossMinor < 0 || got.FeeMinor < 0 || got.RefundMinor < 0 || got.ProviderNet < 0 {
				t.Fatalf("negative component for %v: %+v", m, got)
			}
		}
	}
}

func TestEvaluateIsDeterministic(t *testing.T) {
	tm := contingentSavings(t)
	m := Measures{"realized_savings": 73_211}
	first, err := Evaluate(tm, m, 2_000_000)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	for i := 0; i < 50; i++ {
		got, err := Evaluate(tm, m, 2_000_000)
		if err != nil {
			t.Fatalf("Evaluate: %v", err)
		}
		if !reflect.DeepEqual(got, first) {
			t.Fatalf("evaluation drifted on run %d: %+v vs %+v", i, got, first)
		}
	}
}

func TestTermsHashIsStableAndCanonical(t *testing.T) {
	a := contingentSavings(t)
	h1, err := a.Hash()
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	// Round-tripping through JSON must not change the hash: the canonical
	// encoder, not Go struct field order, defines the bytes.
	raw, err := json.Marshal(a)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var b Terms
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	h2, err := b.Hash()
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	if h1 != h2 {
		t.Errorf("terms hash changed across a JSON round trip: %s vs %s", h1, h2)
	}
	if len(h1) != 64 {
		t.Errorf("terms hash is not a sha256 hex digest: %q", h1)
	}
}

// TestNoFloatMoney guards the one property that makes cross-node agreement
// achievable rather than aspirational: no float anywhere in the money path.
func TestNoFloatMoney(t *testing.T) {
	types := []reflect.Type{
		reflect.TypeOf(Terms{}), reflect.TypeOf(Measure{}), reflect.TypeOf(Criterion{}),
		reflect.TypeOf(PayItem{}), reflect.TypeOf(Clause{}), reflect.TypeOf(PayoutRule{}),
		reflect.TypeOf(FeeRule{}), reflect.TypeOf(Deadline{}), reflect.TypeOf(Result{}),
	}
	seen := map[reflect.Type]bool{}
	var walk func(reflect.Type, string)
	walk = func(rt reflect.Type, path string) {
		if seen[rt] {
			return
		}
		seen[rt] = true
		switch rt.Kind() {
		case reflect.Float32, reflect.Float64:
			t.Errorf("%s is a float; money and measures must be int64", path)
		case reflect.Slice, reflect.Array, reflect.Ptr, reflect.Map:
			walk(rt.Elem(), path+"[]")
		case reflect.Struct:
			for i := 0; i < rt.NumField(); i++ {
				f := rt.Field(i)
				walk(f.Type, path+"."+f.Name)
			}
		}
	}
	for _, rt := range types {
		walk(rt, rt.Name())
	}
}

// vector is a conformance case shared with any other implementation of the
// spec. Vectors live under spec/vectors/terms and are the artifact that makes
// "every node evaluates identically" testable rather than a slogan.
type vector struct {
	Name          string   `json:"name"`
	Terms         *Terms   `json:"terms"`
	Measures      Measures `json:"measures"`
	EscrowMinor   int64    `json:"escrow_minor"`
	Expect        *Result  `json:"expect,omitempty"`
	ExpectError   string   `json:"expect_error,omitempty"`
	ExpectInvalid bool     `json:"expect_invalid,omitempty"`
}

var updateVectors = flag.Bool("update", false, "regenerate spec/vectors/terms from the cases in this file")

const vectorsDir = "../../../spec/vectors/terms"

// buildVectors defines the conformance corpus. Keeping the definitions in Go
// and generating the JSON means the published vectors cannot drift from the
// implementation; keeping the JSON in spec/ (Apache-2.0) means a second
// implementer can check their evaluator against ours without reading it.
func buildVectors(t *testing.T) []vector {
	t.Helper()
	savings := contingentSavings(t)
	quotes := qualifyingQuotes(t)

	withFee := contingentSavings(t)
	withFee.Fee = FeeRule{BP: 500, Round: RoundDown}

	halfUp := contingentSavings(t)
	halfUp.Payout.Clauses[0].Pay[0].Round = RoundHalfUp

	overflow := baseTerms(t)
	overflow.Measures = []Measure{{
		ID: "huge", Kind: MeasureCount, Min: 0, Max: 9_000_000_000_000_000_000,
		Definition: "A deliberately absurd ceiling.", Required: true,
	}}
	overflow.Payout = PayoutRule{Clauses: []Clause{
		{Pay: []PayItem{{Op: PayPerUnit, Measure: "huge", UnitAmountMinor: 1000}}},
	}}

	guardedLast := baseTerms(t)
	guardedLast.Measures = []Measure{{ID: "m", Kind: MeasureCount, Max: 5, Definition: "x"}}
	guardedLast.Criteria = []Criterion{{ID: "c", Measure: "m", Op: OpGTE, Value: 1}}
	guardedLast.Payout = PayoutRule{Clauses: []Clause{{When: "c", Pay: []PayItem{{Op: PayFixed, AmountMinor: 1}}}}}

	return []vector{
		{Name: "savings_below_threshold", Terms: savings,
			Measures: Measures{"realized_savings": 4999}, EscrowMinor: 2_000_000},
		{Name: "savings_at_threshold", Terms: savings,
			Measures: Measures{"realized_savings": 5000}, EscrowMinor: 2_000_000},
		{Name: "savings_above_threshold", Terms: savings,
			Measures: Measures{"realized_savings": 11500}, EscrowMinor: 2_000_000},
		{Name: "savings_rounds_down", Terms: savings,
			Measures: Measures{"realized_savings": 5009}, EscrowMinor: 2_000_000},
		{Name: "savings_rounds_half_up", Terms: halfUp,
			Measures: Measures{"realized_savings": 5009}, EscrowMinor: 2_000_000},
		{Name: "savings_with_exchange_fee", Terms: withFee,
			Measures: Measures{"realized_savings": 11500}, EscrowMinor: 2_000_000},
		{Name: "quotes_short_of_three", Terms: quotes,
			Measures: Measures{"qualifying_quotes": 2}, EscrowMinor: 4000},
		{Name: "quotes_exactly_three", Terms: quotes,
			Measures: Measures{"qualifying_quotes": 3}, EscrowMinor: 4000},
		{Name: "measure_above_declared_max", Terms: savings,
			Measures: Measures{"realized_savings": 10_000_001}, EscrowMinor: 2_000_000,
			ExpectError: "outside its declared range"},
		{Name: "required_measure_missing", Terms: savings,
			Measures: Measures{}, EscrowMinor: 2_000_000,
			ExpectError: "required measure"},
		{Name: "payout_overflows_int64", Terms: overflow,
			Measures: Measures{"huge": 9_000_000_000_000_000_000}, EscrowMinor: 1000,
			ExpectError: "overflows int64"},
		{Name: "invalid_guarded_final_clause", Terms: guardedLast,
			Measures: Measures{"m": 1}, EscrowMinor: 1, ExpectInvalid: true},
	}
}

func TestWriteConformanceVectors(t *testing.T) {
	if !*updateVectors {
		t.Skip("run with -update to regenerate spec/vectors/terms")
	}
	if err := os.MkdirAll(vectorsDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	old, _ := filepath.Glob(filepath.Join(vectorsDir, "*.json"))
	for _, p := range old {
		if err := os.Remove(p); err != nil {
			t.Fatalf("remove %s: %v", p, err)
		}
	}
	for _, v := range buildVectors(t) {
		if v.ExpectError == "" && !v.ExpectInvalid {
			got, err := Evaluate(v.Terms, v.Measures, v.EscrowMinor)
			if err != nil {
				t.Fatalf("vector %s: Evaluate: %v", v.Name, err)
			}
			got.Criteria = nil // derived; the vector pins the money, not the trace
			v.Expect = &got
		}
		raw, err := json.MarshalIndent(v, "", "  ")
		if err != nil {
			t.Fatalf("vector %s: marshal: %v", v.Name, err)
		}
		path := filepath.Join(vectorsDir, v.Name+".json")
		if err := os.WriteFile(path, append(raw, '\n'), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
}

func TestConformanceVectors(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join(vectorsDir, "*.json"))
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	if len(paths) == 0 {
		t.Fatalf("no conformance vectors found in %s (run go test -run TestWriteConformanceVectors -update)", vectorsDir)
	}
	for _, p := range paths {
		t.Run(filepath.Base(p), func(t *testing.T) {
			raw, err := os.ReadFile(p)
			if err != nil {
				t.Fatalf("read: %v", err)
			}
			var v vector
			if err := json.Unmarshal(raw, &v); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			err = v.Terms.Validate()
			if v.ExpectInvalid {
				if err == nil {
					t.Fatal("expected the terms to fail validation")
				}
				return
			}
			if err != nil {
				t.Fatalf("Validate: %v", err)
			}
			got, err := Evaluate(v.Terms, v.Measures, v.EscrowMinor)
			if v.ExpectError != "" {
				if err == nil || !strings.Contains(err.Error(), v.ExpectError) {
					t.Fatalf("expected an error containing %q, got %v", v.ExpectError, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Evaluate: %v", err)
			}
			if got.GrossMinor != v.Expect.GrossMinor ||
				got.FeeMinor != v.Expect.FeeMinor ||
				got.ProviderNet != v.Expect.ProviderNet ||
				got.RefundMinor != v.Expect.RefundMinor {
				t.Errorf("got gross=%d fee=%d net=%d refund=%d; want gross=%d fee=%d net=%d refund=%d",
					got.GrossMinor, got.FeeMinor, got.ProviderNet, got.RefundMinor,
					v.Expect.GrossMinor, v.Expect.FeeMinor, v.Expect.ProviderNet, v.Expect.RefundMinor)
			}
		})
	}
}
