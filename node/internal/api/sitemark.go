package api

import (
	"strings"
	"unicode"
)

// Proving it is *this* place, not a place.
//
// The challenge code answers a question about time: this photograph was made
// after the job was claimed, by somebody who held a code nobody else had. It
// answers nothing about location. A photograph of a cut lawn — any cut lawn,
// anywhere — with today's code written on a slip of paper in the corner
// satisfies every check the exchange had.
//
// The things that looked like location checks are weaker than they read:
//
//   - The geofence compares EXIF coordinates against the job's point. EXIF is
//     written by whatever produced the file and is trivially editable. It
//     raises the cost of faking from "take any photo" to "take any photo and
//     edit two numbers", which is not much of a cost.
//   - Perceptual hashing catches an image submitted twice. It says nothing
//     about a fresh photograph of the wrong place.
//   - The describe/adjudicate split judges whether the lawn is cut. It has no
//     idea whose lawn it is.
//
// So a site mark: something visible at that property and only at that
// property, which has to appear in frame. A house number is the obvious one
// and is usually already there. It is the same mechanism as the challenge
// code, pointed at place instead of time, and it survives the thing that
// breaks image comparison — a different camera, a different angle, a different
// season — because it is read as text rather than matched as pixels.
//
// What it does not do: stop somebody who goes to the right address and
// photographs the neighbour's lawn, or who obtains a photograph of the right
// house from elsewhere. It closes the cheap attack, not every attack, and the
// receipt says which it closed.

// SiteMark is what identifies a property in frame.
type SiteMark struct {
	// Text is what must be legible: "812", "Unit 4B", a meter serial.
	Text string `json:"text"`
	// Note tells the operator where to find it, in the buyer's words —
	// "number is on the porch post, not the kerb".
	Note string `json:"note,omitempty"`
	// Derived records that the exchange inferred this from the address rather
	// than the buyer stating it. An inferred mark is a weaker claim: the
	// number may not be visible from where the work is, and refusing somebody
	// over a guess would be worse than the gap it closes.
	Derived bool `json:"derived,omitempty"`
}

// HouseNumber pulls the street number out of an address.
//
// Deliberately conservative: only a leading token that is entirely digits, or
// digits with a single trailing letter ("812", "14A"). Anything else returns
// empty and the job simply has no derived mark, which is the safe direction —
// a wrong mark makes honest work unverifiable.
func HouseNumber(where string) string {
	fields := strings.Fields(strings.TrimSpace(where))
	if len(fields) == 0 {
		return ""
	}
	tok := strings.Trim(fields[0], ",.")
	if tok == "" {
		return ""
	}
	digits := 0
	for i, r := range tok {
		switch {
		case unicode.IsDigit(r):
			digits++
		case unicode.IsLetter(r) && i == len(tok)-1 && digits > 0:
			// A single trailing letter, as in 14A.
		default:
			return ""
		}
	}
	if digits == 0 {
		return ""
	}
	return strings.ToUpper(tok)
}

// MarkFor decides what must be in frame to show this is the right property.
//
// A mark the buyer states wins over one inferred from the address, because the
// buyer knows whether their number is actually visible and the exchange is
// guessing.
func (l *Listing) MarkFor() *SiteMark {
	if l.SiteMark != nil && strings.TrimSpace(l.SiteMark.Text) != "" {
		m := *l.SiteMark
		m.Text = strings.TrimSpace(m.Text)
		return &m
	}
	if n := HouseNumber(l.Where); n != "" {
		return &SiteMark{Text: n, Derived: true,
			Note: "the property number, visible somewhere in one of the photographs"}
	}
	return nil
}

// TiedToPlace reports whether this job is about a specific location.
//
// A job with an address or a fence is about somewhere. "Photograph anything
// with the code in frame" is not, and demanding a house number of it would be
// nonsense.
func (l *Listing) TiedToPlace() bool {
	return strings.TrimSpace(l.Where) != "" || l.RadiusM > 0 || l.SiteID != ""
}

// NormalizeMark folds a mark for comparison the way codes are folded, so "812"
// matches "812," and "No. 812".
func NormalizeMark(s string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(s) {
		if unicode.IsDigit(r) || unicode.IsLetter(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// MarkSeenIn reports whether a mark appears in transcribed text.
//
// Substring rather than equality, because the number is read as part of a
// longer string far more often than alone: "812 MARLOW ST" on a kerb, "APT
// 812" on a door. Requiring an exact token would fail on almost every real
// photograph.
//
// The comparison happens here, in Go, against text a model transcribed without
// being told what to look for — the same arrangement that makes the challenge
// code trustworthy. A submitter cannot talk the describer into reporting a
// number it did not see, because the describer was never told which number
// would pay.
func MarkSeenIn(texts []string, mark string) bool {
	want := NormalizeMark(mark)
	if want == "" {
		return false
	}
	for _, t := range texts {
		if strings.Contains(NormalizeMark(t), want) {
			return true
		}
	}
	return false
}
