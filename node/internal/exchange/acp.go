package exchange

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
)

// Selling outcomes inside somebody else's conversation.
//
// Everything else here assumes a Lamdis account: somebody signs in, tops up a
// balance, issues an agent key. That is a reasonable thing to ask of a company
// wiring up a pipeline, and an absurd thing to ask of a person who has just
// said "can you get my gutters cleared" to an assistant. The gap between an
// offer and a signup flow is where almost everybody stops.
//
// The Agentic Commerce Protocol closes it: the assistant shows a price, the
// person says yes, their payment token is delegated to us, and the work
// happens. No account, no top-up, no key.
//
// What that makes us is a merchant selling outcomes, which is a different
// posture from an exchange holding a balance, and it is worth being clear
// that the money moves better this way rather than worse:
//
//	Today  the buyer tops up, we hold their balance at Stripe for as long as
//	       they keep one, and jobs draw against it.
//	Here   the card is authorised and not captured. The money stays on the
//	       buyer's card while the work is done, and we take it only when the
//	       outcome is proven. Nothing accepted, nothing captured.
//
// So this path holds less of other people's money than the account path does,
// not more. That is a genuine improvement in the custody posture and not a
// rationalisation of a worse one.
//
// The honest limit: ACP needs a price at the moment the offer is shown, and
// most of what this exchange is good at — a driveway, a scope with four
// stages — has no price until somebody bids. So this sells the shapes we can
// actually put a number on, and refuses the rest rather than guessing. A
// catalogue of two honest things beats a catalogue of everything at a made-up
// price.

// ChargeRail is the part of the payment adapter agentic checkout needs.
//
// Narrow on purpose, like PayoutRail: this path authorises a card and later
// takes or releases that authorisation, and it has no business being handed
// the payout side as well.
type ChargeRail interface {
	Hold(ctx context.Context, r payment.Request) (payment.Result, error)
	Capture(ctx context.Context, r payment.Request) (payment.Result, error)
	Release(ctx context.Context, r payment.Request) (payment.Result, error)
}

// ACPVersion is the protocol version this implements, echoed on every reply.
const ACPVersion = "2025-09-29"

// Offer is one outcome shape we will sell at a stated price.
//
// Deliberately a small, hand-written list rather than anything generated. Each
// entry is a promise that this exchange can actually deliver this thing at
// this price, and somebody has to be willing to make that promise. When the
// supply is not there, the answer is to remove the entry, not to widen it.
type Offer struct {
	ID string `json:"id"`
	// Title is what the buyer sees in the assistant.
	Title string `json:"title"`
	// Predicate is what must become true, written as the job would be posted.
	Predicate string `json:"predicate"`
	// Instructions is what the operator is told to do.
	Instructions string `json:"instructions"`
	// Deliverable is what proves it, and is what the evidence is judged
	// against. Written here rather than by a buyer, which is the one real
	// advantage of a catalogue: these sentences have been thought about.
	Deliverable string `json:"deliverable"`
	// Kind is "observe" or "do".
	Kind string `json:"kind"`
	// PriceMinor is what the buyer pays, all in.
	PriceMinor int64 `json:"price_minor"`
	// PayMinor is what the operator earns. The difference is what covers
	// verification and the failed attempts nobody is billed for.
	PayMinor int64 `json:"pay_minor"`
	// Skills the operator must hold.
	Skills []string `json:"skills,omitempty"`
	// NeedsAddress marks work that happens somewhere specific, which is
	// almost all of it.
	NeedsAddress bool `json:"needs_address"`
}

// Catalogue is what may be bought this way.
//
// Two entries. Both are externally observable, need no access to anybody's
// property, and can be specified completely by an agent without a
// conversation — which is the same test as "can this be sold inside somebody
// else's chat window without a support burden landing on us".
var Catalogue = []Offer{
	{
		ID:           "sign_check",
		Title:        "Check whether a sign is up at an address",
		Predicate:    "the sign is up and legible at the address given",
		Instructions: "Go to the address and photograph the frontage so the sign and the property number are both in shot, with the code in frame.",
		Deliverable:  "One photo showing the sign and the property number, code legible.",
		Kind:         "observe",
		PriceMinor:   2800, PayMinor: 2000,
		NeedsAddress: true,
	},
	{
		ID:           "bin_return",
		Title:        "Put the bins back",
		Predicate:    "the bins are back off the street and behind the property line",
		Instructions: "Move the bins from the kerb to behind the property line and photograph them there with the property number and the code in frame.",
		Deliverable:  "One photo of the bins behind the property line, number and code legible.",
		Kind:         "do",
		PriceMinor:   1600, PayMinor: 1200,
		NeedsAddress: true,
	},
}

// OfferByID finds a catalogue entry.
func OfferByID(id string) (Offer, bool) {
	for _, o := range Catalogue {
		if o.ID == id {
			return o, true
		}
	}
	return Offer{}, false
}

