package api

import (
	"fmt"
	"strings"
)

// What a quote is made of.
//
// A job could say "excavate, base, binder and surface the new run" and give
// nothing else: no photograph of the ground, no dimensions, no way to see the
// access. Anybody pricing it was guessing, and the exchange was running an
// auction on guesses. The bids that came back would be either padded against
// the unknown or wrong, and both of those are how a market like this gets a
// reputation for wasting people's time.
//
// Two things fix it and neither is complicated. Unknowns, already built, let a
// buyer say what they cannot specify so a bid can answer it. References are
// the other half: what the buyer *can* show. A photograph of the ground, the
// access, the property number, a survey, a spec sheet.
//
// It is also what answers a question the verification side could not: how does
// whoever turns up — a crew, a driver, a drone — know they are at the right
// place before they start? A reference shot of the frontage is checkable by a
// person on arrival and by a machine on approach, and it costs the buyer one
// photograph.
//
// Deliberately not a document management system. A handful of images with a
// caption each, published with the job, gone when the job is. The exchange
// does not version them, review them, or let anybody comment on them.

// MaxReferences bounds how many a job may carry.
//
// Enough to show a site from a few angles and no more. A job needing a folder
// of drawings is a job whose scope belongs in a document the buyer sends the
// winner, not on an open board.
const MaxReferences = 6

// Reference is something the buyer supplies so the work can be priced and
// found.
type Reference struct {
	// SHA256 addresses the image in the same store evidence uses.
	SHA256 string `json:"sha256"`
	// Mime is the stored type, so the browser is told the truth about it.
	Mime string `json:"mime,omitempty"`
	// Caption is what this shows, in the buyer's words: "from the gate",
	// "number on the porch post", "where the old surface fails".
	Caption string `json:"caption,omitempty"`
	// Identifies marks the shot that shows the property is the right one.
	//
	// Called out rather than left as one picture among several, because it is
	// the one somebody opens on arrival to check they are in the right place.
	// A caption is a hint; this is a job for the image.
	Identifies bool `json:"identifies,omitempty"`
	// Bytes is the stored size, so a client can decide what to fetch first.
	Bytes int `json:"bytes,omitempty"`
}

// ValidateReferences checks what a buyer attached before it is published.
func (l *Listing) ValidateReferences() error {
	if len(l.References) > MaxReferences {
		return fmt.Errorf(
			"board: %d reference images is more than a listing carries (limit %d). "+
				"Show the site, the access and the number; send drawings to whoever "+
				"wins it", len(l.References), MaxReferences)
	}
	seen := map[string]bool{}
	identifiers := 0
	for i, r := range l.References {
		if strings.TrimSpace(r.SHA256) == "" {
			return fmt.Errorf("board: reference %d has no image", i+1)
		}
		if seen[r.SHA256] {
			return fmt.Errorf("board: the same image is attached twice")
		}
		seen[r.SHA256] = true
		if r.Identifies {
			identifiers++
		}
	}
	if identifiers > 1 {
		return fmt.Errorf(
			"board: only one reference can be the one that identifies the " +
				"property; that is the shot somebody opens on arrival")
	}
	return nil
}

// Identifier returns the reference that shows this is the right property.
func (l *Listing) Identifier() (Reference, bool) {
	for _, r := range l.References {
		if r.Identifies {
			return r, true
		}
	}
	return Reference{}, false
}

// QuotableBy reports whether somebody could reasonably price this, and says
// what is missing when they could not.
//
// Advisory rather than enforced. A buyer is allowed to post a thin job and
// find out that nobody bids; refusing it outright would be the exchange
// deciding it knows their work better than they do. What it must not do is let
// them post it without noticing — an unpriceable job wastes every operator who
// opens it, and the buyer is the only one who can fix it.
func (l *Listing) QuotableBy() []string {
	if l.Pricing != PriceBids {
		// A fixed price is the buyer's own answer to this question.
		return nil
	}
	var missing []string
	if len(l.References) == 0 && l.TiedToPlace() {
		missing = append(missing,
			"no photographs of the site, so anybody pricing it is guessing at "+
				"what they will find")
	}
	if _, ok := l.Identifier(); !ok && l.TiedToPlace() && len(l.References) > 0 {
		missing = append(missing,
			"nothing marked as the shot that shows the right property, so "+
				"whoever turns up cannot check they are in the right place")
	}
	if strings.TrimSpace(l.Deliverable) == "" {
		missing = append(missing, "no statement of what would prove it done")
	}
	if len(l.Unknowns) == 0 && strings.TrimSpace(l.Brief) == "" &&
		len(l.Report) == 0 && l.WorkHours == 0 {
		missing = append(missing,
			"no dimensions, no notes and no open questions, so there is nothing "+
				"to price against except the title")
	}
	return missing
}
