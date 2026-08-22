package outcome

import (
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// Fold computes the state of one outcome from its thread's entries in the
// protocol's total order.
//
// It is pure: no clock, no store, no network. That is deliberate and
// load-bearing — the signature is what enforces it. An attestation is only
// worth something if a stranger holding nothing but the thread can replay it
// and reach the same numbers, so nothing that varies between machines may
// influence the result. Deadlines therefore never fire on their own; a
// timekeeper witnesses them with a signed entry, and the fold checks that
// entry's asserted timestamp against the anchor's.
//
// It fails closed. Anything not explicitly permitted by the transition table
// is rejected and recorded in State.Errors rather than silently ignored.
func Fold(threadID string, entries []*protolog.Entry) *OutcomeState {
	s := &OutcomeState{
		Thread:    threadID,
		Phase:     PhaseDraft,
		Money:     MoneyNone,
		Roles:     map[string]RoleSet{},
		Persons:   map[string]string{},
		Deadlines: map[string]*DeadlineState{},
	}
	f := &folder{s: s, anchors: map[string]*protolog.Entry{}, byID: map[string]*protolog.Entry{}}

	for _, e := range entries {
		f.byID[e.ID] = e
	}
	for _, e := range entries {
		f.apply(e)
	}
	return s
}

type folder struct {
	s       *OutcomeState
	anchors map[string]*protolog.Entry
	byID    map[string]*protolog.Entry

	quoteHash       string
	intent          *EscrowIntentBody
	intentEntry     string
	instruction     *SettleInstructionBody
	disputeWindowUp bool
}

func (f *folder) apply(e *protolog.Entry) {
	s := f.s

	// Delegation and thread genesis are core kinds this fold reads for
	// context: who stewards the thread, and which person each agent acts for.
	switch e.Kind {
	case protolog.KindThread:
		var b struct {
			Stewards []string `json:"stewards"`
		}
		if decode(e.Body, &b) == nil {
			for _, st := range b.Stewards {
				s.grant(st, RoleExchange)
			}
		}
		return
	case protolog.KindDelegation:
		var b struct {
			Agent   string `json:"agent"`
			Revoked bool   `json:"revoked"`
		}
		if decode(e.Body, &b) == nil && b.Agent != "" {
			if b.Revoked {
				delete(s.Persons, b.Agent)
			} else {
				s.Persons[b.Agent] = e.Author
			}
		}
		return
	}
	if e.OnBehalfOf != "" {
		s.Persons[e.Author] = e.OnBehalfOf
	}
	if !IsOutcomeKind(e.Kind) {
		return // other extension namespaces replicate opaquely
	}

	wantLane, _ := Lane(e.Kind)
	if e.Lane != wantLane {
		s.reject(e.ID, e.Kind, e.Author, fmt.Sprintf("kind belongs in the %s lane, not %s", wantLane, e.Lane))
		return
	}

	t, ok := Lookup(s.Phase, e.Kind)
	if !ok {
		s.reject(e.ID, e.Kind, e.Author, fmt.Sprintf("not legal in phase %s", s.Phase))
		return
	}
	if len(t.Roles) > 0 && !s.hasRole(e.Author, t.Roles) {
		s.reject(e.ID, e.Kind, e.Author,
			fmt.Sprintf("author holds roles %v, none of which may write %s", s.rolesOf(e.Author).Names(), e.Kind))
		return
	}
	if phaseAdvancing[e.Kind] && f.alreadyTaken(e.Kind) {
		s.reject(e.ID, e.Kind, e.Author, "a "+e.Kind+" has already been accepted for this outcome")
		return
	}

	if err := f.handle(e, t); err != nil {
		s.reject(e.ID, e.Kind, e.Author, err.Error())
		return
	}
	if t.To != "" && e.Kind != KindTimeout {
		s.Phase = t.To
	}
}

// alreadyTaken reports whether a single-author-only kind has already landed.
func (f *folder) alreadyTaken(kind string) bool {
	s := f.s
	switch kind {
	case KindRequest:
		return s.Request != nil
	case KindAccept:
		return s.AcceptEntry != ""
	case KindAward:
		return s.AwardEntry != ""
	case KindVerdict:
		return s.Verdict != nil
	case KindRuling:
		return s.Ruling != nil
	case KindSettleInstruction:
		return s.InstructionEntry != ""
	case KindCancel:
		return s.Resolution == ResolutionCancelled
	}
	return false
}

func (f *folder) handle(e *protolog.Entry, t Transition) error {
	s := f.s
	switch e.Kind {

	case KindRequest:
		var b RequestBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed request body: %w", err)
		}
		s.Buyer = e.Author
		s.BuyerPerson = s.personOf(e.Author)
		s.Request = &b
		s.Currency = b.Currency
		f.setAnchor(AnchorRequest, e)

	case KindBid:
		var b BidBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed bid body: %w", err)
		}
		b.Provider, b.EntryID = e.Author, e.ID
		s.Bids = append(s.Bids, b)
		// Bidding is how a principal becomes a candidate provider; requiring
		// the role first would be circular.
		s.grant(e.Author, RoleProvider)

	case KindQuote:
		var b QuoteBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed quote body: %w", err)
		}
		if b.Terms == nil {
			return fmt.Errorf("quote carries no terms")
		}
		if err := b.Terms.Validate(); err != nil {
			return fmt.Errorf("quoted terms are invalid: %w", err)
		}
		h, err := b.Terms.Hash()
		if err != nil {
			return err
		}
		if b.TermsHash != h {
			return fmt.Errorf("quote's terms_hash does not match its terms")
		}
		max, err := MaxPayout(b.Terms)
		if err != nil {
			return err
		}
		if b.EscrowMinor != max {
			return fmt.Errorf("quote escrows %d but the terms can pay out up to %d", b.EscrowMinor, max)
		}
		eh, err := e.Hash()
		if err != nil {
			return err
		}
		s.Terms, s.TermsHash = b.Terms, h
		s.EscrowMinor, s.MaxPayout = b.EscrowMinor, max
		s.Currency = b.Terms.Currency
		s.QuoteEntry, f.quoteHash = e.ID, eh
		f.loadDeadlines(b.Terms)

	case KindAccept:
		var b AcceptBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed accept body: %w", err)
		}
		if b.QuoteEntry != s.QuoteEntry {
			return fmt.Errorf("accepts quote %s but the current quote is %s", b.QuoteEntry, s.QuoteEntry)
		}
		// Accepting by hash is what stops the price or terms being altered
		// between the quote and the acceptance.
		if b.QuoteHash != f.quoteHash {
			return fmt.Errorf("quote_hash does not match the quote entry; terms may have been altered")
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("terms_hash does not match the quoted terms")
		}
		s.AcceptEntry = e.ID
		// Roles freeze here. The fold checks later verdicts against these
		// values, not against the role set as it stands at verdict time, so a
		// role entry written afterwards cannot retroactively legitimize one.
		f.freezeRoles(s.Terms)
		f.setAnchor(AnchorAccept, e)

	case KindEscrowIntent:
		var b EscrowIntentBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed escrow intent: %w", err)
		}
		if s.Money != MoneyNone && s.Money != MoneyHoldFailed {
			return fmt.Errorf("escrow already %s", s.Money)
		}
		if b.AmountMinor != s.MaxPayout {
			return fmt.Errorf("intent holds %d but the terms can pay out up to %d", b.AmountMinor, s.MaxPayout)
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("intent's terms_hash does not match the accepted terms")
		}
		f.intent, f.intentEntry = &b, e.ID
		s.Money = MoneyHoldPending

	case KindEscrowReceipt:
		var b EscrowReceiptBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed escrow receipt: %w", err)
		}
		if b.IntentEntry != f.intentEntry {
			return fmt.Errorf("receipt references intent %s, not %s", b.IntentEntry, f.intentEntry)
		}
		if s.Money != MoneyHoldPending {
			return fmt.Errorf("no hold is pending (money is %s)", s.Money)
		}
		switch b.State {
		case EscrowHeld:
			s.Money = MoneyHeld
		case EscrowFailed:
			s.Money = MoneyHoldFailed
		default:
			return fmt.Errorf("unknown escrow state %q", b.State)
		}

	case KindAward:
		var b AwardBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed award body: %w", err)
		}
		// Awarding before the money is actually held would let an outcome be
		// executed against an escrow that never landed.
		if s.Money != MoneyHeld {
			return fmt.Errorf("cannot award before funds are held (money is %s)", s.Money)
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("award's terms_hash does not match the accepted terms")
		}
		if !s.independent(b.Provider, s.Buyer) {
			return fmt.Errorf("provider and buyer are the same party; self-dealing is refused")
		}
		if !s.hasRole(b.Provider, []Role{RoleProvider}) {
			return fmt.Errorf("%s has not bid and does not hold the provider role", b.Provider)
		}
		s.Provider, s.AwardEntry = b.Provider, e.ID
		f.setAnchor(AnchorAward, e)

	case KindProgress:
		if e.Author != s.Provider {
			return fmt.Errorf("only the awarded provider reports progress")
		}

	case KindEvidence:
		var b EvidenceBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed evidence body: %w", err)
		}
		ref := EvidenceRef{
			EntryID: e.ID, Kind: b.Kind,
			CollectedBy: b.CollectedBy, CollectedAt: b.CollectedAt,
			AttestedBy: b.AttestedBy, Transformed: b.Transformed,
		}
		if ref.CollectedBy == "" {
			ref.CollectedBy = e.Author
		}
		if ref.CollectedAt == "" {
			ref.CollectedAt = e.TS
		}
		if b.Blob != nil {
			if !hashRe.MatchString(b.Blob.SHA256) {
				return fmt.Errorf("evidence blob sha256 is malformed")
			}
			ref.SHA256, ref.MediaType, ref.Bytes = b.Blob.SHA256, b.Blob.MediaType, b.Blob.Bytes
		} else if b.Kind != "text" {
			return fmt.Errorf("evidence of kind %q must commit to a blob hash", b.Kind)
		}
		s.Evidence = append(s.Evidence, ref)
		f.setAnchor(AnchorEvidence, e)

	case KindVerdict:
		var b VerdictBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed verdict body: %w", err)
		}
		if err := f.checkAdjudicator(e, s.Terms.Verifier, "verifier", s.Buyer, s.Provider); err != nil {
			return err
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("verdict's terms_hash does not match the accepted terms")
		}
		if err := checkMeasures(s.Terms, b.Measures); err != nil {
			return err
		}
		if b.ConfidenceBP < 0 || b.ConfidenceBP > 10000 {
			return fmt.Errorf("confidence %d bp is out of range", b.ConfidenceBP)
		}
		s.Verdict = &b
		f.setAnchor(AnchorVerdict, e)
		f.recompute()

	case KindEscalation:
		var b EscalationBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed escalation body: %w", err)
		}
		if e.Author != s.Terms.Verifier && !s.hasRole(e.Author, []Role{RoleExchange}) {
			return fmt.Errorf("only the terms-frozen verifier or a steward may escalate")
		}
		if b.Child == "" {
			return fmt.Errorf("escalation names no child outcome")
		}
		if b.Child == s.Thread {
			return fmt.Errorf("an outcome cannot be bound to itself")
		}
		if s.Escalation != nil {
			return fmt.Errorf("this outcome is already bound to %s", s.Escalation.Child)
		}
		s.Escalation = &b
		f.setAnchor(AnchorEscalate, e)

	case KindBoundVerdict:
		var b BoundVerdictBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed bound verdict body: %w", err)
		}
		if s.Escalation == nil {
			return fmt.Errorf("nothing was escalated, so there is no child to report")
		}
		if b.Child != s.Escalation.Child {
			return fmt.Errorf("report comes from %s but this outcome is bound to %s",
				b.Child, s.Escalation.Child)
		}
		if e.Author != s.Terms.Verifier && !s.hasRole(e.Author, []Role{RoleExchange}) {
			return fmt.Errorf("only the terms-frozen verifier or a steward may relay a child's finding")
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("bound verdict's terms_hash does not match the accepted terms")
		}
		if !hashRe.MatchString(b.ChildVerdictHash) {
			// The hash is what lets an auditor holding both threads check that
			// the relayed answer is the one the child actually reached.
			return fmt.Errorf("bound verdict does not commit to the child's verdict hash")
		}
		// A panel that agreed less than the escalation asked for has not
		// answered the question, whatever its members individually thought.
		if b.Admissible && b.Agreeing < s.Escalation.Agreement {
			return fmt.Errorf("panel reached %d of the %d agreements required",
				b.Agreeing, s.Escalation.Agreement)
		}
		if err := checkMeasures(s.Terms, b.Measures); err != nil {
			return err
		}
		s.BoundVerdict = &b
		f.setAnchor(AnchorVerdict, e)
		f.recompute()

	case KindDispute:
		var b DisputeBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed dispute body: %w", err)
		}
		if e.Author != s.Buyer && e.Author != s.Provider {
			return fmt.Errorf("only the buyer or the awarded provider may dispute")
		}
		if f.disputeWindowUp {
			return fmt.Errorf("the dispute window has already closed")
		}
		f.setAnchor(AnchorDispute, e)

	case KindRuling:
		var b RulingBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed ruling body: %w", err)
		}
		// The arbiter must additionally be independent of the verifier whose
		// judgment is under appeal.
		if err := f.checkAdjudicator(e, s.Terms.Arbiter, "arbiter", s.Buyer, s.Provider, s.Terms.Verifier); err != nil {
			return err
		}
		if b.TermsHash != s.TermsHash {
			return fmt.Errorf("ruling's terms_hash does not match the accepted terms")
		}
		if err := checkMeasures(s.Terms, b.Measures); err != nil {
			return err
		}
		s.Ruling = &b
		f.recompute()

	case KindSettleInstruction:
		var b SettleInstructionBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed settle instruction: %w", err)
		}
		if s.Money != MoneyHeld {
			return fmt.Errorf("cannot settle: money is %s, not held", s.Money)
		}
		if s.Phase == PhaseVerified && !f.disputeWindowUp {
			return fmt.Errorf("the dispute window has not closed yet")
		}
		if err := f.checkInstruction(&b); err != nil {
			return err
		}
		f.instruction = &b
		s.InstructionEntry = e.ID
		s.Money = MoneySettlePending
		s.Resolution = resolutionFor(s)

	case KindSettleReceipt:
		var b SettleReceiptBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed settle receipt: %w", err)
		}
		switch {
		case s.Money == MoneySettlePending && b.InstructionEntry == s.InstructionEntry:
			s.Money = MoneySettled
		case s.Money == MoneyRefundPending:
			s.Money = MoneyRefunded
		default:
			return fmt.Errorf("no settlement is pending that this receipt closes")
		}
		s.ReceiptEntry = e.ID

	case KindCancel:
		var b CancelBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed cancel body: %w", err)
		}
		if s.AwardEntry != "" {
			return fmt.Errorf("cannot cancel after the work has been awarded")
		}
		s.Resolution = ResolutionCancelled
		f.releaseFunds()

	case KindTimeout:
		return f.handleTimeout(e)

	case KindRole:
		var b RoleBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed role body: %w", err)
		}
		if !b.Role.Valid() {
			return fmt.Errorf("unknown role %q", b.Role)
		}
		if s.AcceptEntry != "" {
			return fmt.Errorf("roles are frozen once the contract is accepted")
		}
		s.grant(b.Principal, b.Role)
		if b.OnBehalfOfPerson != "" {
			s.Persons[b.Principal] = b.OnBehalfOfPerson
		}

	case KindApproval:
		var b ApprovalBody
		if err := decode(e.Body, &b); err != nil {
			return fmt.Errorf("malformed approval body: %w", err)
		}
		// An approval is a human act. An agent key cannot manufacture one,
		// which is what stops an agent widening its own spending authority.
		if e.OnBehalfOf != "" {
			return fmt.Errorf("an approval must be signed by a person directly, not on behalf of one")
		}

	case KindAttestation, KindListing, KindCard, KindReliability:
		// Records, not state changes.
	}
	return nil
}

