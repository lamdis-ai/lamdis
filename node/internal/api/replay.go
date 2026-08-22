package api

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// ReplayGuard refuses a signed request that has been presented before.
//
// The signature scheme binds method, path, timestamp and body hash, so a
// captured request cannot be aimed at a different endpoint or payload. What it
// does not do on its own is stop the *same* request being replayed inside the
// clock-skew window. For sync that is harmless — entries are idempotent by id.
// For anything that moves money it is not: one captured settlement instruction
// could be presented twice.
//
// Remembering each signature for twice the skew window closes it. A signature
// is only replayable while its timestamp is still inside the window, so once
// the window has passed the record can be forgotten.
//
// The same mechanism gives idempotency for free: a client that retries a
// request verbatim gets a clean rejection rather than a second execution.
type ReplayGuard struct {
	mu   sync.Mutex
	seen map[string]time.Time
	ttl  time.Duration
	// Now is injectable for tests.
	Now func() time.Time
	// lastSweep bounds how often expired records are cleared.
	lastSweep time.Time
}

func NewReplayGuard(ttl time.Duration) *ReplayGuard {
	if ttl <= 0 {
		ttl = 2 * maxSkew
	}
	return &ReplayGuard{seen: map[string]time.Time{}, ttl: ttl, Now: time.Now}
}

func (g *ReplayGuard) now() time.Time {
	if g.Now != nil {
		return g.Now()
	}
	return time.Now()
}

// Check records a presentation and reports whether it is the first one.
// Returns false if this exact signature has been seen inside the window.
func (g *ReplayGuard) Check(signature string) bool {
	if signature == "" {
		return false
	}
	sum := sha256.Sum256([]byte(signature))
	key := hex.EncodeToString(sum[:])

	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()

	// Sweep at most once a window; the map only ever holds one window's worth
	// of traffic, so this stays small without a background goroutine.
	if now.Sub(g.lastSweep) > g.ttl {
		for k, t := range g.seen {
			if now.Sub(t) > g.ttl {
				delete(g.seen, k)
			}
		}
		g.lastSweep = now
	}

	if first, ok := g.seen[key]; ok && now.Sub(first) <= g.ttl {
		return false
	}
	g.seen[key] = now
	return true
}

// Size reports how many signatures are currently remembered.
func (g *ReplayGuard) Size() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return len(g.seen)
}
