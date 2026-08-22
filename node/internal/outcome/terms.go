// Package outcome implements the Lamdis Exchange: the contract terms, state
// machine, and settlement semantics for buying outcomes. An outcome is one
// thread; its lifecycle is a sequence of signed extension entries, and its
// state is a pure fold over them.
//
// The terms of an outcome are a typed, total document rather than an
// expression language. Every quantity is an int64 — money in minor units,
// ratios in basis points, durations in seconds, booleans as 0/1. No float
// exists anywhere in this package's type graph; that is what makes two nodes
// evaluating the same terms against the same measures agree exactly.
package outcome

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// TermsVersion is the terms document version, fixed until the spec freezes.
const TermsVersion = 0

// MeasureKind is the unit of a measure. All are carried as int64.
type MeasureKind string

const (
	MeasureMoney    MeasureKind = "money"      // minor units of Terms.Currency
	MeasureCount    MeasureKind = "count"      // a cardinal number
	MeasureRatioBP  MeasureKind = "ratio_bp"   // basis points; 10000 == 100%
	MeasureDuration MeasureKind = "duration_s" // seconds
	MeasureBool     MeasureKind = "bool"       // 0 or 1
)

func (k MeasureKind) valid() bool {
	switch k {
	case MeasureMoney, MeasureCount, MeasureRatioBP, MeasureDuration, MeasureBool:
		return true
	}
	return false
}

// Measure is a quantity the verifier reports. Definition is the prose the
// verifier attests to; it is not machine-evaluated, but terms_hash commits to
// it, so the wording is non-repudiable even though it is not automated.
//
// Max is mandatory. It is what makes MaxPayout computable, and MaxPayout is
// what gets escrowed — without it, a contingent contract cannot be pre-funded.
type Measure struct {
	ID         string      `json:"id"`
	Kind       MeasureKind `json:"kind"`
	Min        int64       `json:"min"`
	Max        int64       `json:"max"`
	Definition string      `json:"definition"`
	Required   bool        `json:"required,omitempty"`
}

// Comparison operators for a criterion over a measure.
const (
	OpGTE = "gte"
	OpGT  = "gt"
	OpLTE = "lte"
	OpLT  = "lt"
	OpEQ  = "eq"
	OpNEQ = "neq"
)

// Criterion is a named boolean. It is either a comparison against one measure
// or a combinator over criteria declared *earlier in the array*. That ordering
// rule is what makes evaluation a single forward pass: no topological sort, no
// cycle detection, no ambiguity about evaluation order.
type Criterion struct {
	ID string `json:"id"`

	// Comparison form.
	Measure string `json:"measure,omitempty"`
	Op      string `json:"op,omitempty"`
	Value   int64  `json:"value,omitempty"`

	// Combinator form (exactly one of these, referencing earlier criteria).
	AllOf []string `json:"all_of,omitempty"`
	AnyOf []string `json:"any_of,omitempty"`
	Not   string   `json:"not,omitempty"`
}

// PayItem ops.
const (
	PayFixed   = "fixed"
	PayPctOf   = "pct_of"
	PayPerUnit = "per_unit"
)

// Rounding modes. Down truncates toward zero, which favors the buyer — the
// party whose money sits in escrow.
const (
	RoundDown   = "down"
	RoundHalfUp = "half_up"
)

// PayItem is one term of a payout clause.
type PayItem struct {
	Op string `json:"op"`

	AmountMinor int64 `json:"amount_minor,omitempty"` // fixed

	Measure         string `json:"measure,omitempty"`           // pct_of, per_unit
	BP              int64  `json:"bp,omitempty"`                // pct_of: basis points
	UnitAmountMinor int64  `json:"unit_amount_minor,omitempty"` // per_unit

	CapMinor   int64  `json:"cap_minor,omitempty"`
	FloorMinor int64  `json:"floor_minor,omitempty"`
	Round      string `json:"round,omitempty"` // default RoundDown
}

