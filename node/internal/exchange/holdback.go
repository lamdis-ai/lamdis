package exchange

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Money that has been earned but is not yet safe to send.
//
// Settlement credited a worker's payable balance and the sweeper sent anything
// over the threshold within the hour. The buyer was never asked, never shown
// the photograph, and had no way to stop it — while a comment on the withdraw
// route claimed payouts already waited for "the dispute window on the work
// behind it" to close. That window existed in a different code path and this
// one had never heard of it.
//
// A refund cannot claw back money already gone. So the window has to bite
// before the transfer, not after, which is what this file does.

// Holdback is one settled amount waiting out its window.
type Holdback struct {
	Job         string    `json:"job"`
	Person      string    `json:"person"`
	AmountMinor int64     `json:"amount_minor"`
	Currency    string    `json:"currency"`
	SettledAt   time.Time `json:"settled_at"`
	// ReleaseAt is when this may be swept. Moved out by a buyer's hold and
	// brought forward when a buyer says they are happy.
	ReleaseAt time.Time `json:"release_at"`
	// Held is a buyer objecting. Nothing releases while it is true, however
	// long ago the work was done.
	Held   bool   `json:"held,omitempty"`
	Reason string `json:"reason,omitempty"`
	// Paid marks it swept, so it is not counted twice.
	Paid bool `json:"paid,omitempty"`
}

// Releasable reports whether this amount may be sent now.
func (h Holdback) Releasable(now time.Time) bool {
	return !h.Paid && !h.Held && !now.Before(h.ReleaseAt)
}

// Holdbacks stores them, and persists so a deploy does not release everything
// early or strand it forever.
type Holdbacks struct {
	mu   sync.Mutex
	all  []*Holdback
	path string
}

// NewHoldbacks loads what was outstanding.
func NewHoldbacks(dir string) *Holdbacks {
	h := &Holdbacks{}
	if dir == "" {
		return h
	}
	h.path = filepath.Join(dir, "holdbacks.json")
	if b, err := os.ReadFile(h.path); err == nil {
		json.Unmarshal(b, &h.all)
	}
	return h
}

// Add records a settled amount and when it may leave.
func (h *Holdbacks) Add(job, person string, amountMinor int64, currency string,
	settledAt time.Time, window time.Duration) {
	if amountMinor <= 0 {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.all = append(h.all, &Holdback{
		Job: job, Person: person, AmountMinor: amountMinor, Currency: currency,
		SettledAt: settledAt, ReleaseAt: settledAt.Add(window),
	})
	h.saveLocked()
}

// Available is how much of a person's balance is clear to send.
//
// Deliberately not the ledger balance: the ledger says what is owed, and this
// says what is safe. Sweeping on the former is what let money reach a bank
// before the buyer had seen a photograph.
func (h *Holdbacks) Available(person string, now time.Time) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	var total int64
	for _, e := range h.all {
		if e.Person == person && e.Releasable(now) {
			total += e.AmountMinor
		}
	}
	return total
}

// Pending is what is still waiting, and why — for telling somebody when their
// money arrives instead of leaving them to guess.
func (h *Holdbacks) Pending(person string, now time.Time) []Holdback {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []Holdback
	for _, e := range h.all {
		if e.Person == person && !e.Paid && !e.Releasable(now) {
			out = append(out, *e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ReleaseAt.Before(out[j].ReleaseAt) })
	return out
}

// MarkPaid records that everything currently releasable for this person has
// been sent.
func (h *Holdbacks) MarkPaid(person string, now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, e := range h.all {
		if e.Person == person && e.Releasable(now) {
			e.Paid = true
		}
	}
	h.pruneLocked(now)
	h.saveLocked()
}

// Hold freezes everything settled on a job. Called when a buyer objects.
func (h *Holdbacks) Hold(job, reason string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, e := range h.all {
		if e.Job == job && !e.Paid {
			e.Held = true
			e.Reason = reason
			n++
		}
	}
	h.saveLocked()
	return n
}

// Release lets a job's earnings go now, because the buyer said they are happy.
//
// The window exists for the buyer's benefit, so a buyer who does not need it
// should not have to wait it out — and the worker gets paid sooner for having
// done the job well.
func (h *Holdbacks) Release(job string, now time.Time) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for _, e := range h.all {
		if e.Job == job && !e.Paid {
			e.Held = false
			e.Reason = ""
			e.ReleaseAt = now
			n++
		}
	}
	h.saveLocked()
	return n
}

// ForJob reports what is outstanding on one job, for the buyer's view.
func (h *Holdbacks) ForJob(job string) []Holdback {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []Holdback
	for _, e := range h.all {
		if e.Job == job {
			out = append(out, *e)
		}
	}
	return out
}

// pruneLocked drops paid entries once they are old enough that nobody is
// asking about them, so the file does not grow without bound.
func (h *Holdbacks) pruneLocked(now time.Time) {
	cutoff := now.Add(-30 * 24 * time.Hour)
	out := h.all[:0]
	for _, e := range h.all {
		if e.Paid && e.SettledAt.Before(cutoff) {
			continue
		}
		out = append(out, e)
	}
	h.all = out
}

func (h *Holdbacks) saveLocked() {
	if h.path == "" {
		return
	}
	b, err := json.MarshalIndent(h.all, "", "  ")
	if err != nil {
		return
	}
	tmp := h.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, h.path)
	}
}
