package outcome

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// Measures is a verdict's reported values, keyed by measure id.
type Measures map[string]int64

// Result is the settlement arithmetic for one verdict. The invariant
//
//	ProviderNet + FeeMinor + RefundMinor == EscrowMinor
//
// holds exactly, in integer minor units. Evaluate refuses to return a Result
// that does not satisfy it, which is what makes "money vanished" and "money
// materialized" unrepresentable rather than merely disallowed.
type Result struct {
	EscrowMinor int64 `json:"escrow_minor"`
	GrossMinor  int64 `json:"gross_minor"`  // what the clause awarded, clamped to escrow
	FeeMinor    int64 `json:"fee_minor"`    // exchange's cut, taken out of gross
	ProviderNet int64 `json:"provider_net"` // gross - fee
	RefundMinor int64 `json:"refund_minor"` // escrow - gross

	ClauseIndex int             `json:"clause_index"`
	Criteria    map[string]bool `json:"criteria"`
}

const bpDivisor = 10000

// Evaluate applies validated terms to a verdict's measures. It is pure: no
// clock, no I/O, no map-iteration-order dependence.
func Evaluate(t *Terms, m Measures, escrowMinor int64) (Result, error) {
	var zero Result
	if escrowMinor < 0 {
		return zero, fmt.Errorf("evaluate: escrow must be non-negative")
	}
	if err := checkMeasures(t, m); err != nil {
		return zero, err
	}
	crit, err := evalCriteria(t, m)
	if err != nil {
		return zero, err
	}

	idx, clause := -1, Clause{}
	for i, cl := range t.Payout.Clauses {
		if cl.When == "" || crit[cl.When] {
			idx, clause = i, cl
			break
		}
	}
	if idx < 0 {
		// Unreachable for validated terms: the final clause is unguarded.
		return zero, fmt.Errorf("evaluate: no payout clause matched")
	}

	total := big.NewInt(0)
	for j, p := range clause.Pay {
		v, err := evalPayItem(&p, m)
		if err != nil {
			return zero, fmt.Errorf("evaluate: clause %d item %d: %w", idx, j, err)
		}
		total.Add(total, v)
	}

	gross, err := toInt64(total, "payout")
	if err != nil {
		return zero, err
	}
	if gross < 0 {
		gross = 0
	}
	if gross > escrowMinor {
		gross = escrowMinor
	}

	fee, err := applyFee(&t.Fee, gross)
	if err != nil {
		return zero, err
	}

	r := Result{
		EscrowMinor: escrowMinor,
		GrossMinor:  gross,
		FeeMinor:    fee,
		ProviderNet: gross - fee,
		RefundMinor: escrowMinor - gross,
		ClauseIndex: idx,
		Criteria:    crit,
	}
	if r.ProviderNet+r.FeeMinor+r.RefundMinor != escrowMinor {
		return zero, fmt.Errorf("evaluate: conservation violated (%d + %d + %d != %d)",
			r.ProviderNet, r.FeeMinor, r.RefundMinor, escrowMinor)
	}
	if r.ProviderNet < 0 {
		return zero, fmt.Errorf("evaluate: fee %d exceeds gross payout %d", fee, gross)
	}
	return r, nil
}

// MaxPayout is the largest gross payout the terms can produce, evaluated with
// every measure at its declared Max. This is the amount that must be escrowed:
// without it a contingent contract ("20% of realized savings") cannot be
// pre-funded, which is why Measure.Max is mandatory.
func MaxPayout(t *Terms) (int64, error) {
	extreme := make(Measures, len(t.Measures))
	for _, m := range t.Measures {
		extreme[m.ID] = m.Max
	}
	var max int64
	for i, cl := range t.Payout.Clauses {
		total := big.NewInt(0)
		for j, p := range cl.Pay {
			v, err := evalPayItem(&p, extreme)
			if err != nil {
				return 0, fmt.Errorf("max payout: clause %d item %d: %w", i, j, err)
			}
			total.Add(total, v)
		}
		got, err := toInt64(total, "max payout")
		if err != nil {
			return 0, err
		}
		if got > max {
			max = got
		}
	}
	return max, nil
}