// checkAdjudicator enforces that a verdict or ruling comes from the principal
// the terms froze, and that they are at arm's length from the parties.
func (f *folder) checkAdjudicator(e *protolog.Entry, frozen, what string, from ...string) error {
	if e.Author != frozen {
		return fmt.Errorf("only the %s named in the accepted terms may write this (%s wrote it)", what, e.Author)
	}
	if !f.s.independent(e.Author, from...) {
		return fmt.Errorf("the %s is not independent of the parties; self-verification is refused", what)
	}
	return nil
}

// checkInstruction recomputes the settlement from the terms and the
// authoritative measures and requires the instruction to match exactly. The
// arithmetic is published in the entry so that any reader can perform this
// same check without trusting the exchange.
func (f *folder) checkInstruction(b *SettleInstructionBody) error {
	s := f.s
	measures, _, ok := s.Basis()
	if !ok {
		return fmt.Errorf("nothing to settle against: no verdict or ruling")
	}
	if b.TermsHash != s.TermsHash {
		return fmt.Errorf("instruction's terms_hash does not match the accepted terms")
	}
	want, err := Evaluate(s.Terms, measures, s.EscrowMinor)
	if err != nil {
		return fmt.Errorf("settlement arithmetic failed: %w", err)
	}
	var paid int64
	for _, p := range b.Payouts {
		paid += p.AmountMinor
	}
	if paid != want.ProviderNet || b.FeeMinor != want.FeeMinor || b.RefundMinor != want.RefundMinor {
		return fmt.Errorf("instruction pays %d/fee %d/refund %d but the terms compute %d/%d/%d",
			paid, b.FeeMinor, b.RefundMinor, want.ProviderNet, want.FeeMinor, want.RefundMinor)
	}
	if paid+b.FeeMinor+b.RefundMinor != s.EscrowMinor {
		return fmt.Errorf("instruction does not conserve the escrowed amount")
	}
	if b.EscrowMinor != s.EscrowMinor {
		return fmt.Errorf("instruction's escrow does not match the held amount")
	}
	return nil
}

