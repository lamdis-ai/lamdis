package payment

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// Faults injects rail misbehaviour so the reconciler can be tested without a
// network. Every real payment integration eventually meets all of these; the
// mock is the only place we can meet them deterministically.
type Faults struct {
	FailHold       bool // the hold is declined
	TimeoutCapture bool // the capture happens but the response is lost
	DoubleCall     bool // the caller retries; the rail must dedupe on the key
	LateSuccess    bool // the first Status says pending, the second says succeeded
}

// Mock is an in-process rail. It is deterministic, keeps a full operation
// history, and enforces the same idempotency contract a real rail would.
type Mock struct {
	mu      sync.Mutex
	Faults  Faults
	ops     map[Key]*Result
	holds   map[string]int64 // outcome -> amount still held
	statusN map[Key]int
	seq     int
	// Now is injectable so demos and tests have a stable clock.
	Now func() time.Time
}

func NewMock() *Mock {
	return &Mock{
		ops:     map[Key]*Result{},
		holds:   map[string]int64{},
		statusN: map[Key]int{},
		Now:     time.Now,
	}
}

func (m *Mock) Rail() string { return "mock" }

func (m *Mock) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

// record applies an operation exactly once per key. A repeated key returns the
// original result untouched, which is the property the whole retry story rests
// on.
func (m *Mock) record(r Request, kind string, apply func() error) (Result, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if prior, ok := m.ops[r.Key]; ok {
		return *prior, nil // idempotent replay
	}
	if r.Key == "" {
		return Result{}, fmt.Errorf("payment: operation has no idempotency key")
	}
	if err := apply(); err != nil {
		res := Result{State: StateFailed, ObservedAt: m.now()}
		m.ops[r.Key] = &res
		return res, err
	}
	m.seq++
	res := Result{
		Ref:        fmt.Sprintf("mock-%s-%d", kind, m.seq),
		State:      StateSucceeded,
		ObservedAt: m.now(),
	}
	m.ops[r.Key] = &res

	// A lost response: the money moved, but the caller does not learn that.
	// Reconcile must discover it via Status rather than re-charging.
	if kind == "capture" && m.Faults.TimeoutCapture {
		return Result{State: StateUnknown, ObservedAt: m.now()}, ErrUnknown
	}
	return res, nil
}

func (m *Mock) Hold(_ context.Context, r Request) (Result, error) {
	return m.record(r, "hold", func() error {
		if m.Faults.FailHold {
			return fmt.Errorf("payment: hold declined")
		}
		m.holds[r.Outcome] += r.AmountMinor
		return nil
	})
}

func (m *Mock) Capture(_ context.Context, r Request) (Result, error) {
	return m.record(r, "capture", func() error {
		if m.holds[r.Outcome] < r.AmountMinor {
			return fmt.Errorf("payment: capture of %d exceeds the %d held for %s",
				r.AmountMinor, m.holds[r.Outcome], r.Outcome)
		}
		m.holds[r.Outcome] -= r.AmountMinor
		return nil
	})
}

func (m *Mock) Release(_ context.Context, r Request) (Result, error) {
	return m.record(r, "release", func() error {
		if m.holds[r.Outcome] < r.AmountMinor {
			return fmt.Errorf("payment: release of %d exceeds the %d held for %s",
				r.AmountMinor, m.holds[r.Outcome], r.Outcome)
		}
		m.holds[r.Outcome] -= r.AmountMinor
		return nil
	})
}

func (m *Mock) Refund(_ context.Context, r Request) (Result, error) {
	return m.record(r, "refund", func() error { return nil })
}

func (m *Mock) Status(_ context.Context, key Key) (Result, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	res, ok := m.ops[key]
	if !ok {
		return Result{State: StateFailed, ObservedAt: m.now()}, nil
	}
	m.statusN[key]++
	if m.Faults.LateSuccess && m.statusN[key] == 1 {
		return Result{State: StatePending, ObservedAt: m.now()}, nil
	}
	return *res, nil
}

// HeldFor reports the amount still held for an outcome, for assertions.
func (m *Mock) HeldFor(outcome string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.holds[outcome]
}

// Operations returns how many distinct operations the rail actually performed,
// which is what proves a retry did not double-charge.
func (m *Mock) Operations() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.ops)
}
