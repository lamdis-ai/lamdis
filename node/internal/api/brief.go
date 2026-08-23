package api

import (
	"fmt"
	"strings"
)

// What somebody needs in order to quote.
//
// The board published a title, a paragraph of detail, and a locality. It did
// not publish what the work actually is, or what proof would be required. A
// contractor was being asked "what would you charge?" about a job whose
// instructions and deliverable they could not read.
//
// That was not an oversight so much as a collision. Instructions was withheld
// because Instructions is where a buyer writes the gate code and which
// flowerpot the key is under — and publishing that on an unauthenticated
// endpoint hands somebody's front door to anyone who curls the board. But the
// same field also carries what the work is, and one field holding both a
// secret and a necessity means one of the two is always wrong. The one that
// lost was bidding, which is the mechanism the whole open-price design rests
// on.
//
// So they are separated. Instructions says what to do and is published.
// Access says how to get in and goes only to whoever holds the job.
//
// Alongside that, two things a marketplace needs and a project manager would
// over-model:
//
//   - Brief: open text, carried verbatim, never interpreted. A buyer's agent
//     knows things about this job that no schema here will ever have a field
//     for. It should be able to write them down and have them arrive intact at
//     the other agent. The exchange's job is to carry it, not to understand it.
//
//   - Unknowns: the things the buyer cannot specify, said out loud. Somebody
//     wanting a driveway very often does not know how wide they want it, and
//     nobody knows the dimensions of their own barn. Today that surfaces as a
//     bid priced on a guess and an argument on site.
//
// Unknowns are deliberately not a workflow. There is no survey step, no
// approval chain, no revision history. A buyer names what they do not know; a
// bid must say what it assumed and whether that price holds; and the assumption
// travels with the job so the work is judged against what was actually agreed.
// That is the whole mechanism. It makes the transaction well defined without
// making the exchange manage the project.

// Unknown is something the buyer cannot pin down, stated rather than guessed.
type Unknown struct {
	// Name is what is not known: "driveway width", "barn footprint".
	Name string `json:"name"`
	// Note is whatever the buyer can say about it — "somewhere around ten or
	// twelve feet", "big enough for two cars". Free text, never parsed.
	Note string `json:"note,omitempty"`
	// Unit is a hint for whoever answers: "feet", "square feet", "hours".
	Unit string `json:"unit,omitempty"`
}

// Assumption is a bidder answering an Unknown, which is what makes their
// number mean something.
type Assumption struct {
	// Name matches the Unknown this answers.
	Name string `json:"name"`
	// Value is what they priced on: "11 feet", "24 by 30".
	Value string `json:"value"`
	// Firm reports whether the price holds at that figure.
	//
	// Not firm is a real and honest answer — "I priced 11 feet, I will measure
	// on the first visit and requote if it is wider" — and it is far better
	// than a firm number quietly padded to survive being wrong. A buyer
	// comparing a firm bid against a provisional one is seeing a genuine
	// difference rather than two numbers that look alike.
	Firm bool `json:"firm"`
	// Note is how they would settle it, if it is not firm.
	Note string `json:"note,omitempty"`
}

// MaxUnknowns bounds how much a buyer may declare they do not know.
//
// A job with twenty open questions is not a job, it is a conversation, and the
// exchange is not the place to have it. The limit is where somebody should
// have asked for a survey as its own small job first — which this board can
// carry perfectly well as an ordinary listing.
const MaxUnknowns = 8

// ValidateBrief checks the parts a bidder will read.
func (l *Listing) ValidateBrief() error {
	if len(l.Unknowns) > MaxUnknowns {
		return fmt.Errorf(
			"board: %d open questions is more than a job can carry (limit %d); "+
				"post a survey as its own job first", len(l.Unknowns), MaxUnknowns)
	}
	seen := map[string]bool{}
	for i, u := range l.Unknowns {
		n := strings.TrimSpace(u.Name)
		if n == "" {
			return fmt.Errorf("board: open question %d has no name", i+1)
		}
		k := strings.ToLower(n)
		if seen[k] {
			return fmt.Errorf("board: %q is asked twice", u.Name)
		}
		seen[k] = true
	}
	// Instructions and Brief are published now, so anything private written
	// into them reaches the open board. Both are screened; Access is not,
	// because Access is the field that is supposed to hold this.
	for _, f := range []struct{ name, text string }{
		{"instructions", l.Instructions},
		{"brief", l.Brief},
		{"detail", l.Detail},
		{"title", l.Title},
	} {
		if phrase, bad := LooksLikeEntryDetail(f.text); bad {
			return fmt.Errorf(
				"board: the %s mentions %q, and the %s is published on the open "+
					"board. Entry details go in access, which only the person who "+
					"takes the job ever sees", f.name, phrase, f.name)
		}
	}
	if AddressInTitle(l.Instructions, l.Where) {
		return fmt.Errorf(
			"board: the address appears in the instructions, which are public; " +
				"put it in where, and put entry details in access")
	}
	if AddressInTitle(l.Brief, l.Where) {
		return fmt.Errorf(
			"board: the address appears in the brief, which is public; " +
				"put it in where, and put entry details in access")
	}
	return nil
}

