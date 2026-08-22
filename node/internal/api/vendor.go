package api

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// The buy side of a company that already has vendors.
//
// Everything else here is an open spot market: work is posted, anybody
// qualified claims it, and sealed bids discover a price. That is the right
// shape for an errand and the wrong shape for the work a large company already
// has covered. A retailer with four hundred stores does not want a stranger
// with a ladder; they want Acme Mechanical, at the rate negotiated in March,
// against a purchase order, at store 214.
//
// Which meant the largest reason such a company would arrive — an existing
// vendor book doing already-priced work — was the one thing the exchange could
// not touch. Not for want of a field: the spot market and the vendor book are
// different mechanisms, and the second one was missing.
//
// A Book is that mechanism. Jobs directed to an approved vendor never reach
// the open board, never run an auction, and pay the agreed rate.

// Vendor is a supplier a buyer has approved to do work for them.
type Vendor struct {
	// Supplier is the account on the sell side.
	Supplier string `json:"supplier"`
	// Label is what the buyer calls them, which is rarely their legal name.
	Label string `json:"label"`
	// Rates are agreed prices in minor units, keyed by whatever the buyer
	// wants to key them by: a skill, a task name, a service code from their
	// own catalogue. The exchange does not interpret the key.
	//
	// A rate is why a directed job needs no auction. It was negotiated
	// somewhere this exchange was not present, which is the normal case.
	Rates map[string]int64 `json:"rates,omitempty"`
	// Approved is the buyer's own sign-off. Work is only directed to vendors
	// carrying it, so removing it stops future work without touching what is
	// already running.
	Approved bool      `json:"approved"`
	AddedAt  time.Time `json:"added_at"`
	// Note is free text: the MSA reference, who owns the relationship.
	Note string `json:"note,omitempty"`
}

// Rate returns the agreed price for a service, if one was negotiated.
func (v Vendor) Rate(service string) (int64, bool) {
	if v.Rates == nil {
		return 0, false
	}
	r, ok := v.Rates[strings.ToLower(strings.TrimSpace(service))]
	return r, ok
}

// Site is one of a buyer's locations.
//
// A company with four hundred stores describes work once and points it at a
// list. Without this every job carries a hand-typed address, and "the same
// check at every store" is four hundred opportunities to typo one.
type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Where is the exact address, released only to whoever takes the job.
	Where string `json:"where"`
	// Area is the coarse locality shown publicly.
	Area    string `json:"area,omitempty"`
	LatE7   int64  `json:"lat_e7,omitempty"`
	LonE7   int64  `json:"lon_e7,omitempty"`
	RadiusM int64  `json:"radius_m,omitempty"`
	// Access is how to get in at this location, and is treated exactly like a
	// job's instructions: released to the claimant, published nowhere.
	Access string `json:"access,omitempty"`
	// Retired sites stop accepting work without vanishing from old receipts.
	Retired bool `json:"retired,omitempty"`
}

// Requirements are what a buyer insists on before somebody may take their work.
type Requirements struct {
	// InsuredToMinor is the cover the buyer's own insurer makes them demand.
	// Enforced against a supplier's verified policy, not their claim.
	InsuredToMinor int64 `json:"insured_to_minor,omitempty"`
	// Vetted requires the exchange to have checked the supplier at all.
	Vetted bool `json:"vetted,omitempty"`
}

// Met reports whether a supplier satisfies these, and what is missing.
func (r Requirements) Met(sup *Supplier, now time.Time) (bool, string) {
	if r.InsuredToMinor > 0 {
		if sup == nil || !sup.Insurance.Active(now) {
			return false, "this job needs verified public liability cover, and " +
				"none is recorded against you"
		}
		if sup.Insurance.CoverageMinor < r.InsuredToMinor {
			return false, fmt.Sprintf(
				"this job needs cover of at least %d and yours is %d",
				r.InsuredToMinor, sup.Insurance.CoverageMinor)
		}
	}
	if r.Vetted && (sup == nil || !sup.Vetted) {
		return false, "this job is only open to suppliers the exchange has checked"
	}
	return true, ""
}

