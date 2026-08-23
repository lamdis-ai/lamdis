package exchange

import (
	"testing"
	"time"
)

// Earned money must not leave before the buyer has had a chance to look.
//
// Settlement credited the worker and the sweeper sent anything over the
// threshold within the hour, while the withdraw route told buyers that payouts
// already waited for "the dispute window on the work behind it" to close. That
// window lived in another code path and this one had never heard of it — a
// safeguard that was documented, relied upon, and absent.
func TestEarningsWaitForTheBuyersWindow(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks("")
	h.Add("do-1", "worker", 5000, "USD", now, 24*time.Hour)

	if got := h.Available("worker", now); got != 0 {
		t.Errorf("%d was sweepable the moment it was earned", got)
	}
	if got := h.Available("worker", now.Add(23*time.Hour)); got != 0 {
		t.Errorf("%d was sweepable an hour before the window closed", got)
	}
	if got := h.Available("worker", now.Add(24*time.Hour)); got != 5000 {
		t.Errorf("after the window %d was clear, wanted 5000", got)
	}
}

// A buyer who is happy should not have to wait, and the worker should not
// have to wait for them.
func TestABuyerCanReleaseEarly(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks("")
	h.Add("do-1", "worker", 5000, "USD", now, 24*time.Hour)

	if n := h.Release("do-1", now); n != 1 {
		t.Fatalf("released %d entries", n)
	}
	if got := h.Available("worker", now); got != 5000 {
		t.Errorf("after the buyer accepted the work, %d was clear", got)
	}
}

// A hold stops the money however long ago the work was done.
func TestAHoldOutlastsTheWindow(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks("")
	h.Add("do-1", "worker", 5000, "USD", now, 24*time.Hour)
	h.Hold("do-1", "the gutter is still full at the north end", now.Add(DisputeWindow))

	for _, at := range []time.Time{now, now.Add(48 * time.Hour), now.Add(30 * 24 * time.Hour)} {
		if got := h.Available("worker", at); got != 0 {
			t.Errorf("held money became sweepable (%d) at %s", got, at)
		}
	}
	pending := h.Pending("worker", now.Add(48*time.Hour))
	if len(pending) != 1 || !pending[0].Held {
		t.Fatalf("the worker cannot see that it is held: %+v", pending)
	}
	if pending[0].Reason == "" {
		t.Error("held with no reason, which nobody can resolve")
	}
}

// Paying must not pay the same money twice.
func TestSweptMoneyIsNotSweptAgain(t *testing.T) {
	now := time.Date(2026, 8, 21, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks("")
	h.Add("do-1", "worker", 5000, "USD", now, time.Hour)
	h.Add("do-2", "worker", 3000, "USD", now, time.Hour)

	after := now.Add(2 * time.Hour)
	if got := h.Available("worker", after); got != 8000 {
		t.Fatalf("clear balance %d, wanted 8000", got)
	}
	h.MarkPaid("worker", after)
	if got := h.Available("worker", after); got != 0 {
		t.Fatalf("%d was still sweepable after being paid", got)
	}

	// Work settled after the payout is its own window.
	h.Add("do-3", "worker", 2000, "USD", after, time.Hour)
	if got := h.Available("worker", after); got != 0 {
		t.Errorf("newly settled money was immediately sweepable")
	}
	if got := h.Available("worker", after.Add(2*time.Hour)); got != 2000 {
		t.Errorf("later window gave %d, wanted 2000", got)
	}
}
