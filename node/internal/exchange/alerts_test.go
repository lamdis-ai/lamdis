package exchange

import (
	"testing"
	"time"
)

// An empty board must not be the end of the conversation.
//
// An operator signed in, set what they would take, saw nothing, and had no way
// to be told when work appeared: the only push mechanism was a webhook, which
// is a fleet's tool. They checked twice and never came back, and because
// nothing could reach them the signup was worthless the moment the tab closed.
func TestSomebodyCanAskToBeToldAboutWork(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	w := NewWatches()
	w.Now = func() time.Time { return now }

	// Nobody hears anything they did not ask for.
	if due := w.Due([]string{"marcus"}); len(due) != 0 {
		t.Fatal("somebody who never asked was sent an alert")
	}

	w.Set("marcus", "marcus@example.com", false)
	due := w.Due([]string{"marcus"})
	if len(due) != 1 {
		t.Fatalf("somebody who asked was not told: %d", len(due))
	}
}

// A busy day must not become a mailbox full of us.
func TestAlertsAreRateLimitedPerPerson(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	w := NewWatches()
	w.Now = func() time.Time { return now }
	w.Set("marcus", "marcus@example.com", false)

	if len(w.Due([]string{"marcus"})) != 1 {
		t.Fatal("the first alert did not go out")
	}
	// Five more jobs in the same hour reach nobody.
	for i := 0; i < 5; i++ {
		if n := len(w.Due([]string{"marcus"})); n != 0 {
			t.Fatalf("a second alert went out within the window")
		}
	}
	// Later, they hear again.
	w.Now = func() time.Time { return now.Add(MinBetweenAlerts + time.Minute) }
	if len(w.Due([]string{"marcus"})) != 1 {
		t.Error("after the quiet window nobody was told about new work")
	}
}

// Turning them off has to actually turn them off.
func TestQuietMeansQuiet(t *testing.T) {
	w := NewWatches()
	w.Set("marcus", "marcus@example.com", true)
	if n := len(w.Due([]string{"marcus"})); n != 0 {
		t.Fatal("somebody who switched alerts off was emailed anyway")
	}
}

// Somebody with no address cannot be reached, and must not be counted as
// though they were.
func TestNoAddressMeansNoAlert(t *testing.T) {
	w := NewWatches()
	w.Set("marcus", "", false)
	if n := len(w.Due([]string{"marcus"})); n != 0 {
		t.Fatal("an alert was queued for somebody with no address")
	}
}
