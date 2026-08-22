package outcome

import "encoding/json"

// Phase tracks the work. Money tracks the money. They are deliberately
// separate: one combined variable would force states named things like
// "settled_but_maybe_not", whereas two make the dangerous window nameable —
// Phase=closed with Money=settle_pending is exactly "the log says the outcome
// is done and the payment call is still in flight", which is a state the
// reconciler can query for rather than a bug it has to infer.
type Phase string

const (
	PhaseDraft     Phase = "draft"
	PhaseQuoted    Phase = "quoted"
	PhaseAccepted  Phase = "accepted"
	PhaseAwarded   Phase = "awarded"
	PhaseExecuting Phase = "executing"
	PhaseSubmitted Phase = "submitted"
	PhaseVerified  Phase = "verified"
	PhaseEscalated Phase = "escalated"
	PhaseDisputed  Phase = "disputed"
	PhaseRuled     Phase = "ruled"
	PhaseClosed    Phase = "closed"
)

// Money is the settlement state. The log never asserts that money moved; it
// records an instruction (an intent) and later a receipt (an observation).
// These values track what those entries imply, and ledger.Audit compares them
// against the ledger's own independent record.
type Money string

const (
	MoneyNone          Money = "none"
	MoneyHoldPending   Money = "hold_pending"
	MoneyHeld          Money = "held"
	MoneyHoldFailed    Money = "hold_failed"
	MoneySettlePending Money = "settle_pending"
	MoneySettled       Money = "settled"
	MoneyRefundPending Money = "refund_pending"
	MoneyRefunded      Money = "refunded"
)

// Resolution is set only once Phase is closed.
type Resolution string

const (
	ResolutionNone      Resolution = ""
	ResolutionFulfilled Resolution = "fulfilled"
	ResolutionPartial   Resolution = "partially_fulfilled"
	ResolutionFailed    Resolution = "failed"
	ResolutionCancelled Resolution = "cancelled"
	ResolutionExpired   Resolution = "expired"
	ResolutionVoid      Resolution = "void"
)

// EvidenceRef is the log's commitment to an evidence artifact. The bytes live
// in a content-addressed blob store outside the log, so deleting a blob leaves
// every chain and signature intact.
type EvidenceRef struct {
	EntryID     string `json:"entry_id"`
	Kind        string `json:"kind"` // text | document | image | api_response
	SHA256      string `json:"sha256,omitempty"`
	MediaType   string `json:"media_type,omitempty"`
	Bytes       int64  `json:"bytes,omitempty"`
	CollectedBy string `json:"collected_by"`
	CollectedAt string `json:"collected_at"`
	// AttestedBy records how the submitter authenticated: a real device key,
	// or a capability link the exchange signed on their behalf. It is an input
	// to the verification tier, not a footnote — capability-attested evidence
	// cannot alone reach the top tier.
	AttestedBy string `json:"attested_by"`
	// Transformed marks evidence the client re-encoded before upload, which
	// destroys EXIF and therefore caps the achievable tier.
	Transformed bool `json:"transformed,omitempty"`
}

// Deadline state as folded: when it was anchored and whether it has fired.
type DeadlineState struct {
	ID          string `json:"id"`
	After       string `json:"after"`
	Seconds     int64  `json:"seconds"`
	AnchorEntry string `json:"anchor_entry,omitempty"`
	AnchorTS    string `json:"anchor_ts,omitempty"`
	// ExpiresAt is when the deadline may first be witnessed. Derived from the
	// anchor's asserted timestamp, so it is a claim about the log, not a clock.
	ExpiresAt string `json:"expires_at,omitempty"`
	Fired     bool   `json:"fired"`
	FiredBy   string `json:"fired_by,omitempty"`
	FiredAt   string `json:"fired_at,omitempty"`
}

// FoldError records an entry the fold refused, and why. A fold that silently
// drops a forged verdict is useless both for debugging and for telling a buyer
// why their outcome stalled, so rejections are first-class output.
type FoldError struct {
	EntryID string `json:"entry_id"`
	Kind    string `json:"kind"`
	Author  string `json:"author"`
	Reason  string `json:"reason"`
}

