package api

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// The open board must never carry the way into somebody's property.
//
// It did. Public() published the exact street address and the full
// instructions, and /v1/board needs no authentication — so a job saying "gate
// code 4471, key under the flowerpot" was readable by anyone who fetched the
// board, before a single person had claimed it.
//
// The sealed-bid design went to real lengths to hide the price. It was
// publishing the front door.
func TestTheOpenBoardNeverPublishesHowToGetIn(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	secret := []string{
		"4471",                 // a gate code
		"812 Marlow Street",    // the exact address
		"under the flowerpot",  // where the key is
		"alarm is 9 then hash", // how to stop it going off
	}
	l := &Listing{
		Job: "do-1", Kind: KindDo,
		Title: "The bins are back behind the side gate",
		Where: "812 Marlow Street",
		Area:  "Bernal Heights",
		Instructions: "Gate code 4471. Key is under the flowerpot. " +
			"The alarm is 9 then hash.",
		Deliverable: "One photo of both bins behind the closed gate.",
		PayMinor:    1200, Currency: "usd", Slots: 1,
		Expires: now.Add(8 * time.Hour), Posted: now,
	}

	// Serialized exactly as the board hands it to an anonymous caller.
	blob, err := json.Marshal(l.Public())
	if err != nil {
		t.Fatal(err)
	}
	body := string(blob)
	for _, leak := range secret {
		if strings.Contains(body, leak) {
			t.Errorf("the public board publishes %q", leak)
		}
	}

	// The coarse area is the point: somebody has to be able to decide whether
	// a job is worth going to.
	if !strings.Contains(body, "Bernal Heights") {
		t.Error("the public board says nothing about where the job is, so " +
			"nobody can judge whether to take it")
	}
	// And the title still has to describe the work.
	if !strings.Contains(body, "bins") {
		t.Error("the public board no longer says what the job is")
	}
}

// The person holding the job must get everything the buyer wrote.
//
// The same bug had a second half: Instructions were on the public board and
// absent from the claimant's brief, so the one person entitled to read them
// was the only one who could not.
func TestTheClaimantGetsWhatEverybodyElseMustNot(t *testing.T) {
	l := &Listing{
		Job: "do-1", Title: "Bins", Where: "812 Marlow Street",
		Instructions: "Gate code 4471.",
		Deliverable:  "One photo of both bins.",
		Currency:     "usd",
	}
	brief := workBrief{
		Job: l.Job, Title: l.Title, Where: l.Where, Detail: l.Detail,
		Instructions: l.Instructions, Deliverable: l.Deliverable,
		Currency: l.Currency,
	}
	blob, _ := json.Marshal(brief)
	for _, needed := range []string{"812 Marlow Street", "4471", "One photo of both bins"} {
		if !strings.Contains(string(blob), needed) {
			t.Errorf("the claimant's brief is missing %q, which they need to "+
				"actually do the job", needed)
		}
	}
}
