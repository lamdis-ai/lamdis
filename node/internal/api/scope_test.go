package api

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// The paving scope, as the adversarial review described it: repair the front
// driveway, pave a new drive to the back, pour a slab for the barn. One
// address, one customer, one week, and until now three listings with nothing
// connecting them.
func pavingBoard(t *testing.T) (*Board, time.Time) {
	t.Helper()
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	jobs := []struct {
		id, title string
		depends   []string
	}{
		{"pave-front", "Repair the front driveway", nil},
		{"pave-back", "Pave a new driveway to the back", []string{"barn-slab"}},
		{"barn-slab", "Pour a slab for the backyard barn", nil},
	}
	for _, j := range jobs {
		l := &Listing{
			Job: j.id, Kind: KindTask, Title: j.title,
			ProjectID: "proj-paving", ProjectTitle: "Driveways and barn slab",
			SiteID: "site-1", Area: "Detroit, MI",
			DependsOn: j.depends, BidsAsOne: true,
			Pricing: PriceBids, MaxBidMinor: 900000,
			Currency: "USD", Slots: 1,
			Expires: now.Add(30 * 24 * time.Hour), Posted: now,
			BidsCloseAt: now.Add(7 * 24 * time.Hour),
		}
		if err := b.Post(l); err != nil {
			t.Fatalf("post %s: %v", j.id, err)
		}
	}
	return b, now
}

// The finding that led the review: an operator was never told the jobs belonged
// together, so they could not price one mobilisation instead of three.
func TestBoardPublishesProjectMembership(t *testing.T) {
	b, _ := pavingBoard(t)

	l, ok := b.Get("pave-front")
	if !ok {
		t.Fatal("listing missing")
	}
	pub := l.Public()
	if pub.ProjectID != "proj-paving" {
		t.Error("Public() strips the project; an operator cannot tell these jobs are one scope")
	}

	br := b.BriefFor("pave-front")
	if br == nil {
		t.Fatal("no brief")
	}
	if br.Jobs != 3 {
		t.Errorf("brief says %d jobs, want 3", br.Jobs)
	}
	if !br.OneVisit || br.Sites != 1 {
		t.Errorf("three jobs at one site should read as one visit, got %d sites", br.Sites)
	}
	if !br.BidsAsOne {
		t.Error("the scope takes a single offer and does not say so")
	}
}

// The budget is the buyer's negotiating position. Publishing it turns every
// project into a bid at the ceiling.
func TestBriefNeverCarriesTheBudget(t *testing.T) {
	b, _ := pavingBoard(t)
	br := b.BriefFor("pave-front")
	if br == nil {
		t.Fatal("no brief")
	}
	// Structural rather than a spot check: a field added to ProjectBrief later
	// that smells of money should fail here rather than ship.
	for _, bad := range []string{"Budget", "Owner", "Remaining", "Committed"} {
		if fieldExists(br, bad) {
			t.Errorf("ProjectBrief carries %s, which is the buyer's own business", bad)
		}
	}
}

func fieldExists(v any, name string) bool {
	t := reflect.TypeOf(v).Elem()
	for i := 0; i < t.NumField(); i++ {
		if strings.Contains(t.Field(i).Name, name) {
			return true
		}
	}
	return false
}

// Ordering has to bite, not just display. Two operators reading the same
// listing and both taking it is how somebody drives to a site where the ground
// is still wet.
func TestDependenciesBlockTheClaim(t *testing.T) {
	b, _ := pavingBoard(t)

	if _, _, err := b.Claim("pave-back", "crew-a"); err == nil {
		t.Fatal("the back drive was claimable while the slab it crosses is unpoured")
	} else if !strings.Contains(err.Error(), "Pour a slab") {
		t.Errorf("the refusal should name what is in the way, got %q", err)
	}

	// The front drive depends on nothing and must stay takeable.
	if _, _, err := b.Claim("pave-front", "crew-a"); err != nil {
		t.Fatalf("an unblocked piece was refused: %v", err)
	}

	// Accepted, not merely submitted. A stranger who photographed the wrong
	// thing must not release the work that waits on them.
	b.Done("barn-slab", "crew-b")
	if _, _, err := b.Claim("pave-back", "crew-c"); err == nil {
		t.Error("a released seat unblocked the dependency; only acceptance may")
	}
	b.Accept("barn-slab")
	if _, _, err := b.Claim("pave-back", "crew-c"); err != nil {
		t.Errorf("still blocked after the slab was accepted: %v", err)
	}
}

