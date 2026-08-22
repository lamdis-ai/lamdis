package outcome

import (
	"strings"
	"testing"
)

func panelSpec(t *testing.T) Escalation {
	t.Helper()
	return Escalation{
		Parent: "01J8PARENT", ParentVerdict: "01J8VERDICT",
		Question:  "Is a pot-bellied pig visible indoors in the attached photograph?",
		Reviewers: 3, Agreement: 2,
		FeeMinor: 150, BonusMinor: 100, Currency: "USD",
	}
}

func panelTerms(t *testing.T, e Escalation) (*Terms, int64) {
	t.Helper()
	tm, err := e.Terms(testPrincipal(t, 1), testPrincipal(t, 2),
		testPrincipal(t, 3), testPrincipal(t, 4), 500)
	if err != nil {
		t.Fatalf("Terms: %v", err)
	}
	escrow, err := MaxPayout(tm)
	if err != nil {
		t.Fatalf("MaxPayout: %v", err)
	}
	return tm, escrow
}

func TestPanelEscrowCoversAFullPanel(t *testing.T) {
	e := panelSpec(t)
	_, escrow := panelTerms(t, e)
	// Three reviewers at 150 + 100 each.
	if want := e.Cost(); escrow != want {
		t.Errorf("escrow = %d, want %d (a full panel, all agreeing)", escrow, want)
	}
	if escrow != 750 {
		t.Errorf("escrow = %d, want 750", escrow)
	}
}

func TestReviewersArePaidWhicheverWayTheyAnswer(t *testing.T) {
	e := panelSpec(t)
	tm, escrow := panelTerms(t, e)

	// The same panel, same agreement, opposite findings. Payment must not move:
	// paying more for "yes" would buy the answer instead of the judgment.
	yes, err := Evaluate(tm, Reviewed(3, 3, true), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	no, err := Evaluate(tm, Reviewed(3, 3, false), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if yes.GrossMinor != no.GrossMinor {
		t.Errorf("a panel finding yes was paid %d and finding no %d; the fee is buying the answer",
			yes.GrossMinor, no.GrossMinor)
	}
}

func TestSplitPanelStillPaysForTheWork(t *testing.T) {
	e := panelSpec(t)
	tm, escrow := panelTerms(t, e)

	// Three reviews, no majority (the largest agreeing group is 1... but with
	// three binary answers a 2-1 split always exists, so model a genuine
	// deadlock as only one agreeing).
	split, err := Evaluate(tm, Reviewed(3, 1, false), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if split.GrossMinor != 3*e.FeeMinor {
		t.Errorf("a split panel paid %d, want %d — reviewers still did the work",
			split.GrossMinor, 3*e.FeeMinor)
	}

	agreed, err := Evaluate(tm, Reviewed(3, 2, true), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if agreed.GrossMinor <= split.GrossMinor {
		t.Error("agreeing should pay more than deadlocking, or there is no reason to be decisive")
	}
}

func TestPartialPanelPaysOnlyForReviewsReceived(t *testing.T) {
	e := panelSpec(t)
	tm, escrow := panelTerms(t, e)
	got, err := Evaluate(tm, Reviewed(1, 1, true), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.GrossMinor != e.FeeMinor {
		t.Errorf("one review paid %d, want %d", got.GrossMinor, e.FeeMinor)
	}
	if got.RefundMinor != escrow-e.FeeMinor {
		t.Errorf("refund = %d, want %d", got.RefundMinor, escrow-e.FeeMinor)
	}
}

func TestNoReviewsPaysNothingAndRefundsEverything(t *testing.T) {
	e := panelSpec(t)
	tm, escrow := panelTerms(t, e)
	got, err := Evaluate(tm, Reviewed(0, 0, false), escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.GrossMinor != 0 || got.RefundMinor != escrow {
		t.Errorf("an unanswered question paid %d and refunded %d; want 0 and %d",
			got.GrossMinor, got.RefundMinor, escrow)
	}
}

func TestPanelConservesEscrowAcrossEveryOutcome(t *testing.T) {
	e := panelSpec(t)
	tm, escrow := panelTerms(t, e)
	for adm := 0; adm <= e.Reviewers; adm++ {
		for agr := 0; agr <= adm; agr++ {
			for _, finding := range []bool{true, false} {
				got, err := Evaluate(tm, Reviewed(adm, agr, finding), escrow)
				if err != nil {
					t.Fatalf("Evaluate(%d,%d): %v", adm, agr, err)
				}
				if got.ProviderNet+got.FeeMinor+got.RefundMinor != escrow {
					t.Fatalf("conservation violated at %d admissible / %d agreeing: %+v",
						adm, agr, got)
				}
				if got.GrossMinor > escrow {
					t.Fatalf("panel payout %d exceeds escrow %d", got.GrossMinor, escrow)
				}
			}
		}
	}
}

func TestEscalationRejectsIncoherentPanels(t *testing.T) {
	for _, c := range []struct {
		name string
		mut  func(*Escalation)
		want string
	}{
		{"no parent", func(e *Escalation) { e.Parent = "" }, "parent"},
		{"no question", func(e *Escalation) { e.Question = "" }, "question"},
		{"zero reviewers", func(e *Escalation) { e.Reviewers = 0 }, "at least one"},
		{"agreement above panel size", func(e *Escalation) { e.Agreement = 4 }, "impossible"},
		{"tie can decide", func(e *Escalation) { e.Reviewers, e.Agreement = 4, 2 }, "not a majority"},
	} {
		t.Run(c.name, func(t *testing.T) {
			e := panelSpec(t)
			c.mut(&e)
			err := e.Validate()
			if err == nil {
				t.Fatalf("expected an error mentioning %q", c.want)
			}
			if !strings.Contains(err.Error(), c.want) {
				t.Errorf("error %q does not mention %q", err, c.want)
			}
		})
	}
}