// recompute refreshes the settlement preview whenever the authoritative
// measures change. It is a projection, never an assertion that money moved.
func (f *folder) recompute() {
	s := f.s
	measures, _, ok := s.Basis()
	if !ok || s.Terms == nil {
		return
	}
	if r, err := Evaluate(s.Terms, measures, s.EscrowMinor); err == nil {
		s.Settlement = &r
	}
}

// releaseFunds moves held money toward the buyer.
func (f *folder) releaseFunds() {
	s := f.s
	switch s.Money {
	case MoneyHeld:
		s.Money = MoneyRefundPending
	case MoneyHoldPending:
		s.Money = MoneyRefundPending
	}
}

// setAnchor records a lifecycle event and stamps every deadline that counts
// from it. Anchoring on arrival rather than on firing is what lets a caller —
// the engine deciding when to witness a timeout, or a dashboard showing a
// countdown — know what a deadline is measured from before it expires.
func (f *folder) setAnchor(name string, e *protolog.Entry) {
	f.anchors[name] = e
	ts, err := time.Parse(time.RFC3339, e.TS)
	for _, d := range f.s.Deadlines {
		if d.After != name || d.Fired {
			continue
		}
		d.AnchorEntry, d.AnchorTS = e.ID, e.TS
		if err == nil {
			d.ExpiresAt = ts.Add(time.Duration(d.Seconds) * time.Second).Format(time.RFC3339)
		}
	}
}

