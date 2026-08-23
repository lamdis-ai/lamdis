package exchange

import (
	"testing"
	"time"
)

// The attack nobody talks about, and the one that takes no skill.
//
// A worker does a thousand dollars of work. It passes every check the exchange
// runs. The buyer types a sentence into the hold route and the money stops —
// and before this, stopped forever, because nothing anywhere ever cleared a
// hold except the buyer choosing to.
func TestAnObjectionCannotFreezeEarningsForever(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks(t.TempDir())
	h.Add("do-big", "calder", 100000, "USD", now, 24*time.Hour)

	until := now.Add(DisputeWindow)
	if n := h.Hold("do-big", "the lawn is patchy", until); n != 1 {
		t.Fatalf("held %d entries, want 1", n)
	}
	// Frozen while it is live, which is correct.
	if got := h.Available("calder", now.Add(48*time.Hour)); got != 0 {
		t.Fatalf("a live objection did not hold the money: %d", got)
	}

	// The buyer says nothing more. The day after the deadline, the money is
	// the worker's — an objection nobody carried through is not a finding.
	freed := h.ExpireHolds(until.Add(time.Minute))
	if len(freed) != 1 || freed[0] != "do-big" {
		t.Fatalf("the objection did not lapse: %v", freed)
	}
	if got := h.Available("calder", until.Add(time.Hour)); got != 100000 {
		t.Errorf("after lapsing, %d is available, want the full 100000", got)
	}
}

// An objection has to be about the thing that was agreed.
func TestAnObjectionMustNameAGround(t *testing.T) {
	for _, g := range []string{
		GroundNotDone, GroundNotHere, GroundFabricated, GroundDamage, GroundUnsafe,
	} {
		if !ValidGround(g) {
			t.Errorf("%q should be a ground", g)
		}
		if GroundLabel(g) == g {
			t.Errorf("%q has no plain-language label", g)
		}
	}
	// The ones that are not about the work.
	for _, bad := range []string{
		"", "not good enough", "changed my mind", "too expensive", "vibes",
	} {
		if ValidGround(bad) {
			t.Errorf("%q was accepted as a reason not to pay", bad)
		}
	}
}

// A live objection must not lapse early, or the mechanism protects nobody.
func TestALiveObjectionIsNotReleasedEarly(t *testing.T) {
	now := time.Date(2026, 8, 23, 9, 0, 0, 0, time.UTC)
	h := NewHoldbacks(t.TempDir())
	h.Add("do-1", "calder", 50000, "USD", now, 24*time.Hour)
	until := now.Add(DisputeWindow)
	h.Hold("do-1", "wrong place", until)

	if freed := h.ExpireHolds(until.Add(-time.Hour)); len(freed) != 0 {
		t.Errorf("an objection still inside its window was released: %v", freed)
	}
	// And a buyer who is satisfied can still end it early.
	h.Release("do-1", now)
	if got := h.Available("calder", now.Add(time.Hour)); got != 50000 {
		t.Errorf("a released objection did not free the money: %d", got)
	}
}
