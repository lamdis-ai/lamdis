package outcome

// Body schemas for the outcome.* entry kinds. These must stay in lockstep
// with spec/schemas/outcome/, the same discipline the core protocol keeps
// between log/entry.go and spec/schemas/entry.schema.json.

// RequestBody opens an outcome: what must become true.
type RequestBody struct {
	Text     string `json:"text"`
	Category string `json:"category,omitempty"` // e.g. signage.presence
	// Spec carries predicate-family-specific parameters (address, sku, ...).
	Spec map[string]any `json:"spec,omitempty"`
	// Routing decides who may issue the quote and the award.
	Routing string `json:"routing,omitempty"` // "buyer" | "exchange" (default)

	BudgetCeilingMinor int64    `json:"budget_ceiling_minor,omitempty"`
	Currency           string   `json:"currency"`
	RequiredTier       string   `json:"required_tier,omitempty"` // V0..V3
	RequiredConfidence int64    `json:"required_confidence_bp,omitempty"`
	EvidenceRequired   []string `json:"evidence_required,omitempty"`
}

// BidBody is a provider offering to execute.
type BidBody struct {
	Provider   string `json:"provider,omitempty"` // filled by the fold from the author
	EntryID    string `json:"entry_id,omitempty"` // filled by the fold
	PriceMinor int64  `json:"price_minor"`
	ETASeconds int64  `json:"eta_seconds"`
	Notes      string `json:"notes,omitempty"`
}

// QuoteBody is the exchange's (or buyer's) priced offer, carrying the terms
// the contract will freeze.
type QuoteBody struct {
	Terms         *Terms   `json:"terms"`
	TermsHash     string   `json:"terms_hash"`
	EscrowMinor   int64    `json:"escrow_minor"`
	FeeBP         int64    `json:"fee_bp,omitempty"`
	ETASeconds    int64    `json:"eta_seconds,omitempty"`
	Tier          string   `json:"tier,omitempty"`
	ConfidenceBP  int64    `json:"confidence_bp,omitempty"`
	ExpiresAt     string   `json:"expires_at"`
	CandidateBids []string `json:"candidate_bids,omitempty"`
}

// AcceptBody forms the contract. Accepting by hash is what stops the price or
// terms being altered between quote and acceptance.
type AcceptBody struct {
	QuoteEntry    string `json:"quote_entry"`
	QuoteHash     string `json:"quote_hash"`
	TermsHash     string `json:"terms_hash"`
	ApprovalEntry string `json:"approval_entry,omitempty"`
	MandateEntry  string `json:"mandate_entry,omitempty"`
}

// AwardBody assigns the work to one provider.
type AwardBody struct {
	BidEntry  string `json:"bid_entry,omitempty"`
	Provider  string `json:"provider"`
	TermsHash string `json:"terms_hash"`
}

// ProgressBody is an interim update from the provider.
type ProgressBody struct {
	Text       string `json:"text"`
	PctBP      int64  `json:"pct_bp,omitempty"`
	ETASeconds int64  `json:"eta_seconds,omitempty"`
}

// BlobRef commits to evidence bytes held outside the log.
type BlobRef struct {
	SHA256    string `json:"sha256"`
	MediaType string `json:"media_type"`
	Bytes     int64  `json:"bytes"`
}

// Capture is the client-asserted context of an artifact. Every field here is
// attacker-controlled and is weighted by the verifier, never trusted.
type Capture struct {
	Device     string `json:"device,omitempty"`
	GeoLat     int64  `json:"geo_lat_micro,omitempty"`
	GeoLon     int64  `json:"geo_lon_micro,omitempty"`
	AccuracyM  int64  `json:"accuracy_m,omitempty"`
	CapturedAt string `json:"captured_at,omitempty"`
}

// EvidenceBody submits an artifact.
type EvidenceBody struct {
	Kind        string   `json:"kind"` // text | document | image | api_response
	Text        string   `json:"text,omitempty"`
	Blob        *BlobRef `json:"blob,omitempty"`
	CollectedBy string   `json:"collected_by,omitempty"`
	CollectedAt string   `json:"collected_at,omitempty"`
	Capture     *Capture `json:"capture,omitempty"`
	AttestedBy  string   `json:"attested_by,omitempty"` // device_key | capability
	Transformed bool     `json:"transformed,omitempty"`
	Supports    []string `json:"supports_measures,omitempty"`
}

// Verdict results.
const (
	VerdictPass    = "pass"
	VerdictPartial = "partial"
	VerdictFail    = "fail"
)

