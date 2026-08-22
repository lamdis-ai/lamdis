package outcome

import (
	"strings"
	"testing"
	"time"
)

// escalated drives an outcome to a verdict, then binds it to a review panel.
func escalated(t *testing.T, s *scene) (*Terms, int64, string) {
	t.Helper()
	terms, escrow := runToVerdict(t, s, true)
	child := "01JCHILDOUTCOME00000000000"
	st := s.fold()
	s.post("exchange", KindEscalation, EscalationBody{
		Child: child, Question: "Is a pig visible indoors in the attached photograph?",
		Reason:    "automated confidence landed in the ambiguous band",
		Reviewers: 3, Agreement: 2,
		ParentVerdict: st.Verdict.Result,
	})
	return terms, escrow, child
}

func TestEscalationHoldsTheMoney(t *testing.T) {
	s := newScene(t)
	terms, escrow, _ := escalated(t, s)
	st := s.fold()

	if st.Phase != PhaseEscalated {
		t.Fatalf("phase = %s, want escalated", st.Phase)
	}
	if st.Money != MoneyHeld {
		t.Errorf("money = %s, want the escrow still held while the panel runs", st.Money)
	}
	if !st.AwaitingChild() {
		t.Error("outcome should report that it is waiting on a child")
	}

	// Settlement must not be possible while the question is open.
	measures, _, _ := st.Basis()
	want, _ := Evaluate(terms, measures, escrow)
	s.advance(3 * time.Hour)
	s.post("exchange", KindSettleInstruction, SettleInstructionBody{
		TermsHash: st.TermsHash, EscrowMinor: escrow,
		Payouts:  []Payout{{Principal: s.pids["provider"], AmountMinor: want.ProviderNet}},
		FeeMinor: want.FeeMinor, RefundMinor: want.RefundMinor,
	})
	if got := s.fold(); got.InstructionEntry != "" {
		t.Fatal("the parent settled while its escalation was still unanswered")
	}
}

// TestPanelPassPaysTheOriginalProvider is the flow the escalation exists for:
// the machine could not tell, people were paid to look, they agreed it was
// true, and the original provider is paid on the strength of their finding.
func TestPanelPassPaysTheOriginalProvider(t *testing.T) {
	s := newScene(t)
	terms, escrow, child := escalated(t, s)

	s.post("exchange", KindBoundVerdict, BoundVerdictBody{
		Child: child, ChildVerdict: "01JCHILDVERDICT000000000000",
		ChildVerdictHash: strings.Repeat("a", 64),
		Finding:          true, Admissible: true, Agreeing: 3, Reviewers: 3,
		Measures:  Observed(true, true),
		TermsHash: s.fold().TermsHash,
	})

	st := s.fold()
	if st.Phase != PhaseVerified {
		t.Fatalf("phase = %s, want verified once the panel reported", st.Phase)
	}
	measures, result, _ := st.Basis()
	if result != VerdictPass {
		t.Errorf("basis result = %s, want pass", result)
	}
	if measures[MeasureSatisfied] != 1 {
		t.Errorf("the panel's finding did not become the settlement basis: %v", measures)
	}

	settle(t, s, terms, escrow)
	st = s.fold()
	if len(st.Errors) != 0 {
		t.Fatalf("unexpected rejections: %+v", st.Errors)
	}
	if st.Settlement.GrossMinor != 2300 {
		t.Errorf("gross = %d, want the full 2300 (base + bonus)", st.Settlement.GrossMinor)
	}
	if st.Resolution != ResolutionFulfilled {
		t.Errorf("resolution = %s, want fulfilled", st.Resolution)
	}
}

// TestPanelFailRefundsTheBuyer is the other half: the panel looked and said no,
// so the original provider does not get the bonus and the buyer gets the
// balance back.
func TestPanelFailRefundsTheBuyer(t *testing.T) {
	s := newScene(t)
	terms, escrow, child := escalated(t, s)

	s.post("exchange", KindBoundVerdict, BoundVerdictBody{
		Child: child, ChildVerdict: "01JCHILDVERDICT000000000000",
		ChildVerdictHash: strings.Repeat("b", 64),
		Finding:          false, Admissible: true, Agreeing: 3, Reviewers: 3,
		// Admissible evidence, but the predicate did not hold.
		Measures:  Observed(true, false),
		TermsHash: s.fold().TermsHash,
	})
	settle(t, s, terms, escrow)

	st := s.fold()
	if len(st.Errors) != 0 {
		t.Fatalf("unexpected rejections: %+v", st.Errors)
	}
	if st.Settlement.GrossMinor != 500 {
		t.Errorf("gross = %d; the provider should keep only the base fee", st.Settlement.GrossMinor)
	}
	if st.Settlement.RefundMinor != escrow-500 {
		t.Errorf("refund = %d, want %d back to the buyer", st.Settlement.RefundMinor, escrow-500)
	}
	if st.Resolution != ResolutionFailed {
		t.Errorf("resolution = %s, want failed", st.Resolution)
	}
}