// entryPhrases are how people write down the way into a property.
//
// This list exists because publishing Instructions is only safe if the entry
// details are somewhere else, and "somewhere else" cannot be enforced by
// documentation. Buyers' agents have been writing "Gate code 4471, mower is in
// the shed" into instructions for as long as the field has existed, and they
// will keep doing it. A field that is safe only when used correctly is not
// safe.
//
// So a post whose instructions read like entry details is refused, and told
// where they go instead. Refusing is the right failure: the alternative is a
// gate code on an unauthenticated endpoint, and no amount of convenience is
// worth that.
var entryPhrases = []string{
	"gate code", "door code", "access code", "entry code", "keypad",
	"lockbox", "lock box", "combination is", "combo is", "passcode",
	"pin is", "pin code", "alarm code", "alarm is", "disarm",
	"key is", "spare key", "keys are", "under the mat", "under the door mat",
	"flowerpot", "flower pot", "key safe", "keysafe", "garage code",
}

// LooksLikeEntryDetail reports whether text reads like how to get in.
//
// Deliberately blunt and deliberately over-eager. A false positive costs a
// buyer one edit and a clear message naming the field to use; a false negative
// publishes somebody's front door. Those are not comparable, so the threshold
// sits well toward refusing.
func LooksLikeEntryDetail(s string) (string, bool) {
	l := strings.ToLower(s)
	for _, p := range entryPhrases {
		if strings.Contains(l, p) {
			return p, true
		}
	}
	return "", false
}

// publishable returns text safe to put on an unauthenticated endpoint, and
// whether anything was withheld.
//
// Post refuses a listing whose published fields read like entry details, which
// is the guard that should catch every real case. This is the second one, and
// it exists because the two guards protect different things: Post protects the
// ingestion path, and this protects the serialization path. A listing that
// reached the board some other way — restored from a store written before this
// rule, posted through a code path added later, constructed directly in a test
// — must still not be able to publish somebody's front door.
//
// The security property belongs to Public(), because Public() is what an
// anonymous caller actually receives. Enforcing it only at the door means the
// property holds by convention, and conventions are what this class of bug is
// made of.
// Entry details only, deliberately.
//
// An address in a title is a different and much smaller problem: the board
// already publishes a locality, the buyer chose to write it, and the existing
// screening warns about it at posting. Blanking a field for it costs an
// operator the title of the job — which makes the listing useless and is a
// worse outcome than the thing being prevented.
//
// A gate code is not like that. There is no version of publishing it that is
// acceptable, so it is the one thing this refuses outright.
func publishable(text string) (string, bool) {
	if text == "" {
		return "", false
	}
	if _, bad := LooksLikeEntryDetail(text); bad {
		return "", true
	}
	return text, false
}

// UnknownNames lists what a bid on this job has to answer.
func (l *Listing) UnknownNames() []string {
	out := make([]string, 0, len(l.Unknowns))
	for _, u := range l.Unknowns {
		out = append(out, u.Name)
	}
	return out
}

// CheckAssumptions reports whether a bid answers everything the job says is
// unknown.
//
// Enforced rather than encouraged. A bid that skips the open questions is a
// number with nothing behind it, and accepting one is how both sides end up on
// site disagreeing about what was bought.
func (l *Listing) CheckAssumptions(as []Assumption) error {
	if len(l.Unknowns) == 0 {
		return nil
	}
	given := map[string]bool{}
	for _, a := range as {
		if strings.TrimSpace(a.Value) == "" {
			continue
		}
		given[strings.ToLower(strings.TrimSpace(a.Name))] = true
	}
	var missing []string
	for _, u := range l.Unknowns {
		if !given[strings.ToLower(strings.TrimSpace(u.Name))] {
			missing = append(missing, u.Name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf(
			"board: this job says it does not know %s; say what you priced on",
			strings.Join(missing, ", "))
	}
	return nil
}
