package api

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// Who is supplying the work, when that is a business rather than a person.
//
// Every mechanism that bounds abuse here was written for an individual: the
// allowance you earn one job at a time, the standing that accrues to a login,
// the payout account that belongs to a human. A contractor with twelve vans
// trips all of them at once — capped at three jobs however many crews they
// have, with a track record that cannot be held by the company, and revenue
// landing in whichever employee happened to click.
//
// That is backwards. A licensed, insured, vetted business is the supply that
// makes "replace the condenser fan motor" a thing an agent can buy at all, and
// it was the supply this exchange treated worst.
//
// A Supplier is the account a company operates under. An individual working
// alone does not need one; nothing here is required to take work.

// SupplierKind distinguishes a person from a business at the payment rail,
// because the rail asks for different documents for each.
type SupplierKind string

const (
	KindIndividual SupplierKind = "individual"
	KindCompany    SupplierKind = "company"
)

// Supplier is a business that provides work through the exchange.
type Supplier struct {
	// ID is the account that owns this supplier — the person who created it.
	ID   string       `json:"id"`
	Kind SupplierKind `json:"kind"`
	// LegalName is the registered name. Passed to the payment rail, and shown
	// to buyers so they know whose van is arriving.
	LegalName string `json:"legal_name,omitempty"`
	// Trading is what they are actually called, when that differs.
	Trading string `json:"trading_name,omitempty"`

	// Members are the people who may take work on this supplier's behalf.
	//
	// Their claims count against the supplier rather than against them
	// individually: twelve crews working for one company is twelve jobs at
	// once, not twelve accounts each starting from one.
	Members []string `json:"members,omitempty"`

	// Licences are the credentials claimed, with enough detail that somebody
	// could check them. Claimed is not verified — see Verified.
	Licences []Licence `json:"licences,omitempty"`

	// Insurance is the cover they carry. The one thing a real contractor has
	// that a stranger with a ladder does not, and there was nowhere to say it.
	Insurance *Insurance `json:"insurance,omitempty"`

	// Vetted records that a human at the exchange checked the licences and
	// the cover. It is what lifts the concurrency ceiling, and it is
	// deliberately not something an account can set for itself.
	Vetted   bool      `json:"vetted"`
	VettedAt time.Time `json:"vetted_at,omitempty"`
	VettedBy string    `json:"vetted_by,omitempty"`
	// VettedNote is why, in the reviewer's words, so a later reviewer can
	// disagree with a reason rather than with a flag.
	VettedNote string `json:"vetted_note,omitempty"`

	Created time.Time `json:"created"`
}

// Licence is a claimed credential.
//
// The exchange stores the number so it can be checked against a state
// register; it never stores a tax identifier, which belongs to the payment
// rail and to nobody here.
type Licence struct {
	Skill  Skill  `json:"skill"`
	Number string `json:"number"`
	// State is the issuing jurisdiction. A licence is a licence somewhere.
	State   string    `json:"state"`
	Expires time.Time `json:"expires,omitempty"`
	// Verified is set by a human who looked it up on the issuing register.
	Verified   bool      `json:"verified"`
	VerifiedAt time.Time `json:"verified_at,omitempty"`
}

// Valid reports whether a licence is worth relying on right now.
func (l Licence) Valid(now time.Time) bool {
	if !l.Verified {
		return false
	}
	return l.Expires.IsZero() || l.Expires.After(now)
}

// Expiring reports a licence that is about to lapse, so somebody can renew it
// before work stops reaching them.
func (l Licence) Expiring(now time.Time) bool {
	if l.Expires.IsZero() {
		return false
	}
	d := l.Expires.Sub(now)
	return d > 0 && d < 30*24*time.Hour
}

// Insurance is the cover a supplier carries.
type Insurance struct {
	Carrier       string    `json:"carrier"`
	PolicyNumber  string    `json:"policy_number"`
	CoverageMinor int64     `json:"coverage_minor"`
	Currency      string    `json:"currency"`
	Expires       time.Time `json:"expires,omitempty"`
	Verified      bool      `json:"verified"`
}