// Checkout session states, from the protocol.
const (
	ACPNotReady  = "not_ready_for_payment"
	ACPReady     = "ready_for_payment"
	ACPCompleted = "completed"
	ACPCanceled  = "canceled"
)

// ACPSession is one buyer part-way through saying yes.
type ACPSession struct {
	ID       string
	Status   string
	OfferID  string
	Quantity int
	Currency string

	// Address is where the work happens. ACP calls this the fulfilment
	// address, which for once is exactly what it is.
	Address ACPAddress

	// Feasible records whether supply was actually reachable there. A session
	// does not become ready for payment until this is true — which makes the
	// protocol's own state machine carry the check that matters most, rather
	// than discovering at capture time that nobody can do the work.
	Feasible bool
	// Why explains a session that cannot proceed, in words a person reads.
	Why string

	// Job is the listing this became, once paid.
	Job string
	// Intent is the authorised, uncaptured PaymentIntent.
	Intent string

	Created time.Time
	Updated time.Time
}

// ACPAddress is where the work happens.
type ACPAddress struct {
	Name       string `json:"name,omitempty"`
	LineOne    string `json:"line_one,omitempty"`
	LineTwo    string `json:"line_two,omitempty"`
	City       string `json:"city,omitempty"`
	State      string `json:"state,omitempty"`
	Country    string `json:"country,omitempty"`
	PostalCode string `json:"postal_code,omitempty"`
}

// Complete reports whether there is enough here to send somebody.
func (a ACPAddress) Complete() bool {
	return strings.TrimSpace(a.LineOne) != "" && strings.TrimSpace(a.City) != ""
}

// OneLine renders the address the way a job carries it.
func (a ACPAddress) OneLine() string {
	parts := []string{a.LineOne, a.LineTwo, a.City, a.State, a.PostalCode}
	var kept []string
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			kept = append(kept, s)
		}
	}
	return strings.Join(kept, ", ")
}

// ACPSessions holds sessions in flight.
type ACPSessions struct {
	mu sync.Mutex
	by map[string]*ACPSession
	// seen makes the protocol's idempotency key mean something. Without it a
	// retried create makes a second session, and a retried complete charges a
	// card twice — which is the failure the header exists to prevent.
	seen map[string]string
}

// NewACPSessions builds an empty store.
func NewACPSessions() *ACPSessions {
	return &ACPSessions{by: map[string]*ACPSession{}, seen: map[string]string{}}
}

// Get returns a session.
func (s *ACPSessions) Get(id string) (*ACPSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.by[id]
	return sess, ok
}

// Put stores a session.
func (s *ACPSessions) Put(sess *ACPSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.by[sess.ID] = sess
}

// Remember records what an idempotency key produced, and returns what it
// produced before if it has been seen.
func (s *ACPSessions) Remember(key, sessionID string) (string, bool) {
	if key == "" {
		return "", false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if prior, ok := s.seen[key]; ok {
		return prior, true
	}
	s.seen[key] = sessionID
	return sessionID, false
}

// Advance recomputes a session's status from what it now knows.
//
// One place, called after every mutation, so a session can never be reported
// ready while something required is missing. Spreading this across the
// handlers is how a checkout ends up payable with no address.
func (sess *ACPSession) Advance(o Offer) {
	if sess.Status == ACPCompleted || sess.Status == ACPCanceled {
		return
	}
	switch {
	case o.NeedsAddress && !sess.Address.Complete():
		sess.Status = ACPNotReady
		sess.Why = "We need the street address before anybody can be sent."
	case !sess.Feasible:
		sess.Status = ACPNotReady
		if sess.Why == "" {
			sess.Why = "Nobody near that address can take this yet. " +
				"We are adding places, and you have not been charged."
		}
	default:
		sess.Status = ACPReady
		sess.Why = ""
	}
}

// Totals renders the money the way the protocol wants it.
func (sess *ACPSession) Totals(o Offer) []map[string]any {
	base := o.PriceMinor * int64(sess.Quantity)
	return []map[string]any{
		{"type": "items_base_amount", "display_text": "Work", "amount": base},
		{"type": "subtotal", "display_text": "Subtotal", "amount": base},
		{"type": "fulfillment", "display_text": "Dispatch", "amount": 0},
		{"type": "total", "display_text": "Total", "amount": base},
	}
}

// verifyACPSignature checks the HMAC the caller sent over the raw body.
//
// Same discipline as the payment webhook: compare in constant time, and treat
// an absent secret as "refuse everything" rather than "allow everything". A
// signature check that silently passes when unconfigured is worse than none,
// because it reads as protection.
func verifyACPSignature(secret, signature string, body []byte) bool {
	if secret == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	want := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(want))
}

// acpError renders a refusal in the protocol's shape.
func acpError(kind, code, message, param string) map[string]any {
	out := map[string]any{"type": kind, "code": code, "message": message}
	if param != "" {
		out["param"] = param
	}
	return out
}

// acpID mints a session identifier.
func acpID(now time.Time) string {
	return fmt.Sprintf("acp_%d", now.UnixNano())
}
