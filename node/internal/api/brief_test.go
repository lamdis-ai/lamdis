package api

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func biddableJob(now time.Time) *Listing {
	return &Listing{
		Job: "do-drive", Kind: KindDo,
		Title:        "Pave a new driveway to the back of the property",
		Detail:       "Existing gravel run, roughly 110 feet, ties into a new barn slab.",
		Instructions: "Excavate, base, binder and surface. Photograph each stage with the code in frame.",
		Deliverable:  "New drive surfaced and rolled, code legible in shot.",
		Brief: "Owner wants it wide enough for a truck and a car to pass. " +
			"Drainage runs toward the road. No hurry on timing.",
		Where: "812 Marlow Street", Area: "Detroit, MI",
		Access:  "Side gate is unlatched, park on the verge",
		Pricing: PriceBids, MaxBidMinor: 800000, Currency: "USD", Slots: 1,
		Expires: now.Add(30 * 24 * time.Hour), Posted: now,
	}
}

// You cannot price work you cannot read.
//
// The board published a title, a paragraph and a locality, and withheld the
// instructions and the deliverable — so an operator was asked "what would you
// charge?" about a job whose actual content was invisible to them. The
// sealed-bid design rests entirely on bidders being able to judge the work.
func TestABidderCanReadTheWork(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	p := biddableJob(now).Public()
	if p.Instructions == "" {
		t.Error("the public listing has no instructions; nobody can price this")
	}
	if p.Deliverable == "" {
		t.Error("the public listing does not say what would prove the job done")
	}
	if p.Brief == "" {
		t.Error("the buyer's own notes did not reach the person who would do the work")
	}
}

// Open text passes through untouched. The exchange carries what an agent
// writes; it does not interpret the trade.
func TestBriefIsCarriedVerbatim(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	l := biddableJob(now)
	l.Brief = "Slope is about 4% toward the road. Neighbour's fence is the line. " +
		"Owner will be away 3-11 Sept. Prefers a broom finish."
	if got := l.Public().Brief; got != l.Brief {
		t.Errorf("the brief was altered on the way out:\n got %q\nwant %q", got, l.Brief)
	}
}

// The thing that made publishing instructions unsafe, kept unsafe.
func TestEntryDetailsNeverReachTheOpenBoard(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	cases := map[string]func(*Listing){
		"in instructions": func(l *Listing) {
			l.Instructions = "Gate code 4471, mower is in the shed"
		},
		"in the brief": func(l *Listing) {
			l.Brief = "Spare key is under the flowerpot by the door"
		},
		"in the detail": func(l *Listing) {
			l.Detail = "Alarm code is 9 then hash, disarm before entering"
		},
		"in the title": func(l *Listing) {
			l.Title = "Mow the lawn, lockbox on the gate"
		},
	}
	for name, spoil := range cases {
		t.Run(name, func(t *testing.T) {
			l := biddableJob(now)
			spoil(l)

			// Refused at the door.
			b := NewBoard(NewCapabilities())
			b.Now = func() time.Time { return now }
			if err := b.Post(l); err == nil {
				t.Error("the board accepted a job with entry details in a published field")
			} else if !strings.Contains(err.Error(), "access") {
				t.Errorf("the refusal does not point at the access field: %v", err)
			}

			// And redacted on the way out, in case it ever got in another way.
			blob, _ := json.Marshal(l.Public())
			for _, leak := range []string{"4471", "flowerpot", "9 then hash", "lockbox"} {
				if strings.Contains(strings.ToLower(string(blob)), strings.ToLower(leak)) {
					t.Errorf("Public() published %q: %s", leak, blob)
				}
			}
			if !strings.Contains(string(blob), "withheld") {
				t.Error("something was redacted and the listing does not say so")
			}
		})
	}
}