func checkMeasures(t *Terms, m Measures) error {
	declared := make(map[string]bool, len(t.Measures))
	for _, d := range t.Measures {
		declared[d.ID] = true
		v, ok := m[d.ID]
		if !ok {
			if d.Required {
				return fmt.Errorf("evaluate: required measure %q is missing from the verdict", d.ID)
			}
			continue
		}
		if v < d.Min || v > d.Max {
			return fmt.Errorf("evaluate: measure %q reported %d, outside its declared range [%d,%d]",
				d.ID, v, d.Min, d.Max)
		}
	}
	for id := range m {
		if !declared[id] {
			return fmt.Errorf("evaluate: verdict reports undeclared measure %q", id)
		}
	}
	return nil
}

// evalCriteria walks the criteria array once, in order. The forward-only
// reference rule enforced by Validate is what makes a single pass sufficient.
func evalCriteria(t *Terms, m Measures) (map[string]bool, error) {
	out := make(map[string]bool, len(t.Criteria))
	for _, c := range t.Criteria {
		switch {
		case c.Measure != "":
			v, ok := m[c.Measure]
			if !ok {
				// An optional, unreported measure makes its criterion false
				// rather than erroring: absence is not satisfaction.
				out[c.ID] = false
				continue
			}
			out[c.ID] = compare(v, c.Op, c.Value)
		case len(c.AllOf) > 0:
			all := true
			for _, ref := range c.AllOf {
				if !out[ref] {
					all = false
					break
				}
			}
			out[c.ID] = all
		case len(c.AnyOf) > 0:
			any := false
			for _, ref := range c.AnyOf {
				if out[ref] {
					any = true
					break
				}
			}
			out[c.ID] = any
		case c.Not != "":
			out[c.ID] = !out[c.Not]
		default:
			return nil, fmt.Errorf("evaluate: criterion %q has no form", c.ID)
		}
	}
	return out, nil
}

func compare(v int64, op string, want int64) bool {
	switch op {
	case OpGTE:
		return v >= want
	case OpGT:
		return v > want
	case OpLTE:
		return v <= want
	case OpLT:
		return v < want
	case OpEQ:
		return v == want
	case OpNEQ:
		return v != want
	}
	return false
}

// evalPayItem returns the item's contribution as a big.Int so that overflow
// becomes a validation failure at settlement time rather than a wraparound.
func evalPayItem(p *PayItem, m Measures) (*big.Int, error) {
	var v *big.Int
	switch p.Op {
	case PayFixed:
		v = big.NewInt(p.AmountMinor)
	case PayPctOf:
		measure := big.NewInt(m[p.Measure])
		v = divRound(new(big.Int).Mul(measure, big.NewInt(p.BP)), big.NewInt(bpDivisor), p.Round)
	case PayPerUnit:
		v = new(big.Int).Mul(big.NewInt(m[p.Measure]), big.NewInt(p.UnitAmountMinor))
	default:
		return nil, fmt.Errorf("unknown op %q", p.Op)
	}
	if p.FloorMinor > 0 && v.Cmp(big.NewInt(p.FloorMinor)) < 0 {
		v = big.NewInt(p.FloorMinor)
	}
	if p.CapMinor > 0 && v.Cmp(big.NewInt(p.CapMinor)) > 0 {
		v = big.NewInt(p.CapMinor)
	}
	return v, nil
}

// divRound divides n by d under the named mode. RoundDown truncates toward
// zero; RoundHalfUp rounds halves away from zero. Both are symmetric about
// zero, so a sign flip in a measure cannot change which way the money moves.
func divRound(n, d *big.Int, mode string) *big.Int {
	if mode == RoundHalfUp {
		half := new(big.Int).Rsh(new(big.Int).Abs(d), 1)
		if n.Sign() < 0 {
			half.Neg(half)
		}
		n = new(big.Int).Add(n, half)
	}
	return new(big.Int).Quo(n, d) // Quo truncates toward zero
}

func applyFee(f *FeeRule, gross int64) (int64, error) {
	v := divRound(new(big.Int).Mul(big.NewInt(gross), big.NewInt(f.BP)), big.NewInt(bpDivisor), f.Round)
	fee, err := toInt64(v, "fee")
	if err != nil {
		return 0, err
	}
	if fee < f.MinMinor {
		fee = f.MinMinor
	}
	if f.CapMinor > 0 && fee > f.CapMinor {
		fee = f.CapMinor
	}
	// A fee floor must never eat into a payout that is smaller than the floor.
	if fee > gross {
		fee = gross
	}
	return fee, nil
}

func toInt64(v *big.Int, what string) (int64, error) {
	if !v.IsInt64() {
		return 0, fmt.Errorf("%s overflows int64 (%s); tighten the measure bounds", what, v.String())
	}
	return v.Int64(), nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