// TestPanelShortOfAgreementIsRefused: a panel that did not reach the required
// agreement has not answered the question, and must not be recorded as if it
// had.
func TestPanelShortOfAgreementIsRefused(t *testing.T) {
	s := newScene(t)
	_, _, child := escalated(t, s)

	s.post("exchange", KindBoundVerdict, BoundVerdictBody{
		Child: child, ChildVerdict: "01JCHILDVERDICT000000000000",
		ChildVerdictHash: strings.Repeat("c", 64),
		Finding:          true, Admissible: true,
		Agreeing: 1, Reviewers: 3, // needed 2
		Measures:  Observed(true, true),
		TermsHash: s.fold().TermsHash,
	})

	st := s.fold()
	if st.BoundVerdict != nil {
		t.Fatal("a panel that did not reach agreement was accepted as an answer")
	}
	if !hasRejection(st, "agreements required") {
		t.Errorf("expected an agreement rejection, got %+v", st.Errors)
	}
}

func TestBoundVerdictFromTheWrongChildIsRefused(t *testing.T) {
	s := newScene(t)
	_, _, _ = escalated(t, s)

	s.post("exchange", KindBoundVerdict, BoundVerdictBody{
		Child: "01JSOMEOTHEROUTCOME00000000", ChildVerdict: "x",
		ChildVerdictHash: strings.Repeat("d", 64),
		Finding:          true, Admissible: true, Agreeing: 3, Reviewers: 3,
		Measures:  Observed(true, true),
		TermsHash: s.fold().TermsHash,
	})
	st := s.fold()
	if st.BoundVerdict != nil {
		t.Fatal("a finding from an unrelated outcome was accepted")
	}
	if !hasRejection(st, "bound to") {
		t.Errorf("expected a wrong-child rejection, got %+v", st.Errors)
	}
}

// TestBoundVerdictMustCommitToTheChildsHash: without it, the relay is just the
// exchange's word for what happened on another thread.
func TestBoundVerdictMustCommitToTheChildsHash(t *testing.T) {
	s := newScene(t)
	_, _, child := escalated(t, s)
	s.post("exchange", KindBoundVerdict, BoundVerdictBody{
		Child: child, ChildVerdict: "01JCHILDVERDICT000000000000",
		ChildVerdictHash: "", // no commitment
		Finding:          true, Admissible: true, Agreeing: 3, Reviewers: 3,
		Measures:  Observed(true, true),
		TermsHash: s.fold().TermsHash,
	})
	if st := s.fold(); st.BoundVerdict != nil {
		t.Fatal("an uncommitted relay was accepted")
	}
}

// TestUnansweredEscalationRefundsTheBuyer: a panel that never reports must not
// strand the buyer's money. The question going unanswered is not an answer, so
// the escrow goes back.
func TestUnansweredEscalationRefundsTheBuyer(t *testing.T) {
	s := newScene(t)
	_, escrow, _ := escalated(t, s)
	st := s.fold()

	d := st.Deadlines[DeadlineEscalation]
	if d == nil {
		t.Fatal("the observation contract declares no escalation deadline; a parent could be stranded")
	}
	if d.AnchorEntry == "" {
		t.Fatal("the escalation deadline was never anchored")
	}

	// Nobody reports. The timekeeper witnesses the deadline passing.
	s.advance(80 * time.Hour)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineEscalation, AnchorEntry: d.AnchorEntry,
		FiredAt: s.now.Format(time.RFC3339),
	})

	st = s.fold()
	if st.Phase != PhaseClosed {
		t.Fatalf("phase = %s, want closed after the escalation expired", st.Phase)
	}
	if st.Resolution != ResolutionExpired {
		t.Errorf("resolution = %s, want expired", st.Resolution)
	}
	if st.Money != MoneyRefundPending {
		t.Errorf("money = %s, want the escrow heading back to the buyer", st.Money)
	}
	_ = escrow
}
