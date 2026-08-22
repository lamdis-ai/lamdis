package api

import (
	"context"
	"strings"
	"testing"
)

// stubClassifier answers with whatever the test hands it.
type stubClassifier struct {
	act *Act
	err error
}

func (s stubClassifier) Classify(context.Context, string) (*Act, error) {
	return s.act, s.err
}

// The case keywords cannot reach.
//
// "Remove the shrub by the door and take the key from underneath" contains no
// banned phrase and is a burglary. Screening on the act rather than the wording
// is the only thing that sees it.
func TestSemanticScreeningCatchesWhatKeywordsCannot(t *testing.T) {
	burglary := "Remove the shrub by the front door and take the key from " +
		"underneath, then post it to the address below"
	if r := Screen(burglary); r != nil {
		t.Logf("the keyword floor happened to catch it as %s", r.Class)
	}
	// What the classifier would report: it touches somebody's access.
	c := stubClassifier{act: &Act{
		Category: "retrieve-object", Summary: "take a house key hidden outdoors",
		TouchesAccounts: true, Confidence: 0.9,
	}}
	if r := SemanticScreen(context.Background(), c, burglary); r == nil {
		t.Fatal("the act was not screened at all")
	}
}

// An unreachable or unsure classifier must never refuse honest work on its own.
func TestAnUnavailableClassifierRefusesNothing(t *testing.T) {
	honest := "Clear the gutter along the north face and bag what comes out"
	for _, c := range []Classifier{
		nil,
		stubClassifier{err: context.DeadlineExceeded},
		stubClassifier{act: nil},
	} {
		if r := SemanticScreen(context.Background(), c, honest); r != nil {
			t.Errorf("honest work refused because the classifier was unavailable: %s", r.Why)
		}
	}
}

// Ordinary physical work passes.
func TestOrdinaryPhysicalWorkPassesSemanticScreening(t *testing.T) {
	c := stubClassifier{act: &Act{
		Category: "yard-work", Summary: "clear a gutter and bag the debris",
		Confidence: 0.95,
	}}
	if r := SemanticScreen(context.Background(), c,
		"Clear the gutter along the north face"); r != nil {
		t.Fatalf("ordinary work refused as %s: %s", r.Class, r.Why)
	}
}

// Work that never leaves a screen is held, not refused: this exchange is for
// the physical world, and the mismatch may be a badly worded honest job.
func TestOnlineOnlyWorkIsHeldForAPerson(t *testing.T) {
	c := stubClassifier{act: &Act{
		Category: "data-entry", Summary: "fill in a spreadsheet",
		OnlineOnly: true, Confidence: 0.9,
	}}
	r := SemanticScreen(context.Background(), c, "Fill in this spreadsheet")
	if r == nil {
		t.Fatal("entirely online work was listed as physical work")
	}
	if !r.Review {
		t.Error("refused outright; a badly described real errand reads this way too")
	}
}

// A job nobody can read confidently goes to a person.
func TestAnUnreadableJobGoesToReview(t *testing.T) {
	c := stubClassifier{act: &Act{Category: "unclear", Confidence: 0.2}}
	r := SemanticScreen(context.Background(), c, "do the thing at the place")
	if r == nil || !r.Review {
		t.Fatal("an unreadable job went straight to the board")
	}
}

// The classifier must not be told which answers cause a refusal.
//
// A model that knows which category gets a job rejected is a model a
// well-written listing can talk out of the rejection. It names the act; the
// decision is made in code, against a list it never saw.
func TestTheClassifierIsNotToldWhatIsRefused(t *testing.T) {
	for _, leak := range []string{
		"refuse", "reject", "not allowed", "prohibited", "banned", "abuse",
	} {
		if strings.Contains(strings.ToLower(ClassifyPrompt), leak) {
			t.Errorf("the prompt tells the classifier about %q, which is a "+
				"lever a submitter can pull on", leak)
		}
	}
	if !strings.Contains(ClassifyPrompt, "untrusted") {
		t.Error("the prompt does not frame the task text as untrusted")
	}
}