// Active reports whether the cover is current.
func (i *Insurance) Active(now time.Time) bool {
	if i == nil || !i.Verified {
		return false
	}
	return i.Expires.IsZero() || i.Expires.After(now)
}

// Suppliers stores them.
type Suppliers struct {
	mu sync.Mutex
	by map[string]*Supplier
	// member maps a person to the supplier they act for, so a claim can be
	// attributed to the business without every caller having to look it up.
	member map[string]string
	Now    func() time.Time
}

// NewSuppliers builds an empty store.
func NewSuppliers() *Suppliers {
	return &Suppliers{by: map[string]*Supplier{}, member: map[string]string{}}
}

func (s *Suppliers) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Get returns a supplier by its owning account.
func (s *Suppliers) Get(id string) (*Supplier, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sup, ok := s.by[id]
	if !ok {
		return nil, false
	}
	c := *sup
	return &c, true
}

// SupplierFor returns the supplier a person acts for, whether they own it or
// are a member of it.
func (s *Suppliers) SupplierFor(person string) (*Supplier, bool) {
	s.mu.Lock()
	id, ok := s.member[person]
	if !ok {
		id = person
	}
	sup, exists := s.by[id]
	s.mu.Unlock()
	if !exists {
		return nil, false
	}
	c := *sup
	return &c, true
}

// AccountFor returns the account work should be attributed to.
//
// For somebody working alone that is themselves. For an employee of a supplier
// it is the supplier: their completions build the company's record, and the
// company's ceiling governs how much its crews hold at once.
func (s *Suppliers) AccountFor(person string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.member[person]; ok {
		return id
	}
	return person
}

// Upsert creates or updates a supplier's own details.
//
// Vetting is never taken from the caller: a business that could mark itself
// verified would make the word worthless, and it is the word the raised
// ceiling rests on.
func (s *Suppliers) Upsert(id string, in Supplier) (*Supplier, error) {
	if in.Kind != KindIndividual && in.Kind != KindCompany {
		return nil, fmt.Errorf("supplier: kind must be individual or company")
	}
	if in.Kind == KindCompany && strings.TrimSpace(in.LegalName) == "" {
		return nil, fmt.Errorf("supplier: a company needs its registered name")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	sup, existing := s.by[id]
	if !existing {
		sup = &Supplier{ID: id, Created: s.now()}
		s.by[id] = sup
	}
	sup.Kind = in.Kind
	sup.LegalName = strings.TrimSpace(in.LegalName)
	sup.Trading = strings.TrimSpace(in.Trading)

	// Licences and cover are claims until somebody checks them, so an edit
	// resets verification on anything that changed. Otherwise a supplier
	// vetted on one licence number could swap in another.
	sup.Licences = mergeLicences(sup.Licences, in.Licences)
	if in.Insurance != nil {
		sup.Insurance = mergeInsurance(sup.Insurance, in.Insurance)
	}
	c := *sup
	return &c, nil
}

// mergeLicences keeps verification only where the claim is unchanged.
func mergeLicences(old, in []Licence) []Licence {
	prev := map[string]Licence{}
	for _, l := range old {
		prev[l.Skill+"|"+l.Number+"|"+l.State] = l
	}
	out := make([]Licence, 0, len(in))
	for _, l := range in {
		l.Skill = strings.ToLower(strings.TrimSpace(l.Skill))
		l.Number = strings.TrimSpace(l.Number)
		l.State = strings.ToUpper(strings.TrimSpace(l.State))
		if l.Skill == "" || l.Number == "" || l.State == "" {
			continue
		}
		if was, ok := prev[l.Skill+"|"+l.Number+"|"+l.State]; ok {
			l.Verified = was.Verified
			l.VerifiedAt = was.VerifiedAt
		} else {
			l.Verified = false
			l.VerifiedAt = time.Time{}
		}
		out = append(out, l)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Skill < out[j].Skill })
	return out
}

