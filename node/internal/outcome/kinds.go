package outcome

import protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"

// The outcome.* extension namespace. Nodes that do not implement the exchange
// replicate, store, and index these opaquely, exactly as the protocol
// specifies for any non-core kind.
const (
	// Control lane: authority and role structure. Replicated to every member
	// at every scope, because a replica must be able to verify who was
	// entitled to write a verdict.
	KindMandate       = "outcome.mandate"        // person-signed spending authority for an agent
	KindMandateRevoke = "outcome.mandate_revoke" // person-signed withdrawal of it
	KindCommitment    = "outcome.commitment"     // mirrors an escrow onto the mandate thread
	KindRole          = "outcome.role"           // steward binds a principal to a role
	KindApproval      = "outcome.approval"       // person co-signs a quote above the threshold
	KindTimeout       = "outcome.timeout"        // timekeeper witnesses a deadline passing

	// Content lane: the substance. Amounts live here, not in control, so a
	// summary-scoped observer never sees them.
	KindRequest  = "outcome.request"
	KindBid      = "outcome.bid"
	KindQuote    = "outcome.quote"
	KindAccept   = "outcome.accept"
	KindAward    = "outcome.award"
	KindProgress = "outcome.progress"
	KindEvidence = "outcome.evidence"
	KindVerdict  = "outcome.verdict"
	KindDispute  = "outcome.dispute"
	KindRuling   = "outcome.ruling"
	KindCancel   = "outcome.cancel"
	// KindEscalation binds this outcome to a child outcome that will answer a
	// question this one could not. The parent cannot settle until the child
	// reports back.
	KindEscalation = "outcome.escalation"
	// KindBoundVerdict relays a child outcome's finding onto its parent. It is
	// how a result crosses a thread boundary while every fold stays pure over
	// exactly one thread.
	KindBoundVerdict      = "outcome.bound_verdict"
	KindEscrowIntent      = "outcome.escrow_intent"
	KindEscrowReceipt     = "outcome.escrow_receipt"
	KindSettleInstruction = "outcome.settle_instruction"
	KindSettleReceipt     = "outcome.settle_receipt"
	KindAttestation       = "outcome.attestation"

	// Summary lane: discovery and rollups, always redacted.
	KindListing     = "outcome.listing"
	KindCard        = "outcome.card"
	KindReliability = "outcome.reliability"
)

// Role is a capacity a principal holds within one outcome. Buyer is implicit
// (the author of the request); the rest are bound by steward-signed
// outcome.role entries and frozen into the terms at acceptance.
type Role string

const (
	RoleBuyer       Role = "buyer"
	RoleProvider    Role = "provider"
	RoleVerifier    Role = "verifier"
	RoleArbiter     Role = "arbiter"
	RoleEscrowAgent Role = "escrow_agent"
	RoleTimekeeper  Role = "timekeeper"
	RoleExchange    Role = "exchange"
	RoleObserver    Role = "observer"
)

// RoleSet is the set of roles one principal holds in one outcome.
type RoleSet map[Role]bool

// Names returns the roles in a stable order, for display and for the fold's
// error messages.
func (rs RoleSet) Names() []string {
	var out []string
	for _, r := range []Role{RoleBuyer, RoleProvider, RoleVerifier, RoleArbiter,
		RoleEscrowAgent, RoleTimekeeper, RoleExchange, RoleObserver} {
		if rs[r] {
			out = append(out, string(r))
		}
	}
	return out
}

func (r Role) Valid() bool {
	switch r {
	case RoleBuyer, RoleProvider, RoleVerifier, RoleArbiter,
		RoleEscrowAgent, RoleTimekeeper, RoleExchange, RoleObserver:
		return true
	}
	return false
}

// Lane returns the replication/permission class an outcome kind belongs to.
// Kinds outside the namespace return false so the fold can ignore them.
func Lane(kind string) (protolog.Lane, bool) {
	switch kind {
	case KindMandate, KindMandateRevoke, KindCommitment, KindRole, KindApproval, KindTimeout:
		return protolog.LaneControl, true
	case KindRequest, KindBid, KindQuote, KindAccept, KindAward, KindProgress,
		KindEvidence, KindVerdict, KindDispute, KindRuling, KindCancel,
		KindEscalation, KindBoundVerdict,
		KindEscrowIntent, KindEscrowReceipt, KindSettleInstruction,
		KindSettleReceipt, KindAttestation:
		return protolog.LaneContent, true
	case KindListing, KindCard, KindReliability:
		return protolog.LaneSummary, true
	}
	return "", false
}

// IsOutcomeKind reports whether kind belongs to this namespace.
func IsOutcomeKind(kind string) bool {
	_, ok := Lane(kind)
	return ok
}
