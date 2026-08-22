package outcome

import (
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// scene is a small harness for building signed entry sequences with a
// controllable clock, so the fold can be exercised over realistic threads
// rather than hand-written structs.
type scene struct {
	t       *testing.T
	log     *protolog.ThreadLog
	now     time.Time
	keys    map[string]ed25519.PrivateKey
	pids    map[string]string
	authors map[string]*protolog.Author
}

func newScene(t *testing.T) *scene {
	t.Helper()
	s := &scene{
		t:       t,
		now:     time.Date(2026, 8, 17, 9, 0, 0, 0, time.UTC),
		keys:    map[string]ed25519.PrivateKey{},
		pids:    map[string]string{},
		authors: map[string]*protolog.Author{},
	}
	// The exchange creates and stewards the outcome thread.
	s.key("exchange", 10)
	log, _, err := protolog.NewThreadWith(s.keys["exchange"], "outcome", false, s.clock)
	if err != nil {
		t.Fatalf("NewThreadWith: %v", err)
	}
	s.log = log
	s.key("buyer", 11)
	s.key("provider", 12)
	s.key("attacker", 13)
	return s
}

func (s *scene) clock() time.Time { return s.now }

func (s *scene) key(name string, seed byte) {
	raw := make([]byte, ed25519.SeedSize)
	for i := range raw {
		raw[i] = seed
	}
	priv := ed25519.NewKeyFromSeed(raw)
	pid, err := protolog.PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		s.t.Fatalf("PrincipalID: %v", err)
	}
	s.keys[name], s.pids[name] = priv, pid
}

func (s *scene) author(name string) *protolog.Author {
	if a, ok := s.authors[name]; ok {
		return a
	}
	a, err := protolog.NewAuthor(s.log, s.keys[name])
	if err != nil {
		s.t.Fatalf("NewAuthor(%s): %v", name, err)
	}
	a.Now = s.clock
	s.authors[name] = a
	return a
}

func (s *scene) advance(d time.Duration) { s.now = s.now.Add(d) }

// post appends an entry, advancing the clock a tick so ULIDs and ordering stay
// distinct.
func (s *scene) post(actor, kind string, body any) *protolog.Entry {
	s.t.Helper()
	lane, ok := Lane(kind)
	if !ok {
		lane = protolog.LaneContent
	}
	s.advance(time.Second)
	e, err := s.author(actor).Append(protolog.Draft{Kind: kind, Lane: lane, Body: body})
	if err != nil {
		s.t.Fatalf("post %s by %s: %v", kind, actor, err)
	}
	return e
}

// postAs writes an entry attributing it to a delegating person, which is how
// an agent key acts for a human.
func (s *scene) postAs(actor, onBehalfOf, kind string, body any) *protolog.Entry {
	s.t.Helper()
	lane, _ := Lane(kind)
	s.advance(time.Second)
	e, err := s.author(actor).Append(protolog.Draft{
		Kind: kind, Lane: lane, OnBehalfOf: s.pids[onBehalfOf], Body: body,
	})
	if err != nil {
		s.t.Fatalf("post %s by %s: %v", kind, actor, err)
	}
	return e
}

func (s *scene) fold() *OutcomeState { return Fold(s.log.Thread, s.log.Entries()) }

func (s *scene) terms() *Terms {
	s.t.Helper()
	t, err := ObservationSpec{
		Currency: "USD", Scale: 2,
		Verifier: s.pids["exchange"], Arbiter: s.pids["exchange"],
		EscrowAgent: s.pids["exchange"], Timekeeper: s.pids["exchange"],
		PredicateDefinition:  "A FOR LEASE sign is displayed and legible at 742 Evergreen Rd.",
		BaseFeeMinor:         500,
		SuccessBonusMinor:    1800,
		FeeBP:                500,
		EvidenceDeadline:     4 * time.Hour,
		VerificationDeadline: 30 * time.Minute,
		DisputeWindow:        2 * time.Hour,
		ArbitrationDeadline:  24 * time.Hour,
	}.Build()
	if err != nil {
		s.t.Fatalf("build terms: %v", err)
	}
	return t
}

func mustHash(t *testing.T, e *protolog.Entry) string {
	t.Helper()
	h, err := e.Hash()
	if err != nil {
		t.Fatalf("Hash: %v", err)
	}
	return h
}

func fakeBlob(seed string) *BlobRef {
	sum := sha256Hex([]byte(seed))
	return &BlobRef{SHA256: sum, MediaType: "image/jpeg", Bytes: 182_344}
}

