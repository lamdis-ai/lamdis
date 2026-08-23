package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// An operator who publishes an endpoint must actually receive work.
//
// This test exists because for a while the settings were stored, validated,
// and read by nothing at all: a fleet could configure dispatch, switch on
// auto-accept, and wait forever. Nothing failed, which is what made it hard to
// see. The assertion is deliberately blunt — an offer arrives, or the feature
// does not exist.
func TestDispatchReachesTheOperator(t *testing.T) {
	var (
		mu   sync.Mutex
		got  Offer
		sig  string
		when string
		hits int
	)
	endpoint := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		hits++
		sig = r.Header.Get("X-Lamdis-Signature")
		when = r.Header.Get("X-Lamdis-Timestamp")
		json.Unmarshal(body, &got)
		mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	}))
	defer endpoint.Close()

	now := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	caps := NewCapacities()
	board := NewBoard(NewCapabilities())
	board.Now = func() time.Time { return now }
	board.Capacities = caps
	board.ClaimTTL = time.Hour

	const worker = "worker-fleet-3"
	caps.Set(worker, Capacity{
		MaxConcurrent: 4, RangeMiles: 25, Accepting: true, AutoAccept: true,
		Kinds: []string{"observe"},
		LatE7: E7(37.7749), LonE7: E7(-122.4194), // San Francisco
		Webhook: endpoint.URL,
	})

	d := &Dispatcher{
		Board: board, Capacities: caps, BaseURL: "https://exchange.example",
		Now: func() time.Time { return now }, AllowPrivateHosts: true,
		Client: endpoint.Client(),
	}
	board.Announce = func(l *Listing) { d.Announce(context.Background(), l) }

	job := &Listing{
		Job: "observe-1", Kind: "observe", Title: "Photograph the loading dock",
		Where: "1400 Industrial Way", PayMinor: 1800, Currency: "usd", Slots: 1,
		LatE7: E7(37.7849), LonE7: E7(-122.4094), // ~0.9 mi away
		Expires: now.Add(6 * time.Hour), Posted: now,
	}
	if err := board.Post(job); err != nil {
		t.Fatalf("post: %v", err)
	}

	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return hits > 0 })

	mu.Lock()
	defer mu.Unlock()
	if got.Job != "observe-1" {
		t.Fatalf("offer was for %q, wanted the job we posted", got.Job)
	}
	if !got.AutoAccepted {
		t.Error("auto-accept was on, so the offer should say the work is theirs")
	}
	if got.DistanceMiles <= 0 || got.DistanceMiles > 2 {
		t.Errorf("distance %v miles is not the ~0.9 the coordinates describe", got.DistanceMiles)
	}
	if got.ClaimURL == "" {
		t.Error("an offer with nowhere to take the work is not actionable")
	}

	// The signature must cover the timestamp too, or a captured offer replays
	// forever.
	mac := hmac.New(sha256.New, []byte(caps.Get(worker).WebhookSecret))
	mac.Write([]byte(when))
	mac.Write([]byte("\n"))
	body, _ := json.Marshal(got)
	mac.Write(body)
	if want := "sha256=" + hex.EncodeToString(mac.Sum(nil)); sig != want {
		t.Errorf("signature %q does not verify against the operator's secret", sig)
	}

	// Auto-accept means claimed, not merely announced.
	held := board.HeldBy(worker)
	if len(held) != 1 || held[0].Job != "observe-1" {
		t.Errorf("auto-accept did not leave the job in the operator's hands: %+v", held)
	}
}