// VerdictBody is the verifier's judgment. Provenance maps each measure to the
// evidence entries that support it, so a reader can audit the reasoning rather
// than take the number on faith.
type VerdictBody struct {
	Result       string              `json:"result"`
	Measures     Measures            `json:"measures"`
	Criteria     map[string]bool     `json:"criteria,omitempty"`
	ConfidenceBP int64               `json:"confidence_bp"`
	Tier         string              `json:"tier,omitempty"`
	Method       string              `json:"method,omitempty"`
	MethodDetail string              `json:"method_detail,omitempty"`
	Provenance   map[string][]string `json:"provenance,omitempty"`
	TermsHash    string              `json:"terms_hash"`
	// AggregateHash commits to the signal set and parameters that produced
	// ConfidenceBP, so a confidence number is reproducible rather than asserted.
	AggregateHash string `json:"aggregate_hash,omitempty"`
}

// DisputeBody contests a verdict.
type DisputeBody struct {
	VerdictEntry string `json:"verdict_entry"`
	VerdictHash  string `json:"verdict_hash"`
	Grounds      string `json:"grounds"`
	Text         string `json:"text,omitempty"`
}

// RulingBody is the arbiter's decision; it supersedes the verdict for payout.
type RulingBody struct {
	DisputeEntry string          `json:"dispute_entry"`
	Result       string          `json:"result"`
	Measures     Measures        `json:"measures"`
	Criteria     map[string]bool `json:"criteria,omitempty"`
	Rationale    string          `json:"rationale,omitempty"`
	TermsHash    string          `json:"terms_hash"`
}

// CancelBody withdraws an outcome before award.
type CancelBody struct {
	Reason       string `json:"reason"`
	MutualAckRef string `json:"mutual_ack_entry,omitempty"`
}

// EscrowIntentBody asks for funds to be held.
type EscrowIntentBody struct {
	AmountMinor    int64  `json:"amount_minor"`
	Currency       string `json:"currency"`
	Rail           string `json:"rail"`
	IdempotencyKey string `json:"idempotency_key"`
	TermsHash      string `json:"terms_hash"`
}

// Escrow receipt states.
const (
	EscrowHeld   = "held"
	EscrowFailed = "failed"
)

// EscrowReceiptBody is the escrow agent's attested observation of the hold.
type EscrowReceiptBody struct {
	IntentEntry string `json:"intent_entry"`
	State       string `json:"state"` // held | failed
	Rail        string `json:"rail"`
	RailRef     string `json:"rail_ref,omitempty"`
	ObservedAt  string `json:"observed_at"`
	FailureCode string `json:"failure_code,omitempty"`
}

// Payout is one leg of a settlement.
type Payout struct {
	Principal   string `json:"principal"`
	AmountMinor int64  `json:"amount_minor"`
}

// SettleInstructionBody is an intent, not an assertion that money moved. The
// computed amounts are included so any reader can recheck the arithmetic
// against the terms and the verdict without trusting the exchange.
type SettleInstructionBody struct {
	BasisEntry     string   `json:"basis_entry"` // the verdict or ruling settled against
	BasisHash      string   `json:"basis_hash"`
	TermsHash      string   `json:"terms_hash"`
	EscrowMinor    int64    `json:"escrow_minor"`
	Payouts        []Payout `json:"payouts"`
	FeeMinor       int64    `json:"fee_minor"`
	RefundMinor    int64    `json:"refund_minor"`
	IdempotencyKey string   `json:"idempotency_key"`
}

// Settlement operation states.
const (
	OpPending   = "pending"
	OpSucceeded = "succeeded"
	OpFailed    = "failed"
	OpUnknown   = "unknown"
)

// SettleOp is one adapter call's observed result.
type SettleOp struct {
	Op          string `json:"op"` // capture | release | refund
	AmountMinor int64  `json:"amount_minor"`
	State       string `json:"state"`
	RailRef     string `json:"rail_ref,omitempty"`
}

// SettleReceiptBody is the escrow agent's attested observation of settlement.
type SettleReceiptBody struct {
	InstructionEntry string     `json:"instruction_entry"`
	Ops              []SettleOp `json:"ops"`
	ObservedAt       string     `json:"observed_at"`
	// Refund marks a receipt that closes out a refund rather than a payout.
	Refund bool `json:"refund,omitempty"`
}

// RoleBody binds a principal to a role within this outcome.
type RoleBody struct {
	Principal        string `json:"principal"`
	Role             Role   `json:"role"`
	OnBehalfOfPerson string `json:"on_behalf_of_person,omitempty"`
}