// runToVerdict drives an outcome from request to a written verdict and returns
// the scene plus the terms in force.
func runToVerdict(t *testing.T, s *scene, satisfied bool) (*Terms, int64) {
	t.Helper()
	s.post("buyer", KindRequest, RequestBody{
		Text:     "Confirm that 742 Evergreen Rd has a FOR LEASE sign displayed today.",
		Category: "signage.presence", Currency: "USD",
		RequiredTier: "V2", RequiredConfidence: 9000,
	})
	s.post("provider", KindBid, BidBody{PriceMinor: 1820, ETASeconds: 2700})

	terms := s.terms()
	th, err := terms.Hash()
	if err != nil {
		t.Fatalf("terms hash: %v", err)
	}
	escrow, err := MaxPayout(terms)
	if err != nil {
		t.Fatalf("MaxPayout: %v", err)
	}
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ETASeconds: 2280, Tier: "V2", ConfidenceBP: 9400,
		ExpiresAt: s.now.Add(10 * time.Minute).Format(time.RFC3339),
	})
	s.post("buyer", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	intent := s.post("buyer", KindEscrowIntent, EscrowIntentBody{
		AmountMinor: escrow, Currency: "USD", Rail: "mock",
		IdempotencyKey: "k-hold", TermsHash: th,
	})
	s.post("exchange", KindEscrowReceipt, EscrowReceiptBody{
		IntentEntry: intent.ID, State: EscrowHeld, Rail: "mock",
		RailRef: "mock-hold-1", ObservedAt: s.now.Format(time.RFC3339),
	})
	s.post("exchange", KindAward, AwardBody{Provider: s.pids["provider"], TermsHash: th})
	s.post("provider", KindProgress, ProgressBody{Text: "on site"})
	ev := s.post("provider", KindEvidence, EvidenceBody{
		Kind: "image", Blob: fakeBlob("for-lease-photo"),
		AttestedBy: "device_key", Supports: []string{MeasureSatisfied},
	})
	s.post("exchange", KindVerdict, VerdictBody{
		Result:   map[bool]string{true: VerdictPass, false: VerdictFail}[satisfied],
		Measures: Observed(true, satisfied), ConfidenceBP: 9400,
		Tier: "V2", Method: "blind_describe_then_adjudicate",
		Provenance: map[string][]string{MeasureSatisfied: {ev.ID}},
		TermsHash:  th,
	})
	return terms, escrow
}

// settle closes out an outcome after the dispute window expires.
func settle(t *testing.T, s *scene, terms *Terms, escrow int64) {
	t.Helper()
	st := s.fold()
	basis := st.Verdict
	measures, _, _ := st.Basis()
	want, err := Evaluate(terms, measures, escrow)
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}

	// The dispute window must actually elapse, witnessed by the timekeeper.
	s.advance(3 * time.Hour)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineDispute, AnchorEntry: st.Deadlines[DeadlineDispute].AnchorEntry,
		FiredAt: s.now.Format(time.RFC3339),
	})
	_ = basis

	inst := s.post("exchange", KindSettleInstruction, SettleInstructionBody{
		BasisEntry: "", BasisHash: "", TermsHash: st.TermsHash,
		EscrowMinor: escrow,
		Payouts:     []Payout{{Principal: s.pids["provider"], AmountMinor: want.ProviderNet}},
		FeeMinor:    want.FeeMinor, RefundMinor: want.RefundMinor,
		IdempotencyKey: "k-settle",
	})
	s.post("exchange", KindSettleReceipt, SettleReceiptBody{
		InstructionEntry: inst.ID, ObservedAt: s.now.Format(time.RFC3339),
		Ops: []SettleOp{
			{Op: "capture", AmountMinor: want.GrossMinor, State: OpSucceeded, RailRef: "mock-cap-1"},
			{Op: "release", AmountMinor: want.RefundMinor, State: OpSucceeded, RailRef: "mock-rel-1"},
		},
	})
}

