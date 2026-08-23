package exchange

import (
	"strings"
	"time"
)

// What happens when the two sides disagree about a thousand dollars.
//
// Both directions of this were unprotected, and the second is the one nobody
// talks about.
//
// A buyer's fear is obvious: somebody submits a photograph of a lawn that is
// not theirs and walks off with the money. The answer to that is not better
// forensics — it is that the account which could take a thousand-dollar job
// had to earn its way there through completed work under an identity the
// payment provider checked, and that a job that size does not settle in one
// lump. Fraud has to cost more than it pays, and the ceiling is what makes it
// cost. See api/assurance.go.
//
// A worker's fear got no answer at all. A buyer could object with any sentence
// and the money stopped, permanently: nothing in the codebase ever cleared a
// hold except the buyer choosing to. Somebody could do the work, pass every
// check the exchange runs, and be told "not good enough" by the person who
// owes them. That takes no skill and no forgery. It is the cheaper attack, and
// it was the one with no defence.
//
// So an objection is a claim, and claims get decided:
//
//   - It must name a ground. "Not good enough" against a deliverable that was
//     met is not a ground; the deliverable was written before the work started
//     precisely so neither side gets to move it afterwards.
//   - It goes to the same panel of people that decides an inconclusive
//     verdict, shown the deliverable and the evidence. The buyer does not
//     decide, and neither do we by default.
//   - It has a deadline. If it is not carried through, the money goes to the
//     worker, because an objection nobody pursued is not a finding.
//
// The deliverable is the contract. Everything here is machinery for holding
// both sides to the thing they agreed before anybody had money at stake.

// DisputeWindow is how long an objection may freeze earnings before it either
// gets decided or lapses in the worker's favour.
//
// Long enough for a person at the exchange to look and for a panel to answer,
// short enough that it cannot be used as leverage. Somebody owed a month's
// income should not be waiting a month to hear.
const DisputeWindow = 7 * 24 * time.Hour

// Grounds an objection may be raised on.
//
// Enumerated rather than free text, because free text is how "I changed my
// mind" gets recorded as a dispute. The reason still travels — a person reads
// it — but it has to attach to one of these, and each of them is a question
// about the agreed deliverable rather than about how anybody feels.
const (
	// GroundNotDone: the deliverable was not met.
	GroundNotDone = "not_done"
	// GroundNotHere: the evidence does not show this property.
	GroundNotHere = "wrong_place"
	// GroundFabricated: the evidence appears not to be genuine.
	GroundFabricated = "fabricated"
	// GroundDamage: something was damaged doing the work.
	GroundDamage = "damage"
	// GroundUnsafe: the work was left in an unsafe state.
	GroundUnsafe = "unsafe"
)

// ValidGround reports whether an objection names something decidable.
func ValidGround(g string) bool {
	switch strings.TrimSpace(strings.ToLower(g)) {
	case GroundNotDone, GroundNotHere, GroundFabricated, GroundDamage, GroundUnsafe:
		return true
	}
	return false
}

// GroundLabel is the ground in words, for the panel and the receipt.
func GroundLabel(g string) string {
	switch strings.TrimSpace(strings.ToLower(g)) {
	case GroundNotDone:
		return "the work described was not done"
	case GroundNotHere:
		return "the evidence is not of this property"
	case GroundFabricated:
		return "the evidence does not look genuine"
	case GroundDamage:
		return "something was damaged"
	case GroundUnsafe:
		return "the work was left unsafe"
	}
	return g
}

// Grounds lists what a buyer may object on, for the console and the docs.
func Grounds() []map[string]string {
	out := make([]map[string]string, 0, 5)
	for _, g := range []string{
		GroundNotDone, GroundNotHere, GroundFabricated, GroundDamage, GroundUnsafe,
	} {
		out = append(out, map[string]string{"ground": g, "means": GroundLabel(g)})
	}
	return out
}
