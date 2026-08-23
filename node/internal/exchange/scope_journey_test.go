package exchange

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

// The paving company's journey, over the real routes.
//
// The adversarial review found the supply side could not see a project, could
// not bid on one, and could not contribute the staging expertise only it has.
// This walks the whole thing the way a contractor's agent would: read the
// scope, bundle it, win it, propose the schedule, and be held to the order.
func TestPavingCompanyCanFulfilAThreePartScope(t *testing.T) {
	h := newScopeHarness(t)

	// 1. The homeowner's agent posts the scope as one project.
	project := h.openProject(t, "Driveways and barn slab", 1600000)
	slab := h.postPiece(t, project, "Pour a slab for the backyard barn", nil, 450000)
	front := h.postPiece(t, project, "Repair the front driveway", nil, 550000)
	back := h.postPiece(t, project, "Pave a new driveway to the back",
		[]string{slab}, 700000)

	// 2. The contractor reads the whole scope, which was previously impossible:
	//    every project route was buyer-only.
	scope := h.board.Scope(project)
	if scope == nil {
		t.Fatal("a supplier cannot read the project at all")
	}
	if scope.Project.Jobs != 3 || !scope.Project.OneVisit {
		t.Fatalf("the scope does not read as three pieces at one address: %+v", scope.Project)
	}

	// 3. And is told what cannot start yet, before pricing it.
	byJob := map[string]*api.ScopeJob{}
	for _, j := range scope.Jobs {
		byJob[j.Job] = j
	}
	if byJob[back].Claimable {
		t.Error("the back drive reads as startable while the slab is unpoured")
	}
	if len(byJob[back].BlockedBy) != 1 || byJob[back].BlockedBy[0] != slab {
		t.Errorf("the block is not attributed to the slab: %v", byJob[back].BlockedBy)
	}

	// 4. One offer, one mobilisation, all or nothing.
	bid, err := h.board.PlaceProjectBid(project, "calder-paving", []api.BidLine{
		{Job: slab, AmountMinor: 390000},
		{Job: front, AmountMinor: 480000, Note: "carries mobilisation for all three"},
		{Job: back, AmountMinor: 550000},
	}, "USD", "Slab Monday, cure to Wednesday, both drives Thursday and Friday.",
		h.now(), true)
	if err != nil {
		t.Fatalf("bundle refused: %v", err)
	}
	if bid.TotalMinor != 1420000 {
		t.Fatalf("bundle totals %d", bid.TotalMinor)
	}

	// 5. The buyer accepts the bundle and every piece lands on one supplier.
	if _, err := h.board.AwardProject(project, bid.ID, nil); err != nil {
		t.Fatalf("award: %v", err)
	}
	for _, j := range []string{slab, front, back} {
		l, _ := h.board.Get(j)
		if l.Awarded != "calder-paving" {
			t.Fatalf("%s went to %q, so the bundle did not land whole", j, l.Awarded)
		}
	}

	// 6. The contractor writes the schedule, because they are the ones who
	//    know that a slab cures before anything drives on it.
	stages := []api.Stage{
		{Name: "Form and pour", Deliverable: "Slab poured and floated, code in frame", PayMinor: 240000},
		{Name: "Concrete delivered", Deliverable: "Weigh ticket and truck on site", PayMinor: 90000, Materials: true},
		{Name: "Cure and strip forms", Deliverable: "Forms off, edges finished", PayMinor: 60000},
	}
	if err := h.board.ProposeStages(slab, "calder-paving", stages); err != nil {
		t.Fatalf("propose: %v", err)
	}
	// Nothing starts on a plan the buyer has not seen.
	if _, _, err := h.board.Claim(slab, "calder-paving"); err == nil {
		t.Error("work began on an unagreed plan")
	}
	if err := h.board.AcceptPlan(slab); err != nil {
		t.Fatalf("accept plan: %v", err)
	}
	if _, _, err := h.board.Claim(slab, "calder-paving"); err != nil {
		t.Fatalf("work refused after the plan was agreed: %v", err)
	}

	// 7. The order is enforced against the supplier who won it, not merely
	//    displayed. Winning the bundle does not let them pave the back drive
	//    on Monday.
	if _, _, err := h.board.Claim(back, "calder-paving"); err == nil {
		t.Error("the winner could start the back drive before the slab was accepted")
	} else if !strings.Contains(err.Error(), "slab") {
		t.Errorf("the refusal does not name what is in the way: %v", err)
	}
	h.board.Accept(slab)
	// The back drive is still plan-gated, which is the correct next refusal.
	_, _, err = h.board.Claim(back, "calder-paving")
	if err == nil || !strings.Contains(err.Error(), "stage plan") {
		t.Errorf("after the slab cleared, the next gate should be the back "+
			"drive's own plan, got: %v", err)
	}
}

// A board and a project store, wired the way the server wires them.
type scopeHarness struct {
	board    *api.Board
	projects *api.Projects
	clock    time.Time
	n        int
}

func newScopeHarness(t *testing.T) *scopeHarness {
	t.Helper()
	h := &scopeHarness{clock: time.Date(2026, 8, 22, 9, 0, 0, 0, time.UTC)}
	h.board = api.NewBoard(api.NewCapabilities())
	h.board.Now = h.now
	h.projects = api.NewProjects()
	h.projects.Now = h.now
	return h
}

func (h *scopeHarness) now() time.Time { return h.clock }

func (h *scopeHarness) openProject(t *testing.T, title string, budget int64) string {
	t.Helper()
	pr, err := h.projects.Open("proj-1", "acct_homeowner", title, budget, "USD")
	if err != nil {
		t.Fatalf("open project: %v", err)
	}
	return pr.ID
}

func (h *scopeHarness) postPiece(t *testing.T, project, title string, deps []string, ceiling int64) string {
	t.Helper()
	h.n++
	job := fmt.Sprintf("do-%d", h.n)
	l := &api.Listing{
		Job: job, Kind: api.KindDo, Title: title,
		Instructions: "Do the work and photograph it with the code in frame.",
		Deliverable:  "Photographs showing the finished work.",
		Owner:        "acct_homeowner",
		ProjectID:    project, ProjectTitle: "Driveways and barn slab",
		SiteID: "site-1", Area: "Detroit, MI",
		DependsOn: deps, BidsAsOne: true, PlanBy: api.PlanBySupplier,
		Pricing: api.PriceBids, MaxBidMinor: ceiling,
		Currency: "USD", Slots: 1,
		Expires: h.clock.Add(30 * 24 * time.Hour), Posted: h.clock,
		BidsCloseAt: h.clock.Add(7 * 24 * time.Hour),
	}
	if err := h.board.Post(l); err != nil {
		t.Fatalf("post %s: %v", title, err)
	}
	if err := h.projects.Attach(project, job); err != nil {
		t.Fatalf("attach: %v", err)
	}
	return job
}