// Work nobody can reach must not be offered.
func TestDispatchRespectsRangeAndSkills(t *testing.T) {
	var hits int
	var mu sync.Mutex
	endpoint := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	}))
	defer endpoint.Close()

	now := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	caps := NewCapacities()
	board := NewBoard(NewCapabilities())
	board.Now = func() time.Time { return now }
	board.Capacities = caps
	board.ClaimTTL = time.Hour
	caps.Set("near-but-unlicensed", Capacity{
		MaxConcurrent: 2, RangeMiles: 30, Accepting: true, Kinds: []string{"do"},
		LatE7: E7(37.7749), LonE7: E7(-122.4194), Webhook: endpoint.URL,
	})
	caps.Set("licensed-but-far", Capacity{
		MaxConcurrent: 2, RangeMiles: 10, Accepting: true, Kinds: []string{"do"},
		Skills: []Skill{"hvac"},
		LatE7:  E7(34.0522), LonE7: E7(-118.2437), // Los Angeles
		Webhook: endpoint.URL,
	})

	d := &Dispatcher{Board: board, Capacities: caps, Now: func() time.Time { return now },
		AllowPrivateHosts: true, Client: endpoint.Client()}

	n := d.Announce(context.Background(), &Listing{
		Job: "do-1", Kind: "do", Title: "Replace the condenser fan motor",
		Skills: []Skill{"hvac"}, PayMinor: 24000, Currency: "usd", Slots: 1,
		LatE7: E7(37.7849), LonE7: E7(-122.4094),
		Expires: now.Add(6 * time.Hour), Posted: now,
	})

	if n != 0 {
		t.Fatalf("offered the job to %d operators; one lacks the license and "+
			"the other is 380 miles away", n)
	}
	mu.Lock()
	defer mu.Unlock()
	if hits != 0 {
		t.Errorf("posted %d offers that nobody could have taken", hits)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("no offer ever arrived at the operator's endpoint")
}

// An auto-accepted offer must carry the capability that claiming it minted.
//
// Auto-accept was true and useless. The exchange claimed the job, set
// AutoAccepted, and threw away the secret Claim returned — so the operator
// held a seat on work it could not open: the brief needs a capability, the
// upload needs a capability, and ClaimURL was already spent. A person would
// have gone looking for support. A fleet has nobody to ask, so it holds the
// seat until the lease lapses and the job dies in its hands.
//
// The assertion is the whole loop, not the field: take the secret out of the
// offer and prove it authorises this job, because a work_url that does not
// resolve to a usable capability would satisfy a shallower test and still
// strand the fleet.
func TestAutoAcceptedOfferCarriesAWorkingCapability(t *testing.T) {
	var (
		mu  sync.Mutex
		got Offer
	)
	endpoint := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		json.Unmarshal(body, &got)
		mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	}))
	defer endpoint.Close()

	now := time.Date(2026, 8, 23, 12, 0, 0, 0, time.UTC)
	caps := NewCapacities()
	capabilities := NewCapabilities()
	board := NewBoard(capabilities)
	board.Now = func() time.Time { return now }
	board.Capacities = caps
	board.ClaimTTL = time.Hour

	const fleet = "fleet-1"
	caps.Set(fleet, Capacity{
		MaxConcurrent: 4, RangeMiles: 25, Accepting: true, AutoAccept: true,
		Kinds: []string{"observe"},
		LatE7: E7(37.7749), LonE7: E7(-122.4194),
		Webhook: endpoint.URL,
	})

	l := &Listing{
		Job: "observe-auto", Kind: "observe", Title: "check the gate",
		Where: "1400 Industrial Way", PayMinor: 1200, Currency: "usd", Slots: 1,
		LatE7: E7(37.7849), LonE7: E7(-122.4094),
		Expires: now.Add(6 * time.Hour), Posted: now,
	}

	d := &Dispatcher{
		Board: board, Capacities: caps, BaseURL: "https://exchange.example",
		Now: func() time.Time { return now }, Client: endpoint.Client(),
		AllowPrivateHosts: true,
	}
	board.Announce = func(l *Listing) { d.Announce(context.Background(), l) }
	if err := board.Post(l); err != nil {
		t.Fatalf("post: %v", err)
	}
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return got.Job != "" })

	mu.Lock()
	off := got
	mu.Unlock()

	if !off.AutoAccepted {
		t.Fatalf("offer was not auto-accepted")
	}
	if off.WorkURL == "" {
		t.Fatalf("auto-accepted offer carries no work_url — the fleet cannot open the job it now holds")
	}
	i := strings.Index(off.WorkURL, "#")
	if i < 0 {
		t.Fatalf("work_url %q has no capability fragment", off.WorkURL)
	}
	secret := off.WorkURL[i+1:]
	c, ok := capabilities.Lookup(secret)
	if !ok {
		t.Fatalf("the secret in work_url is not a live capability")
	}
	if c.Job != l.Job {
		t.Fatalf("capability is for job %q, want %q", c.Job, l.Job)
	}
	if !c.Can(ActionSubmit) {
		t.Fatalf("capability cannot submit evidence, so the fleet still cannot finish the job")
	}
}