func TestHappyPathSettlesToTheProvider(t *testing.T) {
	s := newScene(t)
	terms, escrow := runToVerdict(t, s, true)
	settle(t, s, terms, escrow)

	st := s.fold()
	if len(st.Errors) != 0 {
		t.Fatalf("unexpected rejections: %+v", st.Errors)
	}
	if st.Phase != PhaseClosed || st.Money != MoneySettled {
		t.Fatalf("phase=%s money=%s, want closed/settled", st.Phase, st.Money)
	}
	if st.Resolution != ResolutionFulfilled {
		t.Errorf("resolution = %s, want fulfilled", st.Resolution)
	}
	if !st.Terminal() {
		t.Error("outcome should be terminal")
	}
	// Base fee 500 + bonus 1800 = 2300 gross; 5% fee = 115; provider nets 2185.
	if st.Settlement.GrossMinor != 2300 || st.Settlement.FeeMinor != 115 || st.Settlement.ProviderNet != 2185 {
		t.Errorf("settlement = %+v", st.Settlement)
	}
	if st.Settlement.ProviderNet+st.Settlement.FeeMinor+st.Settlement.RefundMinor != escrow {
		t.Errorf("conservation violated: %+v", st.Settlement)
	}
}

func TestFailedVerdictStillPaysTheBaseFee(t *testing.T) {
	s := newScene(t)
	terms, escrow := runToVerdict(t, s, false)
	settle(t, s, terms, escrow)

	st := s.fold()
	if len(st.Errors) != 0 {
		t.Fatalf("unexpected rejections: %+v", st.Errors)
	}
	if st.Resolution != ResolutionFailed {
		t.Errorf("resolution = %s, want failed", st.Resolution)
	}
	// The provider looked and honestly reported "no sign": admissible evidence
	// earns the base fee, so telling the truth is not a losing move.
	if st.Settlement.GrossMinor != 500 {
		t.Errorf("gross = %d, want the 500 base fee", st.Settlement.GrossMinor)
	}
	if st.Settlement.RefundMinor != escrow-500 {
		t.Errorf("refund = %d, want %d", st.Settlement.RefundMinor, escrow-500)
	}
}

func TestSelfVerificationIsRefused(t *testing.T) {
	// The buyer's second agent key, delegated from the same person, tries to
	// act as the independent verifier. Principal ids differ; the person does
	// not. This is the realistic attack, and the one a naive id comparison
	// would wave through.
	s := newScene(t)
	s.key("buyer_person", 21)
	s.key("buyer_agent2", 22)

	terms, err := ObservationSpec{
		Currency: "USD", Scale: 2,
		Verifier: s.pids["buyer_agent2"], Arbiter: s.pids["exchange"],
		EscrowAgent: s.pids["exchange"], Timekeeper: s.pids["exchange"],
		PredicateDefinition: "A FOR LEASE sign is displayed at 742 Evergreen Rd.",
		BaseFeeMinor:        500, SuccessBonusMinor: 1800, FeeBP: 500,
		EvidenceDeadline: time.Hour, VerificationDeadline: time.Hour,
		DisputeWindow: time.Hour, ArbitrationDeadline: time.Hour,
	}.Build()
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)

	// Both the buyer's agent and the would-be verifier act for the same person.
	s.postAs("buyer", "buyer_person", KindRequest, RequestBody{
		Text: "Confirm the sign.", Currency: "USD",
	})
	s.post("provider", KindBid, BidBody{PriceMinor: 1820})
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	s.postAs("buyer", "buyer_person", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	intent := s.postAs("buyer", "buyer_person", KindEscrowIntent, EscrowIntentBody{
		AmountMinor: escrow, Currency: "USD", Rail: "mock", IdempotencyKey: "k", TermsHash: th,
	})
	s.post("exchange", KindEscrowReceipt, EscrowReceiptBody{
		IntentEntry: intent.ID, State: EscrowHeld, Rail: "mock", ObservedAt: s.now.Format(time.RFC3339),
	})
	s.post("exchange", KindAward, AwardBody{Provider: s.pids["provider"], TermsHash: th})
	s.post("provider", KindEvidence, EvidenceBody{
		Kind: "image", Blob: fakeBlob("photo"), AttestedBy: "device_key",
	})
	// The buyer's other agent, declaring the same delegating person, writes a
	// glowing verdict on its own outcome.
	s.postAs("buyer_agent2", "buyer_person", KindVerdict, VerdictBody{
		Result: VerdictPass, Measures: Observed(true, true), ConfidenceBP: 10000, TermsHash: th,
	})

	st := s.fold()
	if st.Verdict != nil {
		t.Fatal("a verdict from the buyer's own agent was accepted")
	}
	if st.Phase != PhaseSubmitted {
		t.Errorf("phase = %s, want submitted (the verdict must not advance it)", st.Phase)
	}
	if !hasRejection(st, "not independent") {
		t.Errorf("expected an independence rejection, got %+v", st.Errors)
	}
}

