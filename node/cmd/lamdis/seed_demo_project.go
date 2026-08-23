package main

import (
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/exchange"
)

// A worked example of multi-part work, for the side that would do it.
//
// Practice jobs exist so an operator can learn where the buttons are before
// anybody's money is involved. Nothing did the same for a business. A paving
// contractor arriving at the console found capacity settings and an open board
// and no answer to the question they actually have, which is: what does a job
// too big for one visit look like here, and how would my agent take one?
//
// So this is the paving scope, seeded and readable: repair the front driveway,
// pave a new drive to the back, pour a slab for the barn. One address, three
// pieces, a real order between them, and a single offer covering all three. It
// is marked practice throughout — nobody is paying, and nobody should drive
// anywhere — but everything else about it is the real machinery: the same
// board, the same bidding, the same dependency rules, the same stage plan.
//
// A contractor's agent can read it, price it, and be told exactly why the back
// drive cannot start yet, without a cent moving.
const demoProject = "proj-demo-paving"

func seedDemoProject(srv *exchange.Server) error {
	now := time.Now()
	year := now.Add(365 * 24 * time.Hour)

	// The scope, in the order it has to happen.
	//
	// The barn slab comes first and everything else waits on it, which is the
	// kind of fact that lives on the supply side: the concrete truck needs to
	// cross the back of the property, so surfacing that drive before the slab
	// is poured means tearing it up again.
	pieces := []struct {
		job, title, detail, deliverable string
		instructions                    string
		dependsOn                       []string
		ceilingMinor                    int64
	}{
		{
			job:   "demo-barn-slab",
			title: "Pour a slab for the backyard barn",
			detail: "Roughly 24 by 30, reinforced, to take a tractor. " +
				"First of the three, because the mixer has to cross the back " +
				"of the property to reach it.",
			instructions: "Form, pour and finish the slab. Photograph each " +
				"stage with the code in frame. This is a demonstration: read " +
				"it, price it, do not drive anywhere.",
			deliverable:  "Slab poured, floated and edged, with the code legible in shot.",
			ceilingMinor: 450000,
		},
		{
			job:   "demo-front-drive",
			title: "Repair the front driveway",
			detail: "Existing asphalt, roughly 600 square feet, cracked and " +
				"settled near the apron. Patch and overlay rather than replace.",
			instructions: "Cut out failed sections, patch, and overlay. " +
				"Photograph before and after with the code in frame. This is a " +
				"demonstration: read it, price it, do not drive anywhere.",
			deliverable:  "Driveway patched and overlaid, apron level, code legible in shot.",
			ceilingMinor: 550000,
		},
		{
			job:   "demo-back-drive",
			title: "Pave a new driveway to the back",
			detail: "New run from the front apron to the barn slab, roughly " +
				"110 feet. Cannot start until the slab is poured and accepted — " +
				"the mixer crosses this ground.",
			instructions: "Excavate, base, binder and surface the new run. " +
				"Photograph each stage with the code in frame. This is a " +
				"demonstration: read it, price it, do not drive anywhere.",
			deliverable:  "New drive surfaced and rolled, tying into the slab, code legible in shot.",
			dependsOn:    []string{"demo-barn-slab"},
			ceilingMinor: 700000,
		},
	}

	for _, p := range pieces {
		l := &api.Listing{
			Job: p.job, Kind: api.KindDo,
			Title: p.title, Detail: p.detail,
			Instructions: p.instructions, Deliverable: p.deliverable,
			// Practice throughout. A demonstration somebody can mistake for
			// real work is worse than no demonstration: they travel, find
			// nothing, and learn that the board is fake.
			Practice: true,
			// One project, one site, which is the fact that changes the price.
			ProjectID: demoProject, ProjectTitle: "Driveways and barn slab, one property",
			SiteID: "demo-site-1", Area: "Detroit, MI",
			DependsOn: p.dependsOn,
			// Priced by asking, and biddable as one scope.
			Pricing: api.PriceBids, BidsAsOne: true,
			MaxBidMinor: p.ceilingMinor,
			BidsCloseAt: year,
			// The winner writes the schedule. A homeowner does not know what a
			// binder course is, and neither does their agent.
			PlanBy:   api.PlanBySupplier,
			PayMinor: 0, Currency: "USD",
			Tier:  "V1",
			Slots: 1, Expires: year, Posted: now,
		}
		if err := srv.Board.Post(l); err != nil {
			return err
		}
	}
	return nil
}