// ApprovalBody is the human co-signature required above the mandate's
// threshold. It must be authored by a person key with no delegation.
type ApprovalBody struct {
	QuoteEntry string `json:"quote_entry"`
	QuoteHash  string `json:"quote_hash"`
	MaxMinor   int64  `json:"max_minor"`
}

// TimeoutBody is the timekeeper witnessing that a deadline has passed. A
// deadline never changes state on its own; only this signed act does, which is
// what keeps the fold free of a clock.
type TimeoutBody struct {
	DeadlineID  string `json:"deadline_id"`
	AnchorEntry string `json:"anchor_entry"`
	FiredAt     string `json:"fired_at"`
	PhaseBefore string `json:"phase_before,omitempty"`
}

// MandateLimits bounds what an agent may spend on its human's behalf.
type MandateLimits struct {
	Currency             string `json:"currency"`
	MaxPerOutcomeMinor   int64  `json:"max_per_outcome_minor"`
	MaxTotalMinor        int64  `json:"max_total_minor"`
	MaxOpenOutcomes      int    `json:"max_open_outcomes,omitempty"`
	RequireApprovalAbove int64  `json:"require_human_approval_above_minor,omitempty"`
}

// MandateBody is person-signed spending authority. perm.personSigned applies
// unchanged: an agent key cannot author one, so an agent cannot widen its own
// budget.
type MandateBody struct {
	Agent          string        `json:"agent"`
	Capabilities   []string      `json:"capabilities,omitempty"`
	Limits         MandateLimits `json:"limits"`
	AllowProviders []string      `json:"allow_providers,omitempty"`
	AllowVerifiers []string      `json:"allow_verifiers,omitempty"`
	ExpiresAt      string        `json:"expires_at,omitempty"`
}

// MandateRevokeBody withdraws a mandate.
type MandateRevokeBody struct {
	Agent  string `json:"agent"`
	Reason string `json:"reason,omitempty"`
}

// Commitment states.
const (
	CommitmentOpen   = "open"
	CommitmentClosed = "closed"
)

// CommitmentBody mirrors an outcome's escrow onto the mandate thread. This is
// how cross-outcome spend is accounted for without making any fold impure:
// FoldMandate sums commitments on its own thread rather than reaching into
// other threads.
type CommitmentBody struct {
	Outcome     string `json:"outcome"`
	TermsHash   string `json:"terms_hash"`
	EscrowMinor int64  `json:"escrow_minor"`
	State       string `json:"state"` // open | closed
}

// EscalationBody binds this outcome to a child that will resolve it.
//
// The parent's money stays held while the child runs. The child is an ordinary
// outcome — it has its own escrow, its own providers, its own verdict — and
// the only special thing about it is that this entry names it, so a reader of
// the parent knows the parent's fate is not yet its own to decide.
type EscalationBody struct {
	// Child is the thread id of the outcome that will answer the question.
	Child string `json:"child"`
	// Question is what the child was asked, in plain language.
	Question string `json:"question"`
	// Reason is why automated verification could not settle it.
	Reason string `json:"reason"`
	// Reviewers and Agreement describe the panel the child bought.
	Reviewers int `json:"reviewers"`
	Agreement int `json:"agreement"`
	// EvidenceRefs are the parent's artifacts the child must examine.
	EvidenceRefs []string `json:"evidence_refs,omitempty"`
	// ParentVerdict is the inconclusive verdict this escalates from.
	ParentVerdict string `json:"parent_verdict"`
}

// BoundVerdictBody relays a child outcome's finding back to its parent.
//
// It carries the child's thread and the hash of the child's own verdict entry,
// so an auditor holding both threads can check that the relayed answer is the
// answer the child actually reached. Without those hashes the relay would be
// the exchange's word for what happened elsewhere.
type BoundVerdictBody struct {
	Child            string `json:"child"`
	ChildVerdict     string `json:"child_verdict"`
	ChildVerdictHash string `json:"child_verdict_hash"`
	// Finding is the panel's answer to the parent's question.
	Finding bool `json:"finding"`
	// Admissible reports whether the panel returned usable work at all. A
	// panel that never reported is not a finding of "no".
	Admissible bool `json:"admissible"`
	// Agreeing is how many reviewers reached Finding, out of Reviewers.
	Agreeing  int `json:"agreeing"`
	Reviewers int `json:"reviewers"`
	// Measures are the parent's measures as determined by the panel.
	Measures  Measures `json:"measures"`
	TermsHash string   `json:"terms_hash"`
}
