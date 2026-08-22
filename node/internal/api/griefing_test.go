package api

import (
	"strings"
	"testing"
	"time"
)

func griefBoard(t *testing.T) *Board {
	t.Helper()
	b := NewBoard(NewCapabilities())
	b.ClaimTTL = 30 * time.Minute
	b.Cooldown = 20 * time.Minute
	return b
}

func job(t *testing.T, b *Board, id string, slots int) {
	t.Helper()
	if err := b.Post(&Listing{
		Job: id, Kind: KindObserve, Title: "photograph the sign",
		PayMinor: 500, Currency: "USD", Slots: slots,
		Expires: time.Now().Add(24 * time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
}

// The attack: take a job and never do it. One free email address used to kill
// a job for its entire life, with the buyer's money locked the whole time.
func TestAbandonedClaimReturnsToTheBoard(t *testing.T) {
	now := time.Now()
	b := griefBoard(t)
	b.Now = func() time.Time { return now }
	job(t, b, "j1", 1)

	if _, _, err := b.Claim("j1", "griefer"); err != nil {
		t.Fatal(err)
	}
	// While the lease is live, the seat is genuinely taken.
	if _, _, err := b.Claim("j1", "honest"); err == nil {
		t.Fatal("two workers held the only seat at once")
	}
	// The griefer never submits. The lease lapses.
	now = now.Add(31 * time.Minute)
	if _, _, err := b.Claim("j1", "honest"); err != nil {
		t.Fatalf("the job never came back: %v", err)
	}
	l, _ := b.Get("j1")
	if l.Taken != 1 {
		t.Fatalf("seat accounting is wrong after a lapse: taken=%d", l.Taken)
	}
}

// Claim, lapse, immediately reclaim is the cheapest possible loop. The
// cooldown is what stops it being free to run forever.
func TestAbandoningCostsTheWorkerTime(t *testing.T) {
	now := time.Now()
	b := griefBoard(t)
	b.Now = func() time.Time { return now }
	job(t, b, "j1", 1)

	b.Claim("j1", "griefer")
	now = now.Add(31 * time.Minute) // lapse

	if _, _, err := b.Claim("j1", "griefer"); err == nil {
		t.Fatal("a worker abandoned a seat and immediately took it again")
	}
	// Somebody else is unaffected by their cooldown.
	if _, _, err := b.Claim("j1", "honest"); err != nil {
		t.Fatalf("an unrelated worker was caught by the cooldown: %v", err)
	}
	// And it does lift.
	now = now.Add(21 * time.Minute)
	job(t, b, "j2", 1)
	if _, _, err := b.Claim("j2", "griefer"); err != nil {
		t.Fatalf("the cooldown never lifted: %v", err)
	}
}

// A brand new account may hold one job. Holding three is earned by finishing
// them, because a newcomer abandoning three seats costs three buyers a day.
func TestNewWorkersHoldOneJobAtATime(t *testing.T) {
	b := griefBoard(t)
	for _, id := range []string{"j1", "j2", "j3"} {
		job(t, b, id, 1)
	}
	if _, _, err := b.Claim("j1", "newcomer"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("j2", "newcomer"); err == nil {
		t.Fatal("a brand new account held two jobs at once")
	}
	// Finishing one earns the next.
	b.Done("j1", "newcomer")
	if _, _, err := b.Claim("j2", "newcomer"); err != nil {
		t.Fatalf("finishing a job did not free the worker: %v", err)
	}
}

// Repeated abandonment must not be shrugged off once somebody has history.
func TestRepeatAbandonersAreHeldToOne(t *testing.T) {
	now := time.Now()
	b := griefBoard(t)
	b.Now = func() time.Time { return now }

	// A worker with a good record earns more concurrency.
	for i := 0; i < 6; i++ {
		id := string(rune('a' + i))
		job(t, b, id, 1)
		b.Claim(id, "regular")
		b.Done(id, "regular")
	}
	if _, _, allow, _ := b.Standing("regular"); allow < 2 {
		t.Fatalf("a worker with six finished jobs is allowed only %d", allow)
	}

	// Then they start dropping work.
	for i := 0; i < 3; i++ {
		id := "x" + string(rune('a'+i))
		job(t, b, id, 1)
		b.Claim(id, "regular")
		now = now.Add(31 * time.Minute)
		b.ExpireLapsedClaims()
		now = now.Add(21 * time.Minute) // wait out the cooldown each time
	}
	if _, ab, allow, _ := b.Standing("regular"); allow != 1 {
		t.Fatalf("after %d abandonments the allowance is still %d", ab, allow)
	}
}

// The sweeper has to actually free seats, since nothing else looks at a claim
// once it is made.
func TestSweepReportsWhatItFreed(t *testing.T) {
	now := time.Now()
	b := griefBoard(t)
	b.Now = func() time.Time { return now }
	for _, id := range []string{"j1", "j2"} {
		job(t, b, id, 1)
	}
	b.Claim("j1", "a")
	b.Claim("j2", "c")
	if n := b.ExpireLapsedClaims(); n != 0 {
		t.Fatalf("swept %d live claims", n)
	}
	now = now.Add(31 * time.Minute)
	if n := b.ExpireLapsedClaims(); n != 2 {
		t.Fatalf("swept %d lapsed claims, want 2", n)
	}
	// Both jobs are open again.
	if len(b.Listings()) != 2 {
		t.Fatalf("%d jobs came back to the board", len(b.Listings()))
	}
}

// A claim that cannot be resumed is a trap: it eats the worker's only slot and
// the work is unreachable, because the capability lives in a URL fragment that
// is gone the moment the tab closes.
func TestHeldWorkCanBeResumed(t *testing.T) {
	b := griefBoard(t)
	job(t, b, "j1", 1)
	if _, _, err := b.Claim("j1", "worker"); err != nil {
		t.Fatal(err)
	}
	held := b.HeldBy("worker")
	if len(held) != 1 {
		t.Fatalf("a worker holding a job sees %d holdings", len(held))
	}
	h := held[0]
	if h.Job != "j1" || h.Title == "" {
		t.Fatalf("holding is missing detail: %+v", h)
	}
	// The resume link has to carry the capability, or it goes nowhere useful.
	if !strings.Contains(h.Resume, "/w/j1#") {
		t.Fatalf("resume link %q cannot reopen the work", h.Resume)
	}
	if h.Expires.IsZero() {
		t.Fatal("the worker cannot see how long they have")
	}
	// Somebody else sees none of it.
	if len(b.HeldBy("stranger")) != 0 {
		t.Fatal("a stranger can see somebody else's held work and its capability")
	}
}

// Handing work back deliberately must cost nothing, or the honest move is the
// expensive one and people just let seats rot.
func TestGivingWorkBackIsFree(t *testing.T) {
	b := griefBoard(t)
	job(t, b, "j1", 1)
	b.Claim("j1", "worker")

	if err := b.GiveBack("j1", "worker"); err != nil {
		t.Fatal(err)
	}
	// Straight back on the board, no waiting for the lease to lapse.
	if l, _ := b.Get("j1"); l.Taken != 0 {
		t.Fatalf("the seat was not returned: taken=%d", l.Taken)
	}
	// No cooldown, no abandonment recorded, and they can work immediately.
	if _, ab, _, cool := b.Standing("worker"); ab != 0 || !cool.IsZero() {
		t.Fatalf("giving work back was punished: abandoned=%d cooldown=%v", ab, cool)
	}
	if _, _, err := b.Claim("j1", "worker"); err != nil {
		t.Fatalf("a worker who gave work back could not take any: %v", err)
	}
	// And you cannot give back what you do not hold.
	if err := b.GiveBack("j1", "stranger"); err == nil {
		t.Fatal("a stranger released somebody else's seat")
	}
}

// A preference the dispatcher ignores is worse than no preference: the
// operator believes they are protected and finds work in their queue anyway.
func TestCapacityActuallyGatesDispatch(t *testing.T) {
	b := griefBoard(t)
	b.Capacities = NewCapacities()
	job(t, b, "j1", 1)
	job(t, b, "j2", 1)

	// Paused means paused.
	b.Capacities.Set("worker", Capacity{MaxConcurrent: 3, RangeMiles: 10, Accepting: false})
	if _, _, err := b.Claim("j1", "worker"); err == nil {
		t.Fatal("a paused operator was given work")
	}

	// Their own concurrency limit is honoured below the earned ceiling.
	b.Capacities.Set("worker", Capacity{MaxConcurrent: 1, RangeMiles: 10, Accepting: true})
	if _, _, err := b.Claim("j1", "worker"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("j2", "worker"); err == nil {
		t.Fatal("an operator exceeded the limit they set themselves")
	}

	// And a kind they do not take never reaches them.
	b.Capacities.Set("other", Capacity{
		MaxConcurrent: 3, RangeMiles: 10, Accepting: true, Kinds: []string{KindDo},
	})
	if _, _, err := b.Claim("j2", "other"); err == nil {
		t.Fatal("an observe job reached an operator who only takes do work")
	}
}

// Auto-accept with nowhere to send the offer is a setting that does nothing.
func TestAutoAcceptNeedsAnEndpoint(t *testing.T) {
	cs := NewCapacities()
	got := cs.Set("w", Capacity{MaxConcurrent: 2, AutoAccept: true})
	if got.AutoAccept {
		t.Fatal("auto-accept was enabled with no webhook to send offers to")
	}
	got = cs.Set("w", Capacity{MaxConcurrent: 2, AutoAccept: true, Webhook: "http://insecure.example"})
	if got.AutoAccept || got.Webhook != "" {
		t.Fatal("dispatch offers would be sent over plain HTTP")
	}
	got = cs.Set("w", Capacity{MaxConcurrent: 2, AutoAccept: true, Webhook: "https://ok.example/hook"})
	if !got.AutoAccept {
		t.Fatal("auto-accept was refused with a valid endpoint")
	}
}
