package api

import (
	"strings"
	"testing"
	"time"
)

func quotableJob(now time.Time) *Listing {
	return &Listing{
		Job: "do-drive", Kind: KindDo,
		Title:        "Pave a new driveway to the back",
		Instructions: "Excavate, base, binder and surface the new run.",
		Deliverable:  "New drive surfaced and rolled, code legible in shot.",
		Brief:        "Wide enough for a truck and a car to pass. Drainage to the road.",
		Where:        "812 Marlow Street", Area: "Detroit, MI",
		Pricing: PriceBids, MaxBidMinor: 700000, Currency: "USD", Slots: 1,
		Unknowns: []Unknown{{Name: "driveway width", Unit: "feet"}},
		References: []Reference{
			{SHA256: "aaa", Mime: "image/jpeg", Caption: "the run, from the front apron"},
			{SHA256: "bbb", Mime: "image/jpeg", Caption: "number on the porch post",
				Identifies: true},
		},
		Expires: now.Add(30 * 24 * time.Hour), Posted: now,
	}
}

// A reference nobody can see until they have committed to the job is not a
// reference, it is a surprise. They go out with the public listing.
func TestReferencesArePublished(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	p := quotableJob(now).Public()
	if len(p.References) != 2 {
		t.Fatalf("the public listing carries %d references, want 2", len(p.References))
	}
	if p.References[0].Caption == "" {
		t.Error("captions did not survive; a photo with no caption is a puzzle")
	}
}

// The shot somebody opens on arrival to check they are in the right place.
func TestOneReferenceIdentifiesTheProperty(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	l := quotableJob(now)
	ref, ok := l.Identifier()
	if !ok || ref.SHA256 != "bbb" {
		t.Fatalf("no identifying reference found: %+v", ref)
	}
	// Two would mean neither is the one to open.
	l.References[0].Identifies = true
	if err := l.ValidateReferences(); err == nil {
		t.Error("two identifying references were accepted")
	}
}

// The complaint that started this: the demo job described work and gave nothing
// to price it against. An unpriceable job wastes every operator who opens it,
// and the buyer is the only person who can fix it.
func TestAnUnquotableJobSaysWhatIsMissing(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	bare := &Listing{
		Job: "do-bare", Kind: KindDo, Title: "Pave a new driveway to the back",
		Instructions: "Excavate, base, binder and surface the new run.",
		Where:        "812 Marlow Street", Area: "Detroit, MI",
		Pricing: PriceBids, Currency: "USD", Slots: 1,
		Expires: now.Add(24 * time.Hour), Posted: now,
	}
	missing := bare.QuotableBy()
	if len(missing) == 0 {
		t.Fatal("a job with no photos, no dimensions and no deliverable reads as quotable")
	}
	joined := strings.ToLower(strings.Join(missing, " "))
	for _, want := range []string{"photograph", "prove"} {
		if !strings.Contains(joined, want) {
			t.Errorf("the warning does not mention %q: %v", want, missing)
		}
	}

	// A job with the site shown, a deliverable, and its unknowns stated is
	// quotable and must not be nagged about.
	if got := quotableJob(now).QuotableBy(); len(got) != 0 {
		t.Errorf("a well-described job was flagged: %v", got)
	}

	// A fixed price is the buyer's own answer to the question.
	fixed := *bare
	fixed.Pricing = ""
	fixed.PayMinor = 2000
	if got := fixed.QuotableBy(); len(got) != 0 {
		t.Errorf("a fixed-price job was asked to justify itself: %v", got)
	}
}

// Advisory, not enforced: a buyer may post a thin job and find out nobody bids.
func TestThinJobsAreStillPostable(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	if err := b.Post(&Listing{
		Job: "do-thin", Kind: KindDo, Title: "Move a pallet",
		Instructions: "Move it to the far bay.", Where: "812 Marlow Street",
		Pricing: PriceBids, Currency: "USD", Slots: 1,
		Expires: now.Add(24 * time.Hour), Posted: now,
	}); err != nil {
		t.Fatalf("the exchange refused a thin job outright: %v", err)
	}
}

// A folder of drawings belongs in an email to whoever wins it.
func TestReferencesAreBounded(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	l := quotableJob(now)
	l.References = nil
	for i := 0; i <= MaxReferences; i++ {
		l.References = append(l.References,
			Reference{SHA256: strings.Repeat(string(rune('a'+i)), 8)})
	}
	if err := l.ValidateReferences(); err == nil {
		t.Error("a listing accepted more references than it carries")
	}
}