func mergeInsurance(old, in *Insurance) *Insurance {
	c := *in
	c.Carrier = strings.TrimSpace(c.Carrier)
	c.PolicyNumber = strings.TrimSpace(c.PolicyNumber)
	c.Verified = false
	if old != nil && old.Carrier == c.Carrier && old.PolicyNumber == c.PolicyNumber &&
		old.CoverageMinor == c.CoverageMinor && old.Expires.Equal(c.Expires) {
		c.Verified = old.Verified
	}
	return &c
}

// AddMember lets somebody take work on this supplier's behalf.
func (s *Suppliers) AddMember(id, person string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sup, ok := s.by[id]
	if !ok {
		return fmt.Errorf("supplier: no such supplier")
	}
	if person == id {
		return fmt.Errorf("supplier: the owner is already on the account")
	}
	if other, taken := s.member[person]; taken && other != id {
		// One person, one employer. Otherwise a single lapse is ambiguous:
		// whose record does it damage?
		return fmt.Errorf("supplier: that person already works for another supplier")
	}
	for _, m := range sup.Members {
		if m == person {
			return nil
		}
	}
	sup.Members = append(sup.Members, person)
	sort.Strings(sup.Members)
	s.member[person] = id
	return nil
}

// RemoveMember revokes it.
func (s *Suppliers) RemoveMember(id, person string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sup, ok := s.by[id]
	if !ok {
		return fmt.Errorf("supplier: no such supplier")
	}
	out := sup.Members[:0]
	for _, m := range sup.Members {
		if m != person {
			out = append(out, m)
		}
	}
	sup.Members = out
	delete(s.member, person)
	return nil
}

// Vet records that a human checked this supplier. Not reachable from any
// account-authenticated route.
func (s *Suppliers) Vet(id, by, note string, vetted bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sup, ok := s.by[id]
	if !ok {
		return fmt.Errorf("supplier: no such supplier")
	}
	sup.Vetted = vetted
	sup.VettedBy = by
	sup.VettedNote = note
	if vetted {
		sup.VettedAt = s.now()
	} else {
		sup.VettedAt = time.Time{}
	}
	return nil
}

// VerifyLicence records that somebody looked a licence up on the register.
func (s *Suppliers) VerifyLicence(id, skill, number string, ok bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	sup, exists := s.by[id]
	if !exists {
		return fmt.Errorf("supplier: no such supplier")
	}
	for i := range sup.Licences {
		if sup.Licences[i].Skill == skill && sup.Licences[i].Number == number {
			sup.Licences[i].Verified = ok
			if ok {
				sup.Licences[i].VerifiedAt = s.now()
			}
			return nil
		}
	}
	return fmt.Errorf("supplier: no such licence on this supplier")
}

// HoldsLicence reports whether a supplier can lawfully take work needing a
// licensed skill.
func (s *Suppliers) HoldsLicence(person string, skill Skill, now time.Time) bool {
	sup, ok := s.SupplierFor(person)
	if !ok {
		return false
	}
	for _, l := range sup.Licences {
		if l.Skill == skill && l.Valid(now) {
			return true
		}
	}
	return false
}

// Public is what a buyer may see about who is doing their work.
//
// Names and verified credentials, because those are what the buyer is choosing
// on. Not membership lists, not policy numbers.
func (sup *Supplier) Public(now time.Time) map[string]any {
	out := map[string]any{
		"kind":   sup.Kind,
		"vetted": sup.Vetted,
	}
	if name := sup.Trading; name != "" {
		out["name"] = name
	} else if sup.LegalName != "" {
		out["name"] = sup.LegalName
	}
	var licences []map[string]any
	for _, l := range sup.Licences {
		if !l.Valid(now) {
			continue
		}
		licences = append(licences, map[string]any{
			"skill": SkillLabel(l.Skill), "state": l.State,
		})
	}
	if licences != nil {
		out["licences"] = licences
	}
	if sup.Insurance.Active(now) {
		out["insured_to_minor"] = sup.Insurance.CoverageMinor
		out["insurance_currency"] = sup.Insurance.Currency
	}
	return out
}