func (f *folder) loadDeadlines(t *Terms) {
	f.s.Deadlines = map[string]*DeadlineState{}
	for _, d := range t.Deadlines {
		f.s.Deadlines[d.ID] = &DeadlineState{ID: d.ID, After: d.After, Seconds: d.Seconds}
	}
	// Deadlines are declared at quote time, by which point earlier lifecycle
	// events may already have happened.
	for name, e := range f.anchors {
		f.setAnchor(name, e)
	}
}

// freezeRoles binds the terms' named principals to their roles at acceptance.
func (f *folder) freezeRoles(t *Terms) {
	s := f.s
	// Additive: one principal may hold several service roles, and granting
	// escrow-agent must not silently revoke its stewardship.
	s.grant(t.Verifier, RoleVerifier)
	s.grant(t.Arbiter, RoleArbiter)
	s.grant(t.EscrowAgent, RoleEscrowAgent)
	s.grant(t.Timekeeper, RoleTimekeeper)
}

// handleTimeout applies a witnessed deadline. The timekeeper's own asserted
// timestamp is checked against the anchor's — both are signed and attributable,
// so a dishonest timekeeper firing early is provable rather than deniable.
func (f *folder) handleTimeout(e *protolog.Entry) error {
	s := f.s
	var b TimeoutBody
	if err := decode(e.Body, &b); err != nil {
		return fmt.Errorf("malformed timeout body: %w", err)
	}
	if s.Terms == nil {
		return fmt.Errorf("no terms are in force, so no deadlines exist yet")
	}
	if e.Author != s.Terms.Timekeeper {
		return fmt.Errorf("only the timekeeper named in the terms may fire deadlines")
	}
	d, ok := s.Deadlines[b.DeadlineID]
	if !ok {
		return fmt.Errorf("the terms declare no deadline %q", b.DeadlineID)
	}
	if d.Fired {
		return fmt.Errorf("deadline %q has already fired", b.DeadlineID)
	}
	eff, ok := deadlineEffects[b.DeadlineID]
	if !ok {
		return fmt.Errorf("deadline %q has no defined effect", b.DeadlineID)
	}
	if !phaseIn(s.Phase, eff.LegalIn) {
		return fmt.Errorf("deadline %q cannot fire in phase %s", b.DeadlineID, s.Phase)
	}
	anchor := f.anchors[d.After]
	if anchor == nil {
		return fmt.Errorf("deadline %q counts from %q, which has not happened", b.DeadlineID, d.After)
	}
	if b.AnchorEntry != anchor.ID {
		return fmt.Errorf("timeout names anchor %s but %q anchors at %s", b.AnchorEntry, d.After, anchor.ID)
	}
	anchorTS, err := time.Parse(time.RFC3339, anchor.TS)
	if err != nil {
		return fmt.Errorf("anchor timestamp is unparseable: %w", err)
	}
	firedTS, err := time.Parse(time.RFC3339, e.TS)
	if err != nil {
		return fmt.Errorf("timeout timestamp is unparseable: %w", err)
	}
	if firedTS.Before(anchorTS.Add(time.Duration(d.Seconds) * time.Second)) {
		return fmt.Errorf("deadline %q fired %s early", b.DeadlineID,
			anchorTS.Add(time.Duration(d.Seconds)*time.Second).Sub(firedTS))
	}

	d.Fired, d.FiredBy, d.FiredAt = true, e.Author, e.TS

	if eff.OpensSettlement {
		f.disputeWindowUp = true
		return nil
	}
	switch b.DeadlineID {
	case DeadlineEvidence:
		// Verification counts from the end of evidence collection. If the
		// provider never submitted anything there is no artifact to anchor on,
		// so the deadline itself becomes the anchor. Without this the
		// verification deadline can never fire and the buyer's money is
		// stranded in escrow with no path forward.
		if f.anchors[AnchorEvidence] == nil {
			f.setAnchor(AnchorEvidence, e)
		}
	case DeadlineVerification:
		// Nobody judged in time. The terms say which way that falls, and the
		// default is against the provider — the buyer's money is what is at
		// risk, so silence must not pay out.
		if s.Verdict == nil {
			result, pass := VerdictFail, false
			if s.Terms.OnVerificationTimeout == TimeoutPass {
				result, pass = VerdictPass, true
			}
			s.Verdict = &VerdictBody{
				Result: result, Measures: extremeMeasures(s.Terms, pass), TermsHash: s.TermsHash,
				Method: "timeout", MethodDetail: "no verdict was written before the verification deadline",
			}
			f.recompute()
		}
	case DeadlineArbitration:
		if s.Ruling == nil && s.Terms.OnArbitrationTimeout == TimeoutRefund {
			s.Resolution = ResolutionExpired
			f.releaseFunds()
			s.Phase = PhaseClosed
			return nil
		}
	}
	if eff.Refund {
		s.Resolution = eff.Resolve
		f.releaseFunds()
	}
	if eff.To != "" {
		s.Phase = eff.To
	}
	return nil
}