// Access reaches the person who takes the job, and nobody else.
func TestAccessIsPrivateButReachesTheClaimant(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	l := biddableJob(now)
	blob, _ := json.Marshal(l.Public())
	if strings.Contains(string(blob), "Side gate is unlatched") {
		t.Fatal("access details are on the open board")
	}
	if strings.Contains(string(blob), "812 Marlow") {
		t.Fatal("the exact address is on the open board")
	}
	// The claimant's brief carries both; see work.go.
	if l.Access == "" || l.Where == "" {
		t.Fatal("the listing lost the private fields entirely")
	}
}

// Nobody knows how wide they want their driveway.
//
// The unknown is stated rather than guessed at, and a bid has to say what it
// priced on — which is what stops the argument happening on site instead.
func TestABidMustAnswerWhatTheJobDoesNotKnow(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	l := biddableJob(now)
	l.Unknowns = []Unknown{
		{Name: "driveway width", Note: "wide enough for a truck and a car to pass", Unit: "feet"},
		{Name: "barn footprint", Note: "I have never measured it", Unit: "feet"},
	}
	if err := b.Post(l); err != nil {
		t.Fatalf("post: %v", err)
	}

	// A bare number is not an offer on a job like this.
	if _, err := b.PlaceBid("do-drive", "guesser", 600000, "USD", "", now); err == nil {
		t.Error("a bid was accepted without answering either open question")
	} else if !strings.Contains(err.Error(), "driveway width") {
		t.Errorf("the refusal does not name what is unanswered: %v", err)
	}

	// Half an answer is still not an answer.
	_, err := b.PlaceBid("do-drive", "half", 600000, "USD", "", now,
		Assumption{Name: "driveway width", Value: "12 feet", Firm: true})
	if err == nil || !strings.Contains(err.Error(), "barn footprint") {
		t.Errorf("a partly-answered bid was accepted: %v", err)
	}

	// A provisional answer is a real answer, and is allowed to be honest.
	bid, err := b.PlaceBid("do-drive", "calder", 640000, "USD",
		"Priced at 12 feet; I will measure on the first visit.", now,
		Assumption{Name: "driveway width", Value: "12 feet", Firm: true},
		Assumption{Name: "barn footprint", Value: "24 by 30", Firm: false,
			Note: "assumed from the photo; I will measure and requote if it is larger"})
	if err != nil {
		t.Fatalf("a fully answered bid was refused: %v", err)
	}
	if len(bid.Assumptions) != 2 {
		t.Fatalf("the bid did not keep what it was priced on: %+v", bid.Assumptions)
	}

	// Winning carries the figures onto the job, so the work is judged against
	// what was agreed rather than against the blank the buyer started with.
	if _, err := b.Award("do-drive", bid.ID, nil); err != nil {
		t.Fatalf("award: %v", err)
	}
	got, _ := b.Get("do-drive")
	if len(got.Agreed) != 2 {
		t.Fatalf("the agreed figures did not reach the job: %+v", got.Agreed)
	}
	var firm, provisional int
	for _, a := range got.Agreed {
		if a.Firm {
			firm++
		} else {
			provisional++
		}
	}
	if firm != 1 || provisional != 1 {
		t.Errorf("the job lost which figures were firm: %d firm, %d provisional",
			firm, provisional)
	}
}

// A job with no open questions is unchanged in every way.
func TestJobsWithoutUnknownsBidAsBefore(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	if err := b.Post(biddableJob(now)); err != nil {
		t.Fatalf("post: %v", err)
	}
	if _, err := b.PlaceBid("do-drive", "calder", 600000, "USD", "", now); err != nil {
		t.Fatalf("an ordinary bid was refused: %v", err)
	}
}

// A job with twenty open questions is a conversation, not a job.
func TestTooManyUnknownsIsRefused(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	l := biddableJob(now)
	for i := 0; i < MaxUnknowns+1; i++ {
		l.Unknowns = append(l.Unknowns, Unknown{Name: string(rune('a' + i))})
	}
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	if err := b.Post(l); err == nil {
		t.Error("a job with more open questions than answers was accepted")
	}
}
