package outcome

// The state machine, encoded as data rather than a switch. Keeping it as a
// table means it can be rendered into spec/exchange.md, diffed in tests, and
// checked for holes (unreachable phases, non-terminal phases with no timeout
// edge) mechanically instead of by reading code.
//
// Everything not in this table is rejected and recorded in State.Errors.
// Deny by default, exactly as perm.Fold does.

// Transition is one legal (phase, kind, author-role) step.
type Transition struct {
	// From lists the phases this step is legal in. Empty means any phase.
	From []Phase
	Kind string
	// Roles lists the author roles permitted. Empty means any member.
	Roles []Role
	// To is the resulting phase. Empty means the phase does not change.
	To Phase
	// Why documents the rule for the spec rendering.
	Why string
}

// AnyPhase is the sentinel for a transition legal in every phase.
var AnyPhase []Phase

// Transitions is the complete table. Order is significant only for
// readability; lookup matches on (kind, phase).
var Transitions = []Transition{
	{From: []Phase{PhaseDraft}, Kind: KindRequest, To: PhaseDraft,
		Why: "opens the outcome; authoring the request is what confers the buyer role, so it cannot require it. Only the first request counts"},
	{From: []Phase{PhaseDraft}, Kind: KindBid, To: PhaseDraft,
		Why: "any thread member may offer to execute; bidding is what confers the provider role"},
	{From: []Phase{PhaseDraft}, Kind: KindQuote, Roles: []Role{RoleBuyer, RoleExchange}, To: PhaseQuoted,
		Why: "prices the outcome and freezes candidate terms"},
	{From: []Phase{PhaseQuoted}, Kind: KindQuote, Roles: []Role{RoleBuyer, RoleExchange}, To: PhaseQuoted,
		Why: "a later quote supersedes an earlier one"},
	{From: []Phase{PhaseQuoted}, Kind: KindAccept, Roles: []Role{RoleBuyer}, To: PhaseAccepted,
		Why: "contract formation; accepting by hash pins the terms"},

	{From: []Phase{PhaseAccepted}, Kind: KindEscrowIntent, Roles: []Role{RoleBuyer}, To: PhaseAccepted,
		Why: "asks for MaxPayout(terms) to be held"},
	{From: []Phase{PhaseAccepted}, Kind: KindEscrowReceipt, Roles: []Role{RoleEscrowAgent}, To: PhaseAccepted,
		Why: "the escrow agent's attested observation of the hold"},
	{From: []Phase{PhaseAccepted}, Kind: KindAward, Roles: []Role{RoleBuyer, RoleExchange}, To: PhaseAwarded,
		Why: "assigns the work; requires funds already held"},

	{From: []Phase{PhaseAwarded}, Kind: KindProgress, Roles: []Role{RoleProvider}, To: PhaseExecuting,
		Why: "first sign of work moves the outcome into execution"},
	{From: []Phase{PhaseExecuting}, Kind: KindProgress, Roles: []Role{RoleProvider}, To: PhaseExecuting,
		Why: "further interim updates"},

	{From: []Phase{PhaseAwarded, PhaseExecuting}, Kind: KindEvidence,
		Roles: []Role{RoleProvider, RoleBuyer, RoleVerifier}, To: PhaseSubmitted,
		Why: "the first artifact moves the outcome to submitted"},
	{From: []Phase{PhaseSubmitted}, Kind: KindEvidence,
		Roles: []Role{RoleProvider, RoleBuyer, RoleVerifier}, To: PhaseSubmitted,
		Why: "further artifacts"},

	{From: []Phase{PhaseSubmitted}, Kind: KindVerdict, Roles: []Role{RoleVerifier}, To: PhaseVerified,
		Why: "the terms-frozen verifier judges; independence is enforced separately"},

	{From: []Phase{PhaseVerified}, Kind: KindDispute, Roles: []Role{RoleBuyer, RoleProvider}, To: PhaseDisputed,
		Why: "either party may contest within the dispute window"},
	{From: []Phase{PhaseVerified}, Kind: KindEscalation, Roles: []Role{RoleVerifier, RoleExchange}, To: PhaseEscalated,
		Why: "the automated verdict could not decide, so the outcome is bound to a child that will"},
	{From: []Phase{PhaseEscalated}, Kind: KindBoundVerdict, Roles: []Role{RoleVerifier, RoleExchange}, To: PhaseVerified,
		Why: "the child reported; its finding becomes this outcome's basis for settlement"},
	{From: []Phase{PhaseEscalated}, Kind: KindDispute, Roles: []Role{RoleBuyer, RoleProvider}, To: PhaseDisputed,
		Why: "either party may contest the escalation itself"},

	{From: []Phase{PhaseVerified}, Kind: KindSettleInstruction, Roles: []Role{RoleEscrowAgent}, To: PhaseClosed,
		Why: "settles against the verdict once the dispute window has closed"},

	{From: []Phase{PhaseDisputed}, Kind: KindRuling, Roles: []Role{RoleArbiter}, To: PhaseRuled,
		Why: "the terms-frozen arbiter decides; the ruling supersedes the verdict"},
	{From: []Phase{PhaseRuled}, Kind: KindSettleInstruction, Roles: []Role{RoleEscrowAgent}, To: PhaseClosed,
		Why: "settles against the ruling"},

	{From: []Phase{PhaseClosed}, Kind: KindSettleReceipt, Roles: []Role{RoleEscrowAgent}, To: PhaseClosed,
		Why: "the escrow agent's attested observation that money actually moved"},
	{From: []Phase{PhaseClosed}, Kind: KindAttestation, Roles: []Role{RoleExchange, RoleVerifier}, To: PhaseClosed,
		Why: "issues the portable receipt once the outcome is terminal"},

	{From: []Phase{PhaseDraft, PhaseQuoted, PhaseAccepted}, Kind: KindCancel, Roles: []Role{RoleBuyer}, To: PhaseClosed,
		Why: "the buyer may withdraw any time before award"},

	{From: AnyPhase, Kind: KindTimeout, Roles: []Role{RoleTimekeeper},
		Why: "a witnessed deadline; the resulting phase depends on which deadline fired"},

	// Control-lane structure, legal at any point and not phase-advancing.
	{From: AnyPhase, Kind: KindRole, Roles: []Role{RoleExchange, RoleBuyer},
		Why: "a steward binds a principal to a role"},
	{From: AnyPhase, Kind: KindApproval, Roles: []Role{RoleBuyer},
		Why: "a human co-signs a quote above the mandate threshold"},

	// Summary-lane rollups never affect state.
	{From: AnyPhase, Kind: KindListing},
	{From: AnyPhase, Kind: KindCard},
	{From: AnyPhase, Kind: KindReliability},
}