// Clause pays out when its guard criterion holds. First match wins, and the
// final clause must be unguarded — that is what makes the rule total, so
// "undefined payout" is unrepresentable.
type Clause struct {
	When string    `json:"when,omitempty"` // criterion id; empty = always
	Pay  []PayItem `json:"pay"`
}

// PayoutRule is the ordered clause list.
type PayoutRule struct {
	Clauses []Clause `json:"clauses"`
}

// FeeRule is the exchange's cut of the gross payout. Kept deliberately simple:
// one basis-point rate with an optional floor and cap. Together with pct_of it
// accounts for the only two divisions in the whole system.
type FeeRule struct {
	BP       int64  `json:"bp"`
	MinMinor int64  `json:"min_minor,omitempty"`
	CapMinor int64  `json:"cap_minor,omitempty"`
	Round    string `json:"round,omitempty"` // default RoundDown
}

// Deadline anchors are the lifecycle events a deadline counts from. They are
// relative, never absolute, so the fold never needs a clock.
const (
	AnchorRequest  = "request"
	AnchorAccept   = "accept"
	AnchorAward    = "award"
	AnchorEvidence = "evidence"
	AnchorVerdict  = "verdict"
	AnchorDispute  = "dispute"
	AnchorEscalate = "escalate"
)

// Well-known deadline ids.
const (
	DeadlineBid          = "bid_deadline"
	DeadlineAward        = "award_deadline"
	DeadlineEvidence     = "evidence_deadline"
	DeadlineVerification = "verification_deadline"
	DeadlineDispute      = "dispute_window"
	DeadlineArbitration  = "arbitration_deadline"
	DeadlineEscalation   = "escalation_deadline"
)

// Deadline is a duration measured from a named anchor entry.
type Deadline struct {
	ID      string `json:"id"`
	After   string `json:"after"`
	Seconds int64  `json:"seconds"`
}

// Timeout dispositions.
const (
	TimeoutFail    = "fail"
	TimeoutPass    = "pass"
	TimeoutRefund  = "refund"
	TimeoutVerdict = "verdict"
)

// Terms is the frozen contract. It names every role explicitly so that the
// concentration of roles in one operator is disclosed in the signed artifact
// rather than hidden in the implementation.
type Terms struct {
	V        int    `json:"v"`
	Currency string `json:"currency"` // ISO-4217, uppercase
	Scale    int    `json:"scale"`    // minor-unit exponent; 2 for USD

	Verifier    string `json:"verifier"`
	Arbiter     string `json:"arbiter"`
	EscrowAgent string `json:"escrow_agent"`
	Timekeeper  string `json:"timekeeper"`

	Measures []Measure   `json:"measures"`
	Criteria []Criterion `json:"criteria"`
	Payout   PayoutRule  `json:"payout"`
	Fee      FeeRule     `json:"fee"`

	Deadlines             []Deadline `json:"deadlines"`
	OnVerificationTimeout string     `json:"on_verification_timeout"` // fail | pass
	OnArbitrationTimeout  string     `json:"on_arbitration_timeout"`  // refund | verdict
}

var (
	idRe        = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)
	currencyRe  = regexp.MustCompile(`^[A-Z]{3}$`)
	principalRe = regexp.MustCompile(`^ed25519:[0-9A-HJKMNP-TV-Z]{52}$`)
)