// OutcomeState is the folded state of one outcome thread.
type OutcomeState struct {
	Thread     string     `json:"thread"`
	Phase      Phase      `json:"phase"`
	Money      Money      `json:"money"`
	Resolution Resolution `json:"resolution,omitempty"`

	Buyer       string `json:"buyer,omitempty"`
	BuyerPerson string `json:"buyer_person,omitempty"`
	Provider    string `json:"provider,omitempty"`

	// Roles as bound by steward-signed control entries, and the person each
	// principal acts for. Persons is what makes the independence check able to
	// catch a buyer's second agent key posing as an independent verifier.
	//
	// A principal may hold several roles at once. In a v0 deployment the
	// exchange is steward, escrow agent, verifier, arbiter, and timekeeper all
	// at once; the terms name each one explicitly, so that concentration is
	// disclosed in the signed artifact rather than hidden by the type.
	Roles   map[string]RoleSet `json:"roles,omitempty"`
	Persons map[string]string  `json:"persons,omitempty"`

	Request   *RequestBody `json:"request,omitempty"`
	Terms     *Terms       `json:"terms,omitempty"`
	TermsHash string       `json:"terms_hash,omitempty"`

	QuoteEntry  string `json:"quote_entry,omitempty"`
	AcceptEntry string `json:"accept_entry,omitempty"`
	AwardEntry  string `json:"award_entry,omitempty"`

	EscrowMinor int64  `json:"escrow_minor"`
	Currency    string `json:"currency,omitempty"`
	MaxPayout   int64  `json:"max_payout,omitempty"`

	Bids     []BidBody     `json:"bids,omitempty"`
	Evidence []EvidenceRef `json:"evidence,omitempty"`

	Verdict *VerdictBody `json:"verdict,omitempty"`
	Ruling  *RulingBody  `json:"ruling,omitempty"`

	// Escalation, when this outcome's fate depends on another one.
	Escalation   *EscalationBody   `json:"escalation,omitempty"`
	BoundVerdict *BoundVerdictBody `json:"bound_verdict,omitempty"`

	// Settlement, computed from whichever of ruling/verdict is authoritative.
	Settlement       *Result `json:"settlement,omitempty"`
	InstructionEntry string  `json:"instruction_entry,omitempty"`
	ReceiptEntry     string  `json:"receipt_entry,omitempty"`

	Deadlines map[string]*DeadlineState `json:"deadlines,omitempty"`
	Errors    []FoldError               `json:"errors,omitempty"`
}

// Terminal reports whether the outcome is finished in both dimensions.
func (s *OutcomeState) Terminal() bool {
	if s.Phase != PhaseClosed {
		return false
	}
	switch s.Money {
	case MoneySettled, MoneyRefunded, MoneyNone:
		return true
	}
	return false
}

// InFlight reports whether the log has issued a settlement or refund
// instruction whose outcome the exchange has not yet observed. This is the
// window ledger.Reconcile sweeps.
func (s *OutcomeState) InFlight() bool {
	return s.Money == MoneySettlePending || s.Money == MoneyRefundPending
}

// Basis returns the measures settlement is computed from.
//
// The order is arbitration, then a bound panel finding, then the automated
// verdict. A ruling is the appeal of last resort; a panel is what was bought
// precisely because the automated verdict could not decide, so it supersedes
// it; the machine's own reading is the floor.
func (s *OutcomeState) Basis() (Measures, string, bool) {
	if s.Ruling != nil {
		return s.Ruling.Measures, s.Ruling.Result, true
	}
	if s.BoundVerdict != nil {
		result := VerdictFail
		if s.BoundVerdict.Admissible && s.BoundVerdict.Finding {
			result = VerdictPass
		}
		return s.BoundVerdict.Measures, result, true
	}
	if s.Verdict != nil {
		return s.Verdict.Measures, s.Verdict.Result, true
	}
	return nil, "", false
}

// AwaitingChild reports whether this outcome is blocked on another one.
func (s *OutcomeState) AwaitingChild() bool {
	return s.Escalation != nil && s.BoundVerdict == nil
}

// rolesOf returns every role a principal holds. The buyer role is implied by
// authorship of the request rather than granted by anyone.
func (s *OutcomeState) rolesOf(principal string) RoleSet {
	got := RoleSet{}
	for r := range s.Roles[principal] {
		got[r] = true
	}
	if principal != "" && principal == s.Buyer {
		got[RoleBuyer] = true
	}
	return got
}

// hasRole reports whether principal holds any of the listed roles.
func (s *OutcomeState) hasRole(principal string, roles []Role) bool {
	got := s.rolesOf(principal)
	for _, want := range roles {
		if got[want] {
			return true
		}
	}
	return false
}

// grant binds a role to a principal without disturbing roles it already holds.
func (s *OutcomeState) grant(principal string, role Role) {
	if s.Roles[principal] == nil {
		s.Roles[principal] = RoleSet{}
	}
	s.Roles[principal][role] = true
}

// personOf resolves the human a principal ultimately acts for. A principal
// with no recorded delegation stands for itself.
func (s *OutcomeState) personOf(principal string) string {
	if p, ok := s.Persons[principal]; ok && p != "" {
		return p
	}
	return principal
}

// independent reports whether author is at arm's length from both parties.
// The second clause — sharing a delegating person — is the one that matters:
// checking principal ids alone would let a buyer verify their own outcome with
// a second agent key.
func (s *OutcomeState) independent(author string, from ...string) bool {
	ap := s.personOf(author)
	for _, other := range from {
		if other == "" {
			continue
		}
		if author == other || ap == s.personOf(other) {
			return false
		}
	}
	return true
}

func (s *OutcomeState) reject(entryID, kind, author, reason string) {
	s.Errors = append(s.Errors, FoldError{
		EntryID: entryID, Kind: kind, Author: author, Reason: reason,
	})
}

// decode is a small helper for body unmarshaling inside the fold.
func decode(raw json.RawMessage, v any) error { return json.Unmarshal(raw, v) }