func TestVerdictFromAnImposterIsRefused(t *testing.T) {
	s := newScene(t)
	s.post("buyer", KindRequest, RequestBody{Text: "x", Currency: "USD"})
	s.post("provider", KindBid, BidBody{PriceMinor: 100})
	terms := s.terms()
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	s.post("buyer", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	intent := s.post("buyer", KindEscrowIntent, EscrowIntentBody{
		AmountMinor: escrow, Currency: "USD", Rail: "mock", IdempotencyKey: "k", TermsHash: th,
	})
	s.post("exchange", KindEscrowReceipt, EscrowReceiptBody{
		IntentEntry: intent.ID, State: EscrowHeld, Rail: "mock", ObservedAt: s.now.Format(time.RFC3339),
	})
	s.post("exchange", KindAward, AwardBody{Provider: s.pids["provider"], TermsHash: th})
	s.post("provider", KindEvidence, EvidenceBody{Kind: "image", Blob: fakeBlob("p"), AttestedBy: "device_key"})
	s.post("attacker", KindVerdict, VerdictBody{
		Result: VerdictPass, Measures: Observed(true, true), TermsHash: th,
	})

	st := s.fold()
	if st.Verdict != nil {
		t.Fatal("an unauthorized verdict was accepted")
	}
}

func TestAwardBeforeFundsAreHeldIsRefused(t *testing.T) {
	s := newScene(t)
	s.post("buyer", KindRequest, RequestBody{Text: "x", Currency: "USD"})
	s.post("provider", KindBid, BidBody{PriceMinor: 100})
	terms := s.terms()
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	s.post("buyer", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	// No escrow intent or receipt: the money is not held.
	s.post("exchange", KindAward, AwardBody{Provider: s.pids["provider"], TermsHash: th})

	st := s.fold()
	if st.AwardEntry != "" {
		t.Fatal("work was awarded against an escrow that never landed")
	}
	if !hasRejection(st, "before funds are held") {
		t.Errorf("expected a funds-not-held rejection, got %+v", st.Errors)
	}
}

func TestTamperedQuoteHashBreaksAcceptance(t *testing.T) {
	s := newScene(t)
	s.post("buyer", KindRequest, RequestBody{Text: "x", Currency: "USD"})
	terms := s.terms()
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	bogus := strings.Repeat("a", 64)
	s.post("buyer", KindAccept, AcceptBody{QuoteEntry: quote.ID, QuoteHash: bogus, TermsHash: th})

	st := s.fold()
	if st.AcceptEntry != "" {
		t.Fatal("acceptance succeeded against a quote hash that does not match")
	}
	if !hasRejection(st, "quote_hash") {
		t.Errorf("expected a quote_hash rejection, got %+v", st.Errors)
	}
}

func TestSettlementMustMatchTheTermsArithmetic(t *testing.T) {
	s := newScene(t)
	terms, escrow := runToVerdict(t, s, true)
	st := s.fold()

	s.advance(3 * time.Hour)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineDispute, AnchorEntry: st.Deadlines[DeadlineDispute].AnchorEntry,
		FiredAt: s.now.Format(time.RFC3339),
	})
	// An instruction that quietly pays the provider more than the terms allow.
	measures, _, _ := st.Basis()
	want, _ := Evaluate(terms, measures, escrow)
	s.post("exchange", KindSettleInstruction, SettleInstructionBody{
		TermsHash: st.TermsHash, EscrowMinor: escrow,
		Payouts:  []Payout{{Principal: s.pids["provider"], AmountMinor: want.ProviderNet + 5000}},
		FeeMinor: want.FeeMinor, RefundMinor: want.RefundMinor,
	})

	got := s.fold()
	if got.InstructionEntry != "" {
		t.Fatal("a settlement instruction that overpays the provider was accepted")
	}
	if !hasRejection(got, "the terms compute") {
		t.Errorf("expected an arithmetic rejection, got %+v", got.Errors)
	}
}

func TestSettlementBeforeTheDisputeWindowClosesIsRefused(t *testing.T) {
	s := newScene(t)
	terms, escrow := runToVerdict(t, s, true)
	st := s.fold()
	measures, _, _ := st.Basis()
	want, _ := Evaluate(terms, measures, escrow)

	s.post("exchange", KindSettleInstruction, SettleInstructionBody{
		TermsHash: st.TermsHash, EscrowMinor: escrow,
		Payouts:  []Payout{{Principal: s.pids["provider"], AmountMinor: want.ProviderNet}},
		FeeMinor: want.FeeMinor, RefundMinor: want.RefundMinor,
	})
	got := s.fold()
	if got.InstructionEntry != "" {
		t.Fatal("settlement was allowed while the buyer could still dispute")
	}
	if !hasRejection(got, "dispute window") {
		t.Errorf("expected a dispute-window rejection, got %+v", got.Errors)
	}
}

