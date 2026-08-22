package outcome

import (
	"fmt"
	"time"
)

// ObservationSpec describes the standard contract for "observe whether this
// predicate holds" — the shape almost every physical-world outcome takes.
//
// The payout is deliberately split into a base fee and a success bonus. The
// base fee is earned by submitting admissible evidence at the requested tier,
// whether or not the predicate turns out to be true; only the bonus depends on
// the verdict. Without that split every provider — including the second,
// "independent" one in a corroborated verification — is paid only when the
// answer is yes, so answering yes is dominant and corroboration is theater.
// This is the load-bearing interface between settlement and verification.
type ObservationSpec struct {
	Currency string
	Scale    int

	Verifier    string
	Arbiter     string
	EscrowAgent string
	Timekeeper  string

	// PredicateDefinition is the prose the verifier attests to. terms_hash
	// commits to it, so the wording is non-repudiable even though it is not
	// machine-evaluated.
	PredicateDefinition string

	BaseFeeMinor      int64 // paid for admissible evidence, regardless of verdict
	SuccessBonusMinor int64 // paid additionally when the predicate holds
	FeeBP             int64 // the exchange's cut of the gross payout

	EvidenceDeadline     time.Duration
	VerificationDeadline time.Duration
	DisputeWindow        time.Duration
	ArbitrationDeadline  time.Duration
	// EscalationDeadline bounds how long this outcome may wait on a child
	// review before the buyer gets their money back. Without it, an outcome
	// bound to a panel that never reports holds the escrow forever.
	EscalationDeadline time.Duration
}

// Standard measure and criterion ids for the observation contract.
const (
	MeasureAdmissible = "admissible"
	MeasureSatisfied  = "satisfied"

	CriterionAdmissible = "c_admissible"
	CriterionSatisfied  = "c_satisfied"
	CriterionSuccess    = "c_success"
)

// Build produces validated terms from the spec.
func (o ObservationSpec) Build() (*Terms, error) {
	if o.Scale == 0 {
		o.Scale = 2
	}
	if o.BaseFeeMinor < 0 || o.SuccessBonusMinor < 0 {
		return nil, fmt.Errorf("observation terms: amounts must be non-negative")
	}
	if o.EscalationDeadline == 0 {
		o.EscalationDeadline = 72 * time.Hour
	}
	secs := func(d time.Duration) int64 {
		if d <= 0 {
			return 3600
		}
		return int64(d / time.Second)
	}

	t := &Terms{
		V: TermsVersion, Currency: o.Currency, Scale: o.Scale,
		Verifier: o.Verifier, Arbiter: o.Arbiter,
		EscrowAgent: o.EscrowAgent, Timekeeper: o.Timekeeper,
		Measures: []Measure{
			{
				ID: MeasureAdmissible, Kind: MeasureBool, Min: 0, Max: 1, Required: true,
				Definition: "Evidence was submitted that meets the requested verification tier: " +
					"it is attributable, fresh, and not a reuse of earlier evidence.",
			},
			{
				ID: MeasureSatisfied, Kind: MeasureBool, Min: 0, Max: 1, Required: true,
				Definition: o.PredicateDefinition,
			},
		},
		Criteria: []Criterion{
			{ID: CriterionAdmissible, Measure: MeasureAdmissible, Op: OpEQ, Value: 1},
			{ID: CriterionSatisfied, Measure: MeasureSatisfied, Op: OpEQ, Value: 1},
			{ID: CriterionSuccess, AllOf: []string{CriterionAdmissible, CriterionSatisfied}},
		},
		Payout: PayoutRule{Clauses: []Clause{
			{When: CriterionSuccess, Pay: []PayItem{
				{Op: PayFixed, AmountMinor: o.BaseFeeMinor},
				{Op: PayFixed, AmountMinor: o.SuccessBonusMinor},
			}},
			{When: CriterionAdmissible, Pay: []PayItem{
				{Op: PayFixed, AmountMinor: o.BaseFeeMinor},
			}},
			{Pay: []PayItem{{Op: PayFixed, AmountMinor: 0}}},
		}},
		Fee: FeeRule{BP: o.FeeBP, Round: RoundDown},
		Deadlines: []Deadline{
			{ID: DeadlineEvidence, After: AnchorAward, Seconds: secs(o.EvidenceDeadline)},
			{ID: DeadlineVerification, After: AnchorEvidence, Seconds: secs(o.VerificationDeadline)},
			{ID: DeadlineDispute, After: AnchorVerdict, Seconds: secs(o.DisputeWindow)},
			{ID: DeadlineArbitration, After: AnchorDispute, Seconds: secs(o.ArbitrationDeadline)},
			{ID: DeadlineEscalation, After: AnchorEscalate, Seconds: secs(o.EscalationDeadline)},
		},
		OnVerificationTimeout: TimeoutFail,
		OnArbitrationTimeout:  TimeoutRefund,
	}
	if err := t.Validate(); err != nil {
		return nil, err
	}
	return t, nil
}

// Observed builds the measures for a verdict on an observation contract.
func Observed(admissible, satisfied bool) Measures {
	b := func(v bool) int64 {
		if v {
			return 1
		}
		return 0
	}
	return Measures{MeasureAdmissible: b(admissible), MeasureSatisfied: b(satisfied)}
}