// Book is one buyer's vendors and sites.
type Book struct {
	mu      sync.Mutex
	vendors map[string]map[string]*Vendor // owner -> supplier -> vendor
	sites   map[string]map[string]*Site   // owner -> site id -> site
	Now     func() time.Time
}

// NewBook builds an empty one.
func NewBook() *Book {
	return &Book{
		vendors: map[string]map[string]*Vendor{},
		sites:   map[string]map[string]*Site{},
	}
}

func (b *Book) now() time.Time {
	if b.Now != nil {
		return b.Now()
	}
	return time.Now()
}

// Approve adds or updates a vendor.
func (b *Book) Approve(owner string, v Vendor) (*Vendor, error) {
	if v.Supplier == "" {
		return nil, fmt.Errorf("book: name the supplier")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.vendors[owner] == nil {
		b.vendors[owner] = map[string]*Vendor{}
	}
	existing, ok := b.vendors[owner][v.Supplier]
	if !ok {
		existing = &Vendor{Supplier: v.Supplier, AddedAt: b.now()}
		b.vendors[owner][v.Supplier] = existing
	}
	existing.Label = v.Label
	existing.Note = v.Note
	existing.Approved = v.Approved
	if v.Rates != nil {
		norm := map[string]int64{}
		for k, amt := range v.Rates {
			k = strings.ToLower(strings.TrimSpace(k))
			if k != "" && amt >= 0 {
				norm[k] = amt
			}
		}
		existing.Rates = norm
	}
	c := *existing
	return &c, nil
}

// Vendor returns one, if the buyer has it.
func (b *Book) Vendor(owner, supplier string) (*Vendor, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	v, ok := b.vendors[owner][supplier]
	if !ok {
		return nil, false
	}
	c := *v
	return &c, true
}

// Vendors lists a buyer's book.
func (b *Book) Vendors(owner string) []Vendor {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []Vendor
	for _, v := range b.vendors[owner] {
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Label < out[j].Label })
	return out
}

// Approved reports whether this supplier may be directed work by this buyer.
func (b *Book) IsApproved(owner, supplier string) bool {
	v, ok := b.Vendor(owner, supplier)
	return ok && v.Approved
}

// Revoke withdraws approval. Work already running is untouched: pulling a job
// out from under somebody at the address is not what changing a vendor list
// should mean.
func (b *Book) Revoke(owner, supplier string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	v, ok := b.vendors[owner][supplier]
	if !ok {
		return fmt.Errorf("book: not in your vendor list")
	}
	v.Approved = false
	return nil
}

// PutSite adds or updates a location.
func (b *Book) PutSite(owner string, s Site) (*Site, error) {
	if strings.TrimSpace(s.ID) == "" {
		return nil, fmt.Errorf("book: a site needs an id you will recognise later")
	}
	if strings.TrimSpace(s.Where) == "" {
		return nil, fmt.Errorf("book: a site needs an address")
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.sites[owner] == nil {
		b.sites[owner] = map[string]*Site{}
	}
	c := s
	b.sites[owner][s.ID] = &c
	out := c
	return &out, nil
}

// Site returns one.
func (b *Book) Site(owner, id string) (*Site, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	s, ok := b.sites[owner][id]
	if !ok {
		return nil, false
	}
	c := *s
	return &c, true
}

// Sites lists a buyer's locations, live ones first.
func (b *Book) Sites(owner string) []Site {
	b.mu.Lock()
	defer b.mu.Unlock()
	var out []Site
	for _, s := range b.sites[owner] {
		out = append(out, *s)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Retired != out[j].Retired {
			return !out[i].Retired
		}
		return out[i].ID < out[j].ID
	})
	return out
}