// phaseAdvancing lists the kinds where exactly one author is legitimate and
// the fold therefore takes the first such entry in total order and ignores
// later ones. Because chains are per-author, a double-award or double-verdict
// is structurally impossible rather than merely disallowed.
var phaseAdvancing = map[string]bool{
	KindRequest:           true,
	KindAccept:            true,
	KindAward:             true,
	KindVerdict:           true,
	KindRuling:            true,
	KindSettleInstruction: true,
	KindCancel:            true,
}

// Lookup returns the transition governing kind in phase, if one exists.
func Lookup(phase Phase, kind string) (Transition, bool) {
	for _, t := range Transitions {
		if t.Kind != kind {
			continue
		}
		if len(t.From) == 0 {
			return t, true
		}
		for _, p := range t.From {
			if p == phase {
				return t, true
			}
		}
	}
	return Transition{}, false
}

// AllPhases is every phase the machine can occupy, used by the completeness
// tests and by the spec rendering.
var AllPhases = []Phase{
	PhaseDraft, PhaseQuoted, PhaseAccepted, PhaseAwarded, PhaseExecuting,
	PhaseSubmitted, PhaseVerified, PhaseEscalated, PhaseDisputed, PhaseRuled, PhaseClosed,
}

// AllMoney is every settlement state.
var AllMoney = []Money{
	MoneyNone, MoneyHoldPending, MoneyHeld, MoneyHoldFailed,
	MoneySettlePending, MoneySettled, MoneyRefundPending, MoneyRefunded,
}

// AllKinds is every kind in the namespace.
var AllKinds = []string{
	KindMandate, KindMandateRevoke, KindCommitment, KindRole, KindApproval, KindTimeout,
	KindRequest, KindBid, KindQuote, KindAccept, KindAward, KindProgress,
	KindEvidence, KindVerdict, KindDispute, KindRuling, KindCancel,
	KindEscalation, KindBoundVerdict,
	KindEscrowIntent, KindEscrowReceipt, KindSettleInstruction,
	KindSettleReceipt, KindAttestation,
	KindListing, KindCard, KindReliability,
}

// deadlineEffect maps a fired deadline to the phase it forces and how the
// outcome resolves. Effects are deliberately conservative: where the buyer's
// money is at risk and nobody has acted, it goes back to the buyer.
type deadlineEffect struct {
	// LegalIn restricts which phases the deadline can fire in.
	LegalIn []Phase
	To      Phase
	Resolve Resolution
	// Refund marks deadlines that end the outcome with the money returned.
	Refund bool
	// OpensSettlement marks the dispute window, whose expiry unblocks
	// settlement rather than ending the outcome.
	OpensSettlement bool
}

var deadlineEffects = map[string]deadlineEffect{
	DeadlineBid: {
		LegalIn: []Phase{PhaseDraft},
		To:      PhaseClosed, Resolve: ResolutionVoid, Refund: true,
	},
	DeadlineAward: {
		LegalIn: []Phase{PhaseAccepted},
		To:      PhaseClosed, Resolve: ResolutionExpired, Refund: true,
	},
	DeadlineEvidence: {
		LegalIn: []Phase{PhaseAwarded, PhaseExecuting},
		To:      PhaseSubmitted,
	},
	DeadlineVerification: {
		LegalIn: []Phase{PhaseSubmitted},
		To:      PhaseVerified,
	},
	DeadlineDispute: {
		LegalIn:         []Phase{PhaseVerified},
		OpensSettlement: true,
	},
	DeadlineArbitration: {
		LegalIn: []Phase{PhaseDisputed},
		To:      PhaseRuled,
	},
	// A child that never reports must not strand the parent's money. The
	// escalation deadline ends the parent in the buyer's favour, because the
	// question the parent needed answered was never answered.
	DeadlineEscalation: {
		LegalIn: []Phase{PhaseEscalated},
		To:      PhaseClosed, Resolve: ResolutionExpired, Refund: true,
	},
}