// The commercial answer the exchange could not express: all three, one visit,
// one price, awarded together or not at all.
func TestProjectBidCoversTheWholeScope(t *testing.T) {
	b, now := pavingBoard(t)

	lines := []BidLine{
		{Job: "pave-front", AmountMinor: 480000, Note: "carries the mobilisation for all three"},
		{Job: "barn-slab", AmountMinor: 390000},
		{Job: "pave-back", AmountMinor: 550000},
	}
	bid, err := b.PlaceProjectBid("proj-paving", "calder-paving", lines, "USD",
		"Slab first, cure over the weekend, both drives Monday and Tuesday.",
		now.Add(72*time.Hour), true)
	if err != nil {
		t.Fatalf("place: %v", err)
	}
	if bid.TotalMinor != 1420000 {
		t.Errorf("total %d, want 1420000", bid.TotalMinor)
	}

	// A bundle that does not cover the scope is not all of anything, and the
	// refusal must come now rather than after the buyer has decided.
	_, err = b.PlaceProjectBid("proj-paving", "other-co",
		[]BidLine{{Job: "pave-front", AmountMinor: 300000}}, "USD", "", now, true)
	if err == nil || !strings.Contains(err.Error(), "whole scope") {
		t.Errorf("a partial all-or-nothing offer was accepted: %v", err)
	}

	// A per-job ceiling still binds inside a bundle, or bundling is a way
	// around the limit the buyer set.
	_, err = b.PlaceProjectBid("proj-paving", "pricey-co", []BidLine{
		{Job: "pave-front", AmountMinor: 950000},
		{Job: "barn-slab", AmountMinor: 10000},
		{Job: "pave-back", AmountMinor: 10000},
	}, "USD", "", now, true)
	if err == nil {
		t.Error("a line above the buyer's ceiling was accepted inside a bundle")
	}
}

// Awarding is all or nothing in the ledger too: if any line cannot be funded,
// none of them land.
func TestAwardingABundleIsAtomic(t *testing.T) {
	b, now := pavingBoard(t)
	lines := []BidLine{
		{Job: "pave-front", AmountMinor: 480000},
		{Job: "barn-slab", AmountMinor: 390000},
		{Job: "pave-back", AmountMinor: 550000},
	}
	if _, err := b.PlaceProjectBid("proj-paving", "calder-paving", lines, "USD", "", now, true); err != nil {
		t.Fatalf("place: %v", err)
	}
	// The third line fails to fund.
	calls := 0
	_, err := b.AwardProject("proj-paving", "proj-paving:calder-paving",
		func(l *Listing) error {
			calls++
			if calls == 3 {
				return errNotFunded
			}
			return nil
		})
	if err == nil {
		t.Fatal("a bundle awarded with an unfundable line")
	}
	for _, j := range []string{"pave-front", "barn-slab", "pave-back"} {
		l, _ := b.Get(j)
		if l.Awarded != "" {
			t.Errorf("%s was awarded even though the bundle failed", j)
		}
	}

	// And the happy path awards every piece to the one supplier.
	if _, err := b.AwardProject("proj-paving", "proj-paving:calder-paving", nil); err != nil {
		t.Fatalf("award: %v", err)
	}
	for _, j := range []string{"pave-front", "barn-slab", "pave-back"} {
		l, _ := b.Get(j)
		if l.Awarded != "calder-paving" {
			t.Errorf("%s went to %q", j, l.Awarded)
		}
	}
	front, _ := b.Get("pave-front")
	if front.PayMinor != 480000 {
		t.Errorf("the line amount did not become the price: %d", front.PayMinor)
	}
}

// The whole scope, sequenced, as a supplier reads it before deciding to bid.
func TestScopeShowsWhatCanStartToday(t *testing.T) {
	b, _ := pavingBoard(t)
	sc := b.Scope("proj-paving")
	if sc == nil {
		t.Fatal("no scope")
	}
	if len(sc.Jobs) != 3 {
		t.Fatalf("scope has %d jobs, want 3", len(sc.Jobs))
	}
	claimable := map[string]bool{}
	for _, j := range sc.Jobs {
		claimable[j.Job] = j.Claimable
	}
	if !claimable["pave-front"] || !claimable["barn-slab"] {
		t.Error("unblocked pieces should be claimable now")
	}
	if claimable["pave-back"] {
		t.Error("the back drive is claimable while the slab it crosses is unpoured")
	}
}

var errNotFunded = errNotFundedType{}

type errNotFundedType struct{}

func (errNotFundedType) Error() string { return "insufficient funds" }

