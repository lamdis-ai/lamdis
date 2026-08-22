// Package payment is the seam between the exchange and whatever actually
// moves money. Nothing above this package knows what a payment rail is, and
// nothing in this package knows what an outcome is.
//
// The whole design turns on one idea: the idempotency key is a pure function
// of signed content. Every retry — after a crash, on another node, days later
// — derives the same key, so the rail deduplicates for us and a lost response
// is never a lost payment.
package payment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Key is a rail-facing idempotency key.
type Key string

// DeriveKey builds the key for an operation from the hash of the signed entry
// that instructed it. Pure, so it is reproducible everywhere.
func DeriveKey(op, entryHash string) Key {
	sum := sha256.Sum256([]byte(op + ":" + entryHash))
	return Key("lamdis-" + hex.EncodeToString(sum[:])[:32])
}

// Operation states. Unknown is first-class and is not an error: pretending a
// network timeout resolved one way or the other is how payment systems lose
// money.
const (
	StatePending   = "pending"
	StateSucceeded = "succeeded"
	StateFailed    = "failed"
	StateUnknown   = "unknown"
)

// Request is one operation against the rail.
type Request struct {
	Key         Key
	Outcome     string
	Instruction string
	AmountMinor int64
	Currency    string
	// Destination is the payee for a capture; empty for holds and releases.
	Destination string
	// Source is the funding instrument for a hold — on a card rail, the
	// payment method the buyer's own client created. The exchange never sees
	// card details, only this reference.
	Source string
	// HoldRef is the rail's identifier for the authorization this operation
	// acts on, as returned by Hold. Capture, Release and Refund all need it,
	// and it is carried explicitly rather than derived: each of those is
	// instructed by a different signed entry, so their idempotency keys
	// differ from the hold's by construction.
	HoldRef string
	// FeeMinor is the exchange's cut, retained out of AmountMinor rather than
	// added to it. A marketplace capture is two movements on most rails —
	// take the gross, forward the net — and an adapter that cannot see the
	// split has to guess at one of them.
	FeeMinor int64
}

// Result is what the rail said, plus what we observed.
type Result struct {
	Ref        string          `json:"ref"`
	State      string          `json:"state"`
	Raw        json.RawMessage `json:"raw,omitempty"`
	ObservedAt time.Time       `json:"observed_at"`
}

// Adapter is a payment rail. Hold reserves funds; Capture takes some or all of
// a hold; Release returns an uncaptured remainder; Refund reverses a capture.
//
// Partial capture is the contingent-payment primitive: escrow always holds
// MaxPayout(terms), and settlement captures whatever the terms evaluated to
// and releases the rest. Without it, "$0 if savings < $50, else 20%" cannot be
// pre-funded.
type Adapter interface {
	Rail() string
	Hold(ctx context.Context, r Request) (Result, error)
	Capture(ctx context.Context, r Request) (Result, error)
	Release(ctx context.Context, r Request) (Result, error)
	Refund(ctx context.Context, r Request) (Result, error)
	// Status answers "what happened to this key?" after a lost response. It
	// takes a Key rather than a Ref because after a timeout a key is all we
	// have — a rail with no lookup-by-key must persist the mapping itself.
	Status(ctx context.Context, key Key) (Result, error)
}

// Every rail must satisfy the same contract, checked at compile time so a
// method added to Adapter cannot be quietly missing from one of them.
var (
	_ Adapter = (*Mock)(nil)
	_ Adapter = (*Stripe)(nil)
	_ Adapter = (*Balance)(nil)
)

// ErrUnknown is returned when the rail's answer was lost in transit. The
// caller must reconcile rather than assume.
var ErrUnknown = fmt.Errorf("payment: rail outcome unknown")