// Validate checks every structural rule the evaluator relies on. Evaluate
// assumes validated terms; the engine must never accept unvalidated ones.
func (t *Terms) Validate() error {
	if t.V != TermsVersion {
		return fmt.Errorf("terms: unsupported version %d", t.V)
	}
	if !currencyRe.MatchString(t.Currency) {
		return fmt.Errorf("terms: currency must be a 3-letter uppercase ISO-4217 code, got %q", t.Currency)
	}
	if t.Scale < 0 || t.Scale > 8 {
		return fmt.Errorf("terms: scale %d out of range", t.Scale)
	}
	for name, p := range map[string]string{
		"verifier": t.Verifier, "arbiter": t.Arbiter,
		"escrow_agent": t.EscrowAgent, "timekeeper": t.Timekeeper,
	} {
		if !principalRe.MatchString(p) {
			return fmt.Errorf("terms: %s is not a principal id", name)
		}
	}

	measures := map[string]*Measure{}
	for i := range t.Measures {
		m := &t.Measures[i]
		if !idRe.MatchString(m.ID) {
			return fmt.Errorf("terms: invalid measure id %q", m.ID)
		}
		if _, dup := measures[m.ID]; dup {
			return fmt.Errorf("terms: duplicate measure id %q", m.ID)
		}
		if !m.Kind.valid() {
			return fmt.Errorf("terms: measure %s has invalid kind %q", m.ID, m.Kind)
		}
		if m.Max < m.Min {
			return fmt.Errorf("terms: measure %s has max < min", m.ID)
		}
		if m.Kind == MeasureBool && (m.Min != 0 || m.Max != 1) {
			return fmt.Errorf("terms: bool measure %s must have min 0 and max 1", m.ID)
		}
		if strings.TrimSpace(m.Definition) == "" {
			return fmt.Errorf("terms: measure %s needs a definition the verifier can attest to", m.ID)
		}
		measures[m.ID] = m
	}

	seen := map[string]bool{}
	for _, c := range t.Criteria {
		if !idRe.MatchString(c.ID) {
			return fmt.Errorf("terms: invalid criterion id %q", c.ID)
		}
		if seen[c.ID] {
			return fmt.Errorf("terms: duplicate criterion id %q", c.ID)
		}
		forms := 0
		if c.Measure != "" {
			forms++
			if _, ok := measures[c.Measure]; !ok {
				return fmt.Errorf("terms: criterion %s references unknown measure %q", c.ID, c.Measure)
			}
			switch c.Op {
			case OpGTE, OpGT, OpLTE, OpLT, OpEQ, OpNEQ:
			default:
				return fmt.Errorf("terms: criterion %s has invalid op %q", c.ID, c.Op)
			}
		}
		if len(c.AllOf) > 0 {
			forms++
		}
		if len(c.AnyOf) > 0 {
			forms++
		}
		if c.Not != "" {
			forms++
		}
		if forms != 1 {
			return fmt.Errorf("terms: criterion %s must use exactly one form", c.ID)
		}
		// Forward-only references: a combinator may only name criteria that
		// were declared before it.
		for _, ref := range append(append([]string{}, c.AllOf...), c.AnyOf...) {
			if !seen[ref] {
				return fmt.Errorf("terms: criterion %s references %q which is not declared earlier", c.ID, ref)
			}
		}
		if c.Not != "" && !seen[c.Not] {
			return fmt.Errorf("terms: criterion %s negates %q which is not declared earlier", c.ID, c.Not)
		}
		seen[c.ID] = true
	}

	if len(t.Payout.Clauses) == 0 {
		return fmt.Errorf("terms: payout needs at least one clause")
	}
	for i, cl := range t.Payout.Clauses {
		last := i == len(t.Payout.Clauses)-1
		if last && cl.When != "" {
			return fmt.Errorf("terms: the final payout clause must be unguarded so the rule is total")
		}
		if !last && cl.When == "" {
			return fmt.Errorf("terms: payout clause %d is unguarded but not last; later clauses are unreachable", i)
		}
		if cl.When != "" && !seen[cl.When] {
			return fmt.Errorf("terms: payout clause %d guards on unknown criterion %q", i, cl.When)
		}
		if len(cl.Pay) == 0 {
			return fmt.Errorf("terms: payout clause %d has no pay items", i)
		}
		for j, p := range cl.Pay {
			if err := p.validate(measures); err != nil {
				return fmt.Errorf("terms: payout clause %d item %d: %w", i, j, err)
			}
		}
	}

	if t.Fee.BP < 0 || t.Fee.BP > 10000 {
		return fmt.Errorf("terms: fee bp %d out of range", t.Fee.BP)
	}
	if t.Fee.MinMinor < 0 || t.Fee.CapMinor < 0 {
		return fmt.Errorf("terms: fee floor and cap must be non-negative")
	}
	if t.Fee.CapMinor > 0 && t.Fee.CapMinor < t.Fee.MinMinor {
		return fmt.Errorf("terms: fee cap is below fee floor")
	}
	if err := validRound(t.Fee.Round); err != nil {
		return fmt.Errorf("terms: fee: %w", err)
	}

	deadlines := map[string]bool{}
	for _, d := range t.Deadlines {
		if !idRe.MatchString(d.ID) {
			return fmt.Errorf("terms: invalid deadline id %q", d.ID)
		}
		if deadlines[d.ID] {
			return fmt.Errorf("terms: duplicate deadline id %q", d.ID)
		}
		switch d.After {
		case AnchorRequest, AnchorAccept, AnchorAward, AnchorEvidence, AnchorVerdict,
			AnchorDispute, AnchorEscalate:
		default:
			return fmt.Errorf("terms: deadline %s has unknown anchor %q", d.ID, d.After)
		}
		if d.Seconds <= 0 {
			return fmt.Errorf("terms: deadline %s must be positive", d.ID)
		}
		deadlines[d.ID] = true
	}

	switch t.OnVerificationTimeout {
	case TimeoutFail, TimeoutPass:
	default:
		return fmt.Errorf("terms: on_verification_timeout must be %q or %q", TimeoutFail, TimeoutPass)
	}
	switch t.OnArbitrationTimeout {
	case TimeoutRefund, TimeoutVerdict:
	default:
		return fmt.Errorf("terms: on_arbitration_timeout must be %q or %q", TimeoutRefund, TimeoutVerdict)
	}
	return nil
}

