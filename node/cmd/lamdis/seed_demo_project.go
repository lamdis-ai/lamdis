package main

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
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
		instructions, brief             string
		shots                           []shot
		unknowns                        []api.Unknown
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
			deliverable: "Slab poured, floated and edged, with the code legible in shot.",
			brief: "Owner has never measured the barn. Ground slopes maybe a foot " +
				"across the back. Tractor is a compact, not a full-size. Happy to " +
				"take a recommendation on thickness.",
			// The buyer genuinely does not know these, so they are stated
			// rather than guessed. A bid has to answer them.
			unknowns: []api.Unknown{
				{Name: "slab footprint", Note: "roughly barn-sized; never measured", Unit: "feet"},
				{Name: "slab thickness", Note: "whatever will take a compact tractor", Unit: "inches"},
			},
			shots: []shot{
				{"the barn, from the yard gate", false, 0},
				{"the number on the porch post", true, 1},
			},
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
			deliverable: "Driveway patched and overlaid, apron level, code legible in shot.",
			brief: "Cracking is worst in the ten feet nearest the road. Owner would " +
				"rather patch than replace if it will hold five years.",
			shots: []shot{
				{"the front drive, cracking near the apron", false, 2},
				{"the number on the porch post", true, 1},
			},
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
			deliverable: "New drive surfaced and rolled, tying into the slab, code legible in shot.",
			brief: "Needs to be wide enough for a truck and a car to pass. Drainage " +
				"runs toward the road. Neighbour's fence is the boundary on the left.",
			unknowns: []api.Unknown{
				{Name: "driveway width", Note: "wide enough for a truck and a car to pass", Unit: "feet"},
			},
			dependsOn: []string{"demo-barn-slab"},
			shots: []shot{
				{"the run to the back, as it is now", false, 3},
				{"access from the front apron", false, 4},
				{"the number on the porch post", true, 1},
			},
			ceilingMinor: 700000,
		},
	}

	for _, p := range pieces {
		l := &api.Listing{
			Job: p.job, Kind: api.KindDo,
			Title: p.title, Detail: p.detail,
			Instructions: p.instructions, Deliverable: p.deliverable,
			// Open text, carried verbatim, and what the buyer cannot pin down.
			Brief: p.brief, Unknowns: p.unknowns,
			// Entry details live here and reach only whoever takes the job.
			Access: "Demonstration only — there is no property and nothing to enter.",
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
		// The photographs a buyer would supply. Drawn rather than shipped as
		// files, so the demonstration does not depend on assets being present
		// — but they travel the same path a real one does: stored as a blob,
		// attached to the listing, served from the public reference route.
		for _, sh := range p.shots {
			img := siteShot(sh.caption, sh.tone)
			if err := srv.AddReference(l.Job, img, "image/jpeg",
				sh.caption, sh.identifies); err != nil {
				return err
			}
		}
	}
	return nil
}

// shot is one seeded reference image.
type shot struct {
	caption    string
	identifies bool
	tone       int
}

// siteShot draws something recognisably different per reference, so the demo
// board does not show the same grey rectangle five times.
func siteShot(caption string, tone int) []byte {
	grounds := [][3]uint8{
		{104, 122, 96}, {150, 142, 128}, {96, 96, 102}, {118, 110, 92}, {88, 104, 116},
	}
	g := grounds[tone%len(grounds)]
	img := image.NewRGBA(image.Rect(0, 0, 480, 360))
	for y := 0; y < 360; y++ {
		for x := 0; x < 480; x++ {
			switch {
			case y < 150:
				img.Set(x, y, color.RGBA{R: 132, G: 162, B: 198, A: 255}) // sky
			case y < 200:
				img.Set(x, y, color.RGBA{R: g[0] / 2, G: g[1] / 2, B: g[2] / 2, A: 255})
			default:
				// A little banding so the ground is not flat.
				d := uint8((y % 17) * 2)
				img.Set(x, y, color.RGBA{R: g[0] + d, G: g[1] + d, B: g[2] + d, A: 255})
			}
		}
	}
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 82})
	return buf.Bytes()
}