// The reversal: the person who knows how paving decomposes is the paving
// contractor, not the homeowner who wants a driveway.
func TestSupplierProposesTheStages(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	l := &Listing{
		Job: "drive-1", Kind: KindTask, Title: "Pave a new driveway to the back",
		Area: "Detroit, MI", Pricing: PriceBids, MaxBidMinor: 700000,
		Currency: "USD", Slots: 1, PlanBy: PlanBySupplier,
		Expires: now.Add(30 * 24 * time.Hour), Posted: now,
	}
	if err := b.Post(l); err != nil {
		t.Fatalf("post: %v", err)
	}
	if _, err := b.PlaceBid("drive-1", "calder", 550000, "USD", "", now); err != nil {
		t.Fatalf("bid: %v", err)
	}
	if _, err := b.Award("drive-1", "drive-1:calder", nil); err != nil {
		t.Fatalf("award: %v", err)
	}

	// Nothing may start before the schedule exists, or the staging that was
	// the whole point silently does not happen.
	if _, _, err := b.Claim("drive-1", "calder"); err == nil {
		t.Error("work started with no stage plan at all")
	}

	stages := []Stage{
		{Name: "Excavate and prep", Deliverable: "Sub-base graded, photo with code", PayMinor: 120000},
		{Name: "Aggregate base", Deliverable: "Base compacted to depth", PayMinor: 150000},
		{Name: "Asphalt delivered", Deliverable: "Weigh ticket and load on site", PayMinor: 180000, Materials: true},
		{Name: "Surface course", Deliverable: "Driveway rolled and finished", PayMinor: 100000},
	}
	if err := b.ProposeStages("drive-1", "calder", stages); err != nil {
		t.Fatalf("propose: %v", err)
	}

	// A plan is not a way to reopen the price.
	bad := append([]Stage(nil), stages...)
	bad[0].PayMinor = 500000
	if err := b.ProposeStages("drive-1", "calder", bad); err == nil {
		t.Error("a plan whose stages do not add up to the agreed price was accepted")
	}

	// And a stranger cannot write somebody else's schedule.
	if err := b.ProposeStages("drive-1", "someone-else", stages); err == nil {
		t.Error("a stranger proposed a plan for a job they did not win")
	}

	// Still not startable while the buyer has not agreed.
	if _, _, err := b.Claim("drive-1", "calder"); err == nil {
		t.Error("work started on a plan the buyer had not accepted")
	}
	if err := b.AcceptPlan("drive-1"); err != nil {
		t.Fatalf("accept: %v", err)
	}
	got, _ := b.Get("drive-1")
	if len(got.Stages) != 4 {
		t.Fatalf("accepted plan gave %d stages, want 4", len(got.Stages))
	}
	if got.StagePay() != 550000 {
		t.Errorf("stages total %d, want the agreed 550000", got.StagePay())
	}
	if _, _, err := b.Claim("drive-1", "calder"); err != nil {
		t.Errorf("work still refused after the plan was agreed: %v", err)
	}
}

// A job posted the old way — buyer names the stages — must be untouched.
func TestBuyerPlannedJobsAreUnchanged(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	l := &Listing{
		Job: "sweep-1", Kind: KindTask, Title: "Compliance sweep",
		Area: "Detroit, MI", Currency: "USD", Slots: 1, PayMinor: 20000,
		Stages: []Stage{
			{Name: "Materials", Deliverable: "Receipt", PayMinor: 8000, Materials: true},
			{Name: "Labour", Deliverable: "Photo of the finished job", PayMinor: 12000},
		},
		Expires: now.Add(24 * time.Hour), Posted: now,
	}
	if err := b.Post(l); err != nil {
		t.Fatalf("post: %v", err)
	}
	if _, _, err := b.Claim("sweep-1", "crew"); err != nil {
		t.Fatalf("a buyer-staged job was refused: %v", err)
	}
	if err := b.ProposeStages("sweep-1", "crew", nil); err == nil {
		t.Error("a supplier rewrote the stages of a job the buyer staged")
	}
}

// "Piece 1 of 3" has to mean "this one goes first". Posting order does not mean
// that: three jobs posted together share a timestamp and fall back to sorting
// by job id, which made the buyer's sequence come out alphabetical.
func TestScopeIsOrderedByDependencyNotName(t *testing.T) {
	b, _ := pavingBoard(t)
	sc := b.Scope("proj-paving")
	var order []string
	for _, j := range sc.Jobs {
		order = append(order, j.Job)
	}
	// barn-slab blocks pave-back, so it must come first despite sorting last
	// alphabetically among the two.
	slab, back := indexOf(order, "barn-slab"), indexOf(order, "pave-back")
	if slab < 0 || back < 0 {
		t.Fatalf("scope missing pieces: %v", order)
	}
	if slab > back {
		t.Errorf("the slab is listed after the drive that waits on it: %v", order)
	}
	// The invariant is that every piece comes after everything it waits on,
	// not that a blocked piece lands in any particular slot.
	for _, j := range sc.Jobs {
		for _, dep := range j.DependsOn {
			if d := indexOf(order, dep); d >= 0 && d > indexOf(order, j.Job) {
				t.Errorf("%s is listed before %s, which it waits on: %v", j.Job, dep, order)
			}
		}
	}
}

// A cycle is somebody's mistake, and the scope must still list every piece
// rather than silently dropping the ones it cannot order.
func TestScopeSurvivesADependencyCycle(t *testing.T) {
	now := time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)
	b := NewBoard(NewCapabilities())
	b.Now = func() time.Time { return now }
	for _, p := range []struct{ job, dep string }{{"a", "b"}, {"b", "a"}} {
		if err := b.Post(&Listing{
			Job: p.job, Kind: KindTask, Title: "piece " + p.job,
			ProjectID: "cyc", Area: "Detroit, MI", Currency: "USD", Slots: 1,
			DependsOn: []string{p.dep},
			Expires:   now.Add(24 * time.Hour), Posted: now,
		}); err != nil {
			t.Fatalf("post: %v", err)
		}
	}
	sc := b.Scope("cyc")
	if sc == nil || len(sc.Jobs) != 2 {
		t.Fatalf("a cycle lost a piece of the scope: %+v", sc)
	}
}

func indexOf(xs []string, want string) int {
	for i, x := range xs {
		if x == want {
			return i
		}
	}
	return -1
}