func TestTimeoutFiredEarlyIsRefused(t *testing.T) {
	s := newScene(t)
	runToVerdict(t, s, true)
	st := s.fold()

	// Only ten minutes have passed; the dispute window is two hours.
	s.advance(10 * time.Minute)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineDispute, AnchorEntry: st.Deadlines[DeadlineDispute].AnchorEntry,
		FiredAt: s.now.Format(time.RFC3339),
	})

	got := s.fold()
	if got.Deadlines[DeadlineDispute].Fired {
		t.Fatal("the timekeeper fired a deadline early and the fold accepted it")
	}
	if !hasRejection(got, "early") {
		t.Errorf("expected an early-firing rejection, got %+v", got.Errors)
	}
}

func TestEvidenceDeadlineWithNoEvidenceFailsClosed(t *testing.T) {
	s := newScene(t)
	s.post("buyer", KindRequest, RequestBody{Text: "x", Currency: "USD"})
	s.post("provider", KindBid, BidBody{PriceMinor: 100})
	terms := s.terms()
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	s.post("buyer", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	intent := s.post("buyer", KindEscrowIntent, EscrowIntentBody{
		AmountMinor: escrow, Currency: "USD", Rail: "mock", IdempotencyKey: "k", TermsHash: th,
	})
	s.post("exchange", KindEscrowReceipt, EscrowReceiptBody{
		IntentEntry: intent.ID, State: EscrowHeld, Rail: "mock", ObservedAt: s.now.Format(time.RFC3339),
	})
	award := s.post("exchange", KindAward, AwardBody{Provider: s.pids["provider"], TermsHash: th})

	// The provider never shows up.
	s.advance(5 * time.Hour)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineEvidence, AnchorEntry: award.ID, FiredAt: s.now.Format(time.RFC3339),
	})
	st := s.fold()
	if st.Phase != PhaseSubmitted {
		t.Fatalf("phase = %s, want submitted after the evidence deadline", st.Phase)
	}

	// Nobody verifies either. The verification timeout must resolve against
	// the provider — silence must never pay out.
	s.advance(time.Hour)
	s.post("exchange", KindTimeout, TimeoutBody{
		DeadlineID: DeadlineVerification, AnchorEntry: st.Deadlines[DeadlineVerification].AnchorEntry,
		FiredAt: s.now.Format(time.RFC3339),
	})
	st = s.fold()
	if st.Verdict == nil || st.Verdict.Result != VerdictFail {
		t.Fatalf("verdict = %+v, want a failing timeout verdict", st.Verdict)
	}
	if st.Settlement == nil || st.Settlement.GrossMinor != 0 {
		t.Errorf("settlement = %+v, want nothing paid", st.Settlement)
	}
}

func TestCancelBeforeAwardRefundsTheBuyer(t *testing.T) {
	s := newScene(t)
	s.post("buyer", KindRequest, RequestBody{Text: "x", Currency: "USD"})
	terms := s.terms()
	th, _ := terms.Hash()
	escrow, _ := MaxPayout(terms)
	quote := s.post("exchange", KindQuote, QuoteBody{
		Terms: terms, TermsHash: th, EscrowMinor: escrow,
		ExpiresAt: s.now.Add(time.Minute).Format(time.RFC3339),
	})
	s.post("buyer", KindAccept, AcceptBody{
		QuoteEntry: quote.ID, QuoteHash: mustHash(t, quote), TermsHash: th,
	})
	intent := s.post("buyer", KindEscrowIntent, EscrowIntentBody{
		AmountMinor: escrow, Currency: "USD", Rail: "mock", IdempotencyKey: "k", TermsHash: th,
	})
	s.post("exchange", KindEscrowReceipt, EscrowReceiptBody{
		IntentEntry: intent.ID, State: EscrowHeld, Rail: "mock", ObservedAt: s.now.Format(time.RFC3339),
	})
	s.post("buyer", KindCancel, CancelBody{Reason: "no longer needed"})

	st := s.fold()
	if st.Phase != PhaseClosed || st.Resolution != ResolutionCancelled {
		t.Fatalf("phase=%s resolution=%s", st.Phase, st.Resolution)
	}
	if st.Money != MoneyRefundPending {
		t.Errorf("money = %s, want refund_pending", st.Money)
	}
}