// extremeMeasures reads every measure at one end of its declared range. A
// timeout means nobody established anything, so the terms' stated disposition
// decides which end: "fail" reads every measure at its floor, "pass" at its
// ceiling. The fold cannot know which measure carries the predicate's meaning,
// so it takes the whole document to the extreme the author chose rather than
// guessing at individual fields.
func extremeMeasures(t *Terms, pass bool) Measures {
	m := make(Measures, len(t.Measures))
	for _, d := range t.Measures {
		if pass {
			m[d.ID] = d.Max
		} else {
			m[d.ID] = d.Min
		}
	}
	return m
}

func phaseIn(p Phase, list []Phase) bool {
	if len(list) == 0 {
		return true
	}
	for _, c := range list {
		if c == p {
			return true
		}
	}
	return false
}

// resolutionFor classifies a settled outcome from its authoritative result.
func resolutionFor(s *OutcomeState) Resolution {
	_, result, ok := s.Basis()
	if !ok {
		return ResolutionFailed
	}
	switch result {
	case VerdictPass:
		return ResolutionFulfilled
	case VerdictPartial:
		return ResolutionPartial
	default:
		return ResolutionFailed
	}
}

// hashRe matches a lowercase hex sha256 digest.
var hashRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// JSON is a convenience for dashboards and the CLI.
func (s *OutcomeState) JSON() ([]byte, error) { return json.MarshalIndent(s, "", "  ") }
