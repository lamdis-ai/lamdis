package api

import (
	"fmt"
	"sort"
	"sync"
	"time"
)

// A budget that outlives a single job.
//
// Somebody tells their agent "do something with the front yard, under six
// thousand". The agent surveys, reads the photographs, prices the work, and
// discovers halfway through that the drainage needs doing first. None of that
// was expressible: escrow was per job, so the six thousand existed only in the
// agent's own reasoning and the exchange could not answer the one question an
// orchestrator asks constantly — how much of this is left.
//
// A Project is the envelope. Jobs belong to one, commitments draw it down, and
// releases put money back. The agent still owns the planning; the exchange owns
// knowing what the plan has cost so far.

// Project is a budget several jobs share.
type Project struct {
	ID    string `json:"id"`
	Owner string `json:"owner"`
	// Title is what the person asked for, in their words. Carried so a
	// receipt reads like the thing somebody wanted rather than a list of job
	// identifiers.
	Title string `json:"title"`
	// BudgetMinor is the ceiling for everything under this project. Zero means
	// no ceiling, which is allowed and is a decision rather than a default.
	BudgetMinor int64     `json:"budget_minor"`
	Currency    string    `json:"currency"`
	Created     time.Time `json:"created"`
	Closed      bool      `json:"closed,omitempty"`
}

// ProjectState is the envelope as an orchestrator needs to see it.
type ProjectState struct {
	Project
	// CommittedMinor is escrowed against jobs still live.
	CommittedMinor int64 `json:"committed_minor"`
	// SpentMinor is gone: earned by somebody and settled.
	SpentMinor int64 `json:"spent_minor"`
	// ReleasedMinor came back from jobs nobody took or that were cancelled.
	ReleasedMinor int64 `json:"released_minor"`
	// RemainingMinor is what may still be committed. The number an agent asks
	// for before deciding what to do next.
	RemainingMinor int64        `json:"remaining_minor"`
	Jobs           []ProjectJob `json:"jobs"`
}

// ProjectJob is one piece of the plan.
type ProjectJob struct {
	Job            string    `json:"job"`
	Kind           string    `json:"kind"`
	Title          string    `json:"title"`
	CommittedMinor int64     `json:"committed_minor"`
	Status         string    `json:"status"`
	Posted         time.Time `json:"posted"`
}

// Projects stores them.
type Projects struct {
	mu   sync.Mutex
	by   map[string]*Project
	jobs map[string][]string // project -> job ids
	of   map[string]string   // job id -> project
	Now  func() time.Time
}

// NewProjects builds an empty store.
func NewProjects() *Projects {
	return &Projects{
		by: map[string]*Project{}, jobs: map[string][]string{},
		of: map[string]string{},
	}
}

func (p *Projects) now() time.Time {
	if p.Now != nil {
		return p.Now()
	}
	return time.Now()
}

// Open starts a project.
func (p *Projects) Open(id, owner, title string, budgetMinor int64, currency string) (*Project, error) {
	if id == "" || owner == "" {
		return nil, fmt.Errorf("project: needs an id and an owner")
	}
	if budgetMinor < 0 {
		return nil, fmt.Errorf("project: a budget cannot be negative")
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, exists := p.by[id]; exists {
		return nil, fmt.Errorf("project: %s already exists", id)
	}
	pr := &Project{
		ID: id, Owner: owner, Title: title,
		BudgetMinor: budgetMinor, Currency: currency, Created: p.now(),
	}
	p.by[id] = pr
	return pr, nil
}

// Get returns a project if this account owns it.
//
// Ownership is checked here rather than by the caller, for the same reason
// every other buyer-side lookup does it: a stranger reading somebody's project
// learns their whole plan and its budget.
func (p *Projects) Get(id, owner string) (*Project, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	pr, ok := p.by[id]
	if !ok || pr.Owner != owner {
		return nil, false
	}
	c := *pr
	return &c, true
}

// Attach records that a job belongs to a project.
func (p *Projects) Attach(projectID, job string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.by[projectID]; !ok {
		return fmt.Errorf("project: no such project")
	}
	if p.by[projectID].Closed {
		return fmt.Errorf("project: that project is closed")
	}
	for _, j := range p.jobs[projectID] {
		if j == job {
			return nil
		}
	}
	p.jobs[projectID] = append(p.jobs[projectID], job)
	p.of[job] = projectID
	return nil
}

// ProjectOf reports which project a job belongs to, if any.
func (p *Projects) ProjectOf(job string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	id, ok := p.of[job]
	return id, ok
}

// JobsIn lists a project's jobs, oldest first.
func (p *Projects) JobsIn(projectID string) []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := append([]string(nil), p.jobs[projectID]...)
	return out
}

// Close stops further jobs being attached. Existing ones run to completion.
func (p *Projects) Close(id, owner string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	pr, ok := p.by[id]
	if !ok || pr.Owner != owner {
		return fmt.Errorf("project: no such project")
	}
	pr.Closed = true
	return nil
}

// List returns an owner's projects, newest first.
func (p *Projects) List(owner string) []Project {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []Project
	for _, pr := range p.by {
		if pr.Owner == owner {
			out = append(out, *pr)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
	return out
}

// WouldExceed reports whether committing this much would break the envelope.
//
// Checked before the money is held rather than after, so an agent that asks
// for too much is told the number it has left instead of discovering it as a
// failed escrow halfway through a plan.
func (p *Projects) WouldExceed(projectID string, committing, alreadyCommitted, spent int64) (bool, int64) {
	p.mu.Lock()
	pr, ok := p.by[projectID]
	p.mu.Unlock()
	if !ok || pr.BudgetMinor <= 0 {
		return false, 0
	}
	remaining := pr.BudgetMinor - alreadyCommitted - spent
	if remaining < 0 {
		remaining = 0
	}
	return committing > remaining, remaining
}