func (p *PayItem) validate(measures map[string]*Measure) error {
	if err := validRound(p.Round); err != nil {
		return err
	}
	if p.CapMinor < 0 || p.FloorMinor < 0 {
		return fmt.Errorf("cap and floor must be non-negative")
	}
	if p.CapMinor > 0 && p.CapMinor < p.FloorMinor {
		return fmt.Errorf("cap is below floor")
	}
	switch p.Op {
	case PayFixed:
		if p.AmountMinor < 0 {
			return fmt.Errorf("fixed amount must be non-negative")
		}
	case PayPctOf:
		if p.BP < 0 {
			return fmt.Errorf("bp must be non-negative")
		}
		m, ok := measures[p.Measure]
		if !ok {
			return fmt.Errorf("references unknown measure %q", p.Measure)
		}
		if m.Kind != MeasureMoney {
			return fmt.Errorf("pct_of requires a money measure, %s is %s", m.ID, m.Kind)
		}
	case PayPerUnit:
		if p.UnitAmountMinor < 0 {
			return fmt.Errorf("unit amount must be non-negative")
		}
		m, ok := measures[p.Measure]
		if !ok {
			return fmt.Errorf("references unknown measure %q", p.Measure)
		}
		if m.Kind == MeasureMoney {
			return fmt.Errorf("per_unit requires a non-money measure, %s is money", m.ID)
		}
	default:
		return fmt.Errorf("unknown op %q", p.Op)
	}
	return nil
}

func validRound(r string) error {
	switch r {
	case "", RoundDown, RoundHalfUp:
		return nil
	}
	return fmt.Errorf("unknown rounding mode %q", r)
}

// Hash returns the terms_hash: sha256 over the protocol's canonical JSON
// encoding. Uses the same encoder as entry signing so that a verdict
// committing to terms_hash commits to exactly the bytes a third party will
// re-canonicalize when checking the attestation offline.
func (t *Terms) Hash() (string, error) {
	raw, err := json.Marshal(t)
	if err != nil {
		return "", err
	}
	canon, err := protolog.CanonicalJSON(raw)
	if err != nil {
		return "", err
	}
	return sha256Hex(canon), nil
}
