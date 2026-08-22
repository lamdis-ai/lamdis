// Package budget caps what verification may spend, before anything can spend
// it.
//
// This lands before the model client on purpose. The failure mode it exists to
// prevent is not a large bill from a busy day; it is a loop that retries
// forever at three in the morning. So the guard reserves against an estimate
// *before* each call and reconciles after, rather than adding up receipts
// afterwards — the difference between a budget and a postmortem.
package budget

import (
	"fmt"
	"sync"
	"time"
)

// Limits are the ceilings, checked in order. Defaults are deliberately
// paranoid; a real deployment raises them knowingly.
type Limits struct {
	PerCallCents int // one model call
	PerJobCents  int // one outcome's total verification spend
	PerDayCents  int // everything, across all outcomes
	CallsPerMin  int // rate ceiling
	HardKillMult int // refuse to construct a client past this multiple of PerDayCents
}

func DefaultLimits() Limits {
	return Limits{
		PerCallCents: 8,
		PerJobCents:  40,
		PerDayCents:  500, // $5
		CallsPerMin:  6,
		HardKillMult: 3,
	}
}

// Guard enforces the limits. It is safe for concurrent use.
type Guard struct {
	mu     sync.Mutex
	limits Limits

	daySpent  int
	dayStart  time.Time
	jobSpent  map[string]int
	callTimes []time.Time
	open      bool // circuit is open: model verification is suspended

	Now func() time.Time
}

func New(l Limits) *Guard {
	g := &Guard{limits: l, jobSpent: map[string]int{}, Now: time.Now}
	g.dayStart = g.now()
	return g
}

func (g *Guard) now() time.Time {
	if g.Now != nil {
		return g.Now()
	}
	return time.Now()
}

// Lease is a reservation against the budget. Commit it with the real cost once
// the call returns, or Release it if the call never happened.
type Lease struct {
	Job      string
	Estimate int
	g        *Guard
	done     bool
}

// ErrBudget means verification must degrade rather than spend. Callers return
// the partial aggregate at whatever lower tier it supports; they must never
// silently retry.
type ErrBudget struct{ Reason string }

func (e ErrBudget) Error() string { return "budget: " + e.Reason }

// Reserve claims headroom for one call. The estimate is what the caller
// believes the call will cost; for a vision call that is computable up front
// from the image dimensions, which is exactly why reservation is possible.
func (g *Guard) Reserve(job string, estimateCents int) (*Lease, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if now := g.now(); now.Sub(g.dayStart) >= 24*time.Hour {
		g.daySpent, g.dayStart, g.open = 0, now, false
	}
	if g.open {
		return nil, ErrBudget{Reason: "daily ceiling reached; verification is degraded until it resets"}
	}
	if estimateCents > g.limits.PerCallCents {
		return nil, ErrBudget{Reason: fmt.Sprintf(
			"one call estimated at %d¢ exceeds the %d¢ per-call ceiling", estimateCents, g.limits.PerCallCents)}
	}
	if g.jobSpent[job]+estimateCents > g.limits.PerJobCents {
		return nil, ErrBudget{Reason: fmt.Sprintf(
			"outcome %s would exceed its %d¢ verification ceiling", job, g.limits.PerJobCents)}
	}
	if g.daySpent+estimateCents > g.limits.PerDayCents {
		g.open = true
		return nil, ErrBudget{Reason: fmt.Sprintf(
			"daily ceiling of %d¢ reached; opening the circuit", g.limits.PerDayCents)}
	}

	// Rate ceiling over a trailing minute.
	cutoff := g.now().Add(-time.Minute)
	kept := g.callTimes[:0]
	for _, t := range g.callTimes {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	g.callTimes = kept
	if len(g.callTimes) >= g.limits.CallsPerMin {
		return nil, ErrBudget{Reason: fmt.Sprintf("rate ceiling of %d calls/min reached", g.limits.CallsPerMin)}
	}
	g.callTimes = append(g.callTimes, g.now())

	// Reserve pessimistically; Commit reconciles down to the real cost.
	g.daySpent += estimateCents
	g.jobSpent[job] += estimateCents
	return &Lease{Job: job, Estimate: estimateCents, g: g}, nil
}

// Commit reconciles a lease against what the call actually cost.
func (l *Lease) Commit(actualCents int) {
	if l == nil || l.done {
		return
	}
	l.done = true
	g := l.g
	g.mu.Lock()
	defer g.mu.Unlock()
	delta := actualCents - l.Estimate
	g.daySpent += delta
	g.jobSpent[l.Job] += delta
	if g.daySpent < 0 {
		g.daySpent = 0
	}
	if g.daySpent >= g.limits.PerDayCents {
		g.open = true
	}
}

// Release returns a reservation for a call that never happened.
func (l *Lease) Release() {
	if l == nil || l.done {
		return
	}
	l.Commit(0)
}

// Tripped reports whether the circuit is open.
func (g *Guard) Tripped() bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.open
}

// SpentToday is in cents.
func (g *Guard) SpentToday() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.daySpent
}

// MustAllowClient is the belt to the circuit breaker's braces: if spend has
// somehow blown past a multiple of the daily ceiling, refuse to build a model
// client at all rather than trusting the in-process accounting that already
// failed once.
func (g *Guard) MustAllowClient() error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if kill := g.limits.PerDayCents * g.limits.HardKillMult; g.daySpent > kill {
		return ErrBudget{Reason: fmt.Sprintf(
			"spend %d¢ is past the hard kill threshold of %d¢; refusing to construct a model client", g.daySpent, kill)}
	}
	return nil
}
