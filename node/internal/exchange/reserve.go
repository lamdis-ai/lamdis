package exchange

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
)

// Asking what something costs without paying the maximum to find out.
//
// Posting a job for bids escrowed the whole ceiling. So an agent that wanted
// to know what landscaping costs had to lock six thousand dollars to learn a
// number, and comparing three approaches — gravel, planting, minimal — locked
// eighteen. The bidding system exists precisely because nobody knows the price
// in advance, and it could not be used for the thing it is for.
//
// Nor is the answer for the exchange to guess. It has no idea what a driveway
// costs: it varies by yard, by region, by season, by what is under the old
// surface. Any figure it published would be a number made up with authority,
// and the whole point of sealed bidding is that the people who do the work
// know and we do not.
//
// So a request for quotes holds nothing. It reserves — a claim against the
// buyer's own balance that moves no money and stops them soliciting fifty
// thousand dollars of quotes against six. Money is escrowed when a bid is
// accepted, which is the first moment anybody has agreed on an amount.

// Reservation is a buyer's outstanding request for quotes.
type Reservation struct {
	Job          string    `json:"job"`
	Person       string    `json:"person"`
	CeilingMinor int64     `json:"ceiling_minor"`
	Currency     string    `json:"currency"`
	Expires      time.Time `json:"expires"`
}

// Reservations tracks what a buyer has out for quotes.
type Reservations struct {
	mu  sync.Mutex
	by  map[string]*Reservation // job -> reservation
	Now func() time.Time
}

// NewReservations builds an empty store.
func NewReservations() *Reservations {
	return &Reservations{by: map[string]*Reservation{}}
}

func (rs *Reservations) now() time.Time {
	if rs.Now != nil {
		return rs.Now()
	}
	return time.Now()
}

// Held is what one person currently has reserved against outstanding quote
// requests. Expired requests stop counting on their own.
func (rs *Reservations) Held(person string) int64 {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	now := rs.now()
	var total int64
	for job, r := range rs.by {
		if r.Expires.Before(now) {
			delete(rs.by, job)
			continue
		}
		if r.Person == person {
			total += r.CeilingMinor
		}
	}
	return total
}

// Add records a new outstanding request.
func (rs *Reservations) Add(job, person string, ceilingMinor int64, currency string, expires time.Time) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	rs.by[job] = &Reservation{
		Job: job, Person: person, CeilingMinor: ceilingMinor,
		Currency: currency, Expires: expires,
	}
}

// Release drops a request, because it was awarded, cancelled or ran out.
func (rs *Reservations) Release(job string) {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	delete(rs.by, job)
}

// Outstanding lists a person's live requests, for telling them why their
// available balance is lower than their balance.
func (rs *Reservations) Outstanding(person string) []Reservation {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	now := rs.now()
	var out []Reservation
	for _, r := range rs.by {
		if r.Person == person && r.Expires.After(now) {
			out = append(out, *r)
		}
	}
	return out
}

// canReserve reports whether this buyer could actually pay the ceiling they
// are asking bids against.
//
// Workers spend real effort pricing a job. Letting somebody solicit quotes
// they could never honour wastes that effort and teaches operators to ignore
// open jobs — which costs far more than the money never moved.
func (s *Server) canReserve(ctx context.Context, person string, ceilingMinor int64, currency string) error {
	if s.Ledger == nil {
		return nil
	}
	balance, err := s.Ledger.Balance(ctx, ledger.BalanceOf(person), currency)
	if err != nil {
		return fmt.Errorf("could not read your balance")
	}
	escrowed, err := s.Ledger.Balance(ctx, ledger.EscrowOf(person), currency)
	if err != nil {
		escrowed = 0
	}
	reserved := s.Reservations.Held(person)
	available := balance - escrowed - reserved
	if ceilingMinor > available {
		return fmt.Errorf(
			"asking for bids up to %d needs %d available; you have %d, with %d "+
				"already escrowed and %d reserved against other open requests",
			ceilingMinor, ceilingMinor, available, escrowed, reserved)
	}
	return nil
}
