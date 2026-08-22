package outcome

import "fmt"

// Escalation is what happens when automated verification cannot certify an
// outcome either way.
//
// The wrong move is to let the buyer's money sit while a person is found, or
// to guess. Instead the inconclusive outcome spawns a *second* outcome whose
// predicate is "a qualified human certified the first one", with its own
// terms, its own escrow, its own evidence, and its own verdict. Human review
// is not a special case bolted onto the machine; it is another thing the
// exchange knows how to buy, and it is priced like everything else.
//
// Two properties fall out of modelling it that way. The reviewer is paid for
// admissible work whether they confirm or refute, so an honest "I could not
// tell either" is not a losing move. And the review is itself verifiable: it
// produces signed evidence on its own thread that a third party can audit
// exactly like any other outcome.
type Escalation struct {
	// Parent is the outcome that could not be certified.
	Parent string
	// ParentVerdict is the entry whose confidence landed in the ambiguous band.
	ParentVerdict string
	// Question is what the reviewer is being asked, in plain language.
	Question string
	// EvidenceRefs are the artifacts from the parent the reviewer must look at.
	EvidenceRefs []string
	// Reviewers is how many independent people must answer.
	Reviewers int
	// Agreement is how many of them must agree for the answer to stand.
	Agreement int
	// FeeMinor is paid to each reviewer who returns an admissible answer,
	// regardless of which way they answer.
	FeeMinor int64
	// BonusMinor is paid additionally to reviewers in the agreeing majority,
	// which rewards being decisive without rewarding any particular verdict.
	BonusMinor int64
	Currency   string
}

// Validate checks an escalation is coherent before it is sold.
func (e Escalation) Validate() error {
	switch {
	case e.Parent == "":
		return fmt.Errorf("escalation: no parent outcome")
	case e.Question == "":
		return fmt.Errorf("escalation: no question for the reviewer")
	case e.Reviewers < 1:
		return fmt.Errorf("escalation: needs at least one reviewer")
	case e.Agreement < 1 || e.Agreement > e.Reviewers:
		return fmt.Errorf("escalation: agreement of %d is impossible with %d reviewers",
			e.Agreement, e.Reviewers)
	case e.Reviewers > 1 && e.Agreement*2 <= e.Reviewers:
		// A "majority" that is not a majority would let a tie decide.
		return fmt.Errorf("escalation: %d of %d is not a majority", e.Agreement, e.Reviewers)
	case e.FeeMinor < 0 || e.BonusMinor < 0:
		return fmt.Errorf("escalation: fees must be non-negative")
	}
	return nil
}

// Standard reviewer-panel measure and criterion ids.
const (
	MeasureReviewsAdmissible = "reviews_admissible"
	MeasureReviewsAgreeing   = "reviews_agreeing"
	MeasureReviewFinding     = "review_finding"

	CriterionPanelComplete = "c_panel_complete"
	CriterionPanelAgreed   = "c_panel_agreed"
)

// Terms builds the contract for a human-review outcome.
//
// The panel is paid per admissible review, plus a bonus once enough of them
// agree. Note what is deliberately *not* in the payout: which way they agreed.
// Paying more for "yes" than for "no" would buy the answer rather than the
// judgment, and would reproduce at the review layer exactly the bias the base
// fee exists to remove at the provider layer.
func (e Escalation) Terms(verifier, arbiter, escrowAgent, timekeeper string, feeBP int64) (*Terms, error) {
	if err := e.Validate(); err != nil {
		return nil, err
	}
	cur := e.Currency
	if cur == "" {
		cur = "USD"
	}
	t := &Terms{
		V: TermsVersion, Currency: cur, Scale: 2,
		Verifier: verifier, Arbiter: arbiter,
		EscrowAgent: escrowAgent, Timekeeper: timekeeper,
		Measures: []Measure{
			{
				ID: MeasureReviewsAdmissible, Kind: MeasureCount,
				Min: 0, Max: int64(e.Reviewers), Required: true,
				Definition: "Reviews returned by distinct, independent reviewers that " +
					"actually engaged with the evidence: each cites what it looked at " +
					"and gives a reason. A blank or unreasoned answer is not admissible.",
			},
			{
				ID: MeasureReviewsAgreeing, Kind: MeasureCount,
				Min: 0, Max: int64(e.Reviewers), Required: true,
				Definition: "Admissible reviews that reached the same finding as the " +
					"largest agreeing group.",
			},
			{
				ID: MeasureReviewFinding, Kind: MeasureBool, Min: 0, Max: 1, Required: true,
				Definition: "The panel's finding on the parent question: 1 if the " +
					"majority answered yes, 0 otherwise. This does not affect payment.",
			},
		},
		Criteria: []Criterion{
			{ID: CriterionPanelComplete, Measure: MeasureReviewsAdmissible,
				Op: OpGTE, Value: int64(e.Reviewers)},
			{ID: CriterionPanelAgreed, Measure: MeasureReviewsAgreeing,
				Op: OpGTE, Value: int64(e.Agreement)},
		},
		Payout: PayoutRule{Clauses: []Clause{
			// A complete panel that reached agreement: per-review fee plus the
			// decisiveness bonus.
			{When: CriterionPanelAgreed, Pay: []PayItem{
				{Op: PayPerUnit, Measure: MeasureReviewsAdmissible, UnitAmountMinor: e.FeeMinor},
				{Op: PayPerUnit, Measure: MeasureReviewsAgreeing, UnitAmountMinor: e.BonusMinor},
			}},
			// Reviews came back but the panel split. They still did the work.
			{When: CriterionPanelComplete, Pay: []PayItem{
				{Op: PayPerUnit, Measure: MeasureReviewsAdmissible, UnitAmountMinor: e.FeeMinor},
			}},
			// A partial panel is paid for the reviews that did arrive.
			{Pay: []PayItem{
				{Op: PayPerUnit, Measure: MeasureReviewsAdmissible, UnitAmountMinor: e.FeeMinor},
			}},
		}},
		Fee: FeeRule{BP: feeBP, Round: RoundDown},
		Deadlines: []Deadline{
			{ID: DeadlineEvidence, After: AnchorAward, Seconds: 172800},
			{ID: DeadlineVerification, After: AnchorEvidence, Seconds: 3600},
			{ID: DeadlineDispute, After: AnchorVerdict, Seconds: 86400},
			{ID: DeadlineArbitration, After: AnchorDispute, Seconds: 172800},
		},
		// If nobody reviews in time the buyer gets their money back: an
		// unanswered question is not an answer.
		OnVerificationTimeout: TimeoutFail,
		OnArbitrationTimeout:  TimeoutRefund,
	}
	if err := t.Validate(); err != nil {
		return nil, err
	}
	return t, nil
}

// Reviewed builds the measures for a completed panel.
func Reviewed(admissible, agreeing int, finding bool) Measures {
	f := int64(0)
	if finding {
		f = 1
	}
	return Measures{
		MeasureReviewsAdmissible: int64(admissible),
		MeasureReviewsAgreeing:   int64(agreeing),
		MeasureReviewFinding:     f,
	}
}

// Cost is what a full panel will cost at most, which is what must be escrowed.
func (e Escalation) Cost() int64 {
	return int64(e.Reviewers) * (e.FeeMinor + e.BonusMinor)
}