func TestDoubleVerdictIsIgnored(t *testing.T) {
	s := newScene(t)
	runToVerdict(t, s, true)
	first := s.fold().Verdict.Result

	th := s.fold().TermsHash
	s.post("exchange", KindVerdict, VerdictBody{
		Result: VerdictFail, Measures: Observed(true, false), TermsHash: th,
	})
	st := s.fold()
	if st.Verdict.Result != first {
		t.Fatal("a second verdict overwrote the first")
	}
}

func TestRejectionsAreRecordedNotSwallowed(t *testing.T) {
	s := newScene(t)
	s.post("attacker", KindQuote, QuoteBody{})
	st := s.fold()
	if len(st.Errors) == 0 {
		t.Fatal("a refused entry left no trace; the buyer could never be told why")
	}
	if st.Errors[0].Author != s.pids["attacker"] {
		t.Errorf("rejection does not name its author: %+v", st.Errors[0])
	}
}

func TestFoldIsDeterministicAndReplayable(t *testing.T) {
	s := newScene(t)
	terms, escrow := runToVerdict(t, s, true)
	settle(t, s, terms, escrow)

	first, err := json.Marshal(s.fold())
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// Replaying the same entries — as a third party holding only the thread
	// would — must reach byte-identical state every time.
	for i := 0; i < 25; i++ {
		again, err := json.Marshal(Fold(s.log.Thread, s.log.Entries()))
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		if string(again) != string(first) {
			t.Fatalf("fold drifted on replay %d", i)
		}
	}
}

// --- table completeness -----------------------------------------------------

func TestEveryKindHasALane(t *testing.T) {
	for _, k := range AllKinds {
		if _, ok := Lane(k); !ok {
			t.Errorf("kind %s has no lane", k)
		}
	}
}

func TestEveryPhaseIsReachable(t *testing.T) {
	reachable := map[Phase]bool{PhaseDraft: true}
	for changed := true; changed; {
		changed = false
		for _, tr := range Transitions {
			if tr.To == "" || reachable[tr.To] {
				continue
			}
			froms := tr.From
			if len(froms) == 0 {
				froms = AllPhases
			}
			for _, f := range froms {
				if reachable[f] {
					reachable[tr.To], changed = true, true
					break
				}
			}
		}
	}
	for _, p := range AllPhases {
		if !reachable[p] {
			t.Errorf("phase %s is unreachable from draft", p)
		}
	}
}

// TestEveryNonTerminalPhaseCanBeExited guards against an outcome that can
// strand a buyer's money with no way forward.
func TestEveryNonTerminalPhaseCanBeExited(t *testing.T) {
	for _, p := range AllPhases {
		if p == PhaseClosed {
			continue
		}
		var exits int
		for _, tr := range Transitions {
			if tr.To == "" || tr.To == p {
				continue
			}
			for _, f := range tr.From {
				if f == p {
					exits++
				}
			}
		}
		// A phase with no explicit exit must at least be exitable by a
		// deadline the timekeeper can witness.
		if exits == 0 && !exitableByDeadline(p) {
			t.Errorf("phase %s has no exit and no deadline that fires in it", p)
		}
	}
}

func exitableByDeadline(p Phase) bool {
	for _, eff := range deadlineEffects {
		for _, legal := range eff.LegalIn {
			if legal == p && (eff.To != "" || eff.OpensSettlement) {
				return true
			}
		}
	}
	return false
}

func TestPhaseKindMatrixIsExplicit(t *testing.T) {
	// Every (phase, kind) pair either has a transition or is refused. The test
	// exists so that adding a kind without deciding where it is legal fails
	// loudly rather than defaulting to permitted.
	for _, p := range AllPhases {
		for _, k := range AllKinds {
			tr, ok := Lookup(p, k)
			if !ok {
				continue
			}
			if tr.To != "" && !phaseValid(tr.To) {
				t.Errorf("(%s, %s) targets unknown phase %s", p, k, tr.To)
			}
			for _, r := range tr.Roles {
				if !r.Valid() {
					t.Errorf("(%s, %s) permits unknown role %s", p, k, r)
				}
			}
		}
	}
}

func phaseValid(p Phase) bool {
	for _, c := range AllPhases {
		if c == p {
			return true
		}
	}
	return false
}

func hasRejection(s *OutcomeState, substr string) bool {
	for _, e := range s.Errors {
		if strings.Contains(e.Reason, substr) {
			return true
		}
	}
	return false
}

var _ = hex.EncodeToString
