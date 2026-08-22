package api

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// These are the attacks that worked before the marketplace was hardened. Each
// one is here because it succeeded once.

func board(t *testing.T) *Board {
	t.Helper()
	return NewBoard(NewCapabilities())
}

func listReview(t *testing.T, b *Board, job, parent string, seats int) {
	t.Helper()
	if err := b.Post(&Listing{
		Job: job, Parent: parent, Kind: KindReview,
		Title:    "does this photograph show what it claims?",
		PayMinor: 150, Currency: "USD", Slots: seats,
		Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
}

func listTask(t *testing.T, b *Board, job string, seats int) {
	t.Helper()
	if err := b.Post(&Listing{
		Job: job, Kind: KindTask, Title: "go and look at the thing",
		PayMinor: 500, Currency: "USD", Slots: seats,
		Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
}

// One client took all three seats on a panel and alone decided a finding that
// settles real money — in either direction, since a buyer can capture a panel
// for a refund as readily as a provider can capture it for a payout.
func TestPanelCannotBeCapturedByOneClient(t *testing.T) {
	b := board(t)
	listReview(t, b, "panel_1", "", 3)

	// A reviewer cannot ask for a panel by name at all.
	if _, _, err := b.Claim("panel_1", "attacker"); err == nil {
		t.Fatal("a review seat was chosen rather than assigned")
	}
	if _, _, err := b.AssignReview("attacker"); err != nil {
		t.Fatalf("the first seat was refused: %v", err)
	}
	for i := 0; i < 5; i++ {
		if _, _, err := b.AssignReview("attacker"); err == nil {
			t.Fatal("one worker took a second seat on the same panel")
		}
	}
	// Other people are unaffected.
	for _, who := range []string{"second", "third"} {
		if _, _, err := b.AssignReview(who); err != nil {
			t.Fatalf("%s was refused a free seat: %v", who, err)
		}
	}
	if l, _ := b.Get("panel_1"); l.Taken != 3 {
		t.Fatalf("panel seated %d of 3", l.Taken)
	}
}

// The worker who produced the evidence judged it.
func TestWorkerCannotJudgeTheirOwnWork(t *testing.T) {
	b := board(t)
	listTask(t, b, "task_1", 1)
	listReview(t, b, "panel_1", "task_1", 3)

	if _, _, err := b.Claim("task_1", "worker"); err != nil {
		t.Fatal(err)
	}
	// Assignment must skip the panel this worker is conflicted on, and since
	// it is the only one, they get nothing rather than getting it anyway.
	if _, _, err := b.AssignReview("worker"); err == nil {
		t.Fatal("the worker who did the task was assigned to judge it")
	}
	// Somebody who did not do the task may judge it.
	if _, _, err := b.AssignReview("stranger"); err != nil {
		t.Fatalf("an unconflicted reviewer was refused: %v", err)
	}
}

// Abandoning the task must not launder the conflict.
func TestAbandoningWorkDoesNotRestoreEligibility(t *testing.T) {
	b := board(t)
	listTask(t, b, "task_1", 1)
	listReview(t, b, "panel_1", "task_1", 2)

	b.Claim("task_1", "worker")
	b.Release("task_1", "worker")
	if _, _, err := b.AssignReview("worker"); err == nil {
		t.Fatal("dropping the task restored the right to judge it")
	}
}

// And the reverse: a reviewer must not then do the work they judged.
func TestReviewerCannotThenDoTheWork(t *testing.T) {
	b := board(t)
	listTask(t, b, "task_1", 2)
	listReview(t, b, "panel_1", "task_1", 2)

	if _, _, err := b.AssignReview("judge"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("task_1", "judge"); err == nil {
		t.Fatal("a reviewer of a task then took the task")
	}
}

// The per-client limit counted work for all time, so an honest worker was
// locked out after three jobs and never recovered.
func TestFinishingWorkFreesTheWorker(t *testing.T) {
	b := board(t)
	for _, j := range []string{"a", "b", "c", "d", "e"} {
		listTask(t, b, j, 1)
	}
	// A newcomer holds one job at a time: the cost of somebody unknown
	// abandoning three seats falls on three buyers.
	if _, _, err := b.Claim("a", "worker"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.Claim("b", "worker"); err == nil {
		t.Fatal("a brand new worker held two jobs at once")
	}
	// Finishing frees them, and the limit is not a lifetime cap.
	b.Done("a", "worker")
	if _, _, err := b.Claim("b", "worker"); err != nil {
		t.Fatalf("a worker who finished a job could not start another: %v", err)
	}
	b.Done("b", "worker")
	if _, _, err := b.Claim("c", "worker"); err != nil {
		t.Fatalf("the limit is still a lifetime cap: %v", err)
	}
}

// Work that cannot pay must never appear, because somebody would do it.
func TestUnfundedWorkIsNotListed(t *testing.T) {
	b := board(t)
	b.Funded = func(l *Listing) error {
		if l.Job == "broke" {
			return errUnfunded
		}
		return nil
	}
	if err := b.Post(&Listing{
		Job: "broke", Kind: KindTask, Title: "unpayable",
		PayMinor: 500, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}); err == nil {
		t.Fatal("unfunded work was listed")
	}
	if _, ok := b.Get("broke"); ok {
		t.Fatal("unfunded work is on the board")
	}
	if _, _, err := b.Claim("broke", "worker"); err == nil {
		t.Fatal("unfunded work was claimed")
	}
}

var errUnfunded = &unfundedError{}

type unfundedError struct{}

func (e *unfundedError) Error() string { return "no escrow" }

// A review that took no effort must not count as work done.
func TestDegenerateReviewsAreNotAdmissible(t *testing.T) {
	for _, reason := range []string{
		"", "ok", "yes", "asdfasdf", "aaaaaaaaaaaaaaaaaaaaaaaaaa",
		"........................", "sign sign sign sign sign",
		strings.Repeat("ab", 20),
	} {
		r := Review{Reason: reason, Confident: true, Finding: true}
		if r.Admissible() {
			t.Fatalf("%q counted as a review", reason)
		}
	}
	// A real answer passes, whichever way it goes.
	for _, reason := range []string{
		"The sign is clearly visible on the left window, white text on red.",
		"No sign anywhere on this frontage; the windows are papered over.",
	} {
		if !(Review{Reason: reason}).Admissible() {
			t.Fatalf("a substantive review was refused: %q", reason)
		}
	}
}

// Admissibility must never depend on the answer given, or reviewers start
// predicting each other instead of looking at the picture.
func TestAdmissibilityIgnoresTheFinding(t *testing.T) {
	reason := "The sign is clearly visible on the left window, white text on red."
	yes := Review{Reason: reason, Finding: true, Confident: true}
	no := Review{Reason: reason, Finding: false, Confident: true}
	unsure := Review{Reason: reason, Confident: false}
	if !yes.Admissible() || !no.Admissible() || !unsure.Admissible() {
		t.Fatal("an identical reason was admissible for some answers and not others")
	}
}

// Anonymous reviews are work, but money does not leave against them.
func TestAnonymousReviewsAreNotPayable(t *testing.T) {
	reason := "No sign anywhere on this frontage; the windows are papered over."
	r := Review{Reason: reason, AttestedBy: "capability"}
	if !r.Admissible() {
		t.Fatal("a guest's review should still count as work")
	}
	if r.Payable(false) {
		t.Fatal("money would leave against an unverified worker")
	}
	if !r.Payable(true) {
		t.Fatal("a verified worker cannot be paid")
	}
	// A device key is about evidence, not about being paid. An enrolled guest
	// must not become payable just by holding a key.
	keyed := Review{Reason: reason, AttestedBy: "device_key"}
	if keyed.Payable(false) {
		t.Fatal("holding a device key made an unverified worker payable")
	}
}

// Payability must track the account, and admissibility must not.
func TestVerificationGatesPayNotAdmissibility(t *testing.T) {
	r := Review{Reason: "The sign is visible on the left window, white on red."}
	if !r.Admissible() {
		t.Fatal("verification status changed whether the work counted")
	}
	if r.Payable(false) || !r.Payable(true) {
		t.Fatal("payability does not follow verification")
	}
}

// One capability, one submission. Without this every downstream thing that
// counts submissions counts the same person repeatedly.
func TestOneSubmissionPerCapability(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	secret, _, err := b.Claim("task_1", "worker")
	if err != nil {
		t.Fatal(err)
	}
	img := jpegBytes(512)
	up := "/v1/work/task_1/evidence"
	fin := "/v1/work/task_1/submit"

	if code, body := do(t, srv, "POST", up, img, capHeaders("task_1", secret, "POST", up, img)); code != 200 {
		t.Fatalf("upload returned %d: %s", code, body)
	}
	if code, body := do(t, srv, "POST", fin, nil, capHeaders("task_1", secret, "POST", fin, nil)); code != 200 {
		t.Fatalf("submit returned %d: %s", code, body)
	}
	// A finished submission is finished.
	other := jpegBytes(600)
	if code, _ := do(t, srv, "POST", up, other, capHeaders("task_1", secret, "POST", up, other)); code == 200 {
		t.Fatal("a file was added after the submission was finished")
	}
	if code, _ := do(t, srv, "POST", fin, nil, capHeaders("task_1", secret, "POST", fin, nil)); code == 200 {
		t.Fatal("the same capability submitted twice")
	}
}

// Submitting must free the worker's seat, or the concurrent limit is a
// lifetime cap by another route.
func TestSubmittingFreesTheSeat(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	for _, j := range []string{"t1", "t2", "t3", "t4"} {
		postTask(t, b, j, 1)
	}
	sign := registerWorker(t, srv)
	var secrets []string
	p1 := "/v1/workers/claim/t1"
	code, body := do(t, srv, "POST", p1, nil, sign("POST", p1))
	if code != 200 {
		t.Fatalf("claiming t1 returned %d: %s", code, body)
	}
	var got struct{ URL string }
	json.Unmarshal(body, &got)
	secrets = append(secrets, got.URL[strings.Index(got.URL, "#")+1:])

	// A newcomer holds one at a time, so the second is refused until they
	// finish the first.
	p4 := "/v1/workers/claim/t4"
	if code, _ := do(t, srv, "POST", p4, nil, sign("POST", p4)); code == 200 {
		t.Fatal("a second concurrent claim succeeded for a new worker")
	}
	img := jpegBytes(512)
	up := "/v1/work/t1/evidence"
	fin := "/v1/work/t1/submit"
	if code, body := do(t, srv, "POST", up, img, capHeaders("t1", secrets[0], "POST", up, img)); code != 200 {
		t.Fatalf("upload returned %d: %s", code, body)
	}
	if code, body := do(t, srv, "POST", fin, nil, capHeaders("t1", secrets[0], "POST", fin, nil)); code != 200 {
		t.Fatalf("submit returned %d: %s", code, body)
	}
	if code, body := do(t, srv, "POST", p4, nil, sign("POST", p4)); code != 200 {
		t.Fatalf("finishing work did not free a seat: %d %s", code, body)
	}
}

// A submission is not a payment. Nothing that has not been looked at may be
// reported as verified.
func TestUnverifiedSubmissionIsNotPayable(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	secret, _, _ := b.Claim("task_1", "worker")
	img := jpegBytes(512)
	up := "/v1/work/task_1/evidence"
	fin := "/v1/work/task_1/submit"
	if code, _ := do(t, srv, "POST", up, img, capHeaders("task_1", secret, "POST", up, img)); code != 200 {
		t.Fatalf("upload returned %d", code)
	}
	code, body := do(t, srv, "POST", fin, nil, capHeaders("task_1", secret, "POST", fin, nil))
	if code != 200 {
		t.Fatalf("submit returned %d", code)
	}
	if strings.Contains(string(body), `"verified":true`) {
		t.Fatal("an unverified submission reported itself verified")
	}
	if !strings.Contains(string(body), "payment follows verification") {
		t.Fatalf("the worker was not told payment depends on verification: %s", body)
	}
}

// Assignment must not be a way to choose a panel by trying repeatedly. A
// worker conflicted on the only open panel gets nothing, not a retry loop that
// eventually hands it over.
func TestAssignmentNeverYieldsAConflictedPanel(t *testing.T) {
	b := board(t)
	listTask(t, b, "task_1", 1)
	listReview(t, b, "panel_1", "task_1", 5)
	b.Claim("task_1", "worker")

	for i := 0; i < 20; i++ {
		if _, l, err := b.AssignReview("worker"); err == nil {
			t.Fatalf("attempt %d assigned the conflicted panel %s", i, l.Job)
		}
	}
}

// Assignment prefers the panel closest to expiry, so seats fill in the order
// they would otherwise be lost.
func TestAssignmentTakesTheMostUrgentPanel(t *testing.T) {
	b := board(t)
	if err := b.Post(&Listing{
		Job: "later", Kind: KindReview, Title: "not urgent", PayMinor: 150,
		Currency: "USD", Slots: 1, Expires: time.Now().Add(4 * time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	if err := b.Post(&Listing{
		Job: "sooner", Kind: KindReview, Title: "urgent", PayMinor: 150,
		Currency: "USD", Slots: 1, Expires: time.Now().Add(10 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	_, l, err := b.AssignReview("worker")
	if err != nil {
		t.Fatal(err)
	}
	if l.Job != "sooner" {
		t.Fatalf("assigned %s while a panel expiring sooner was open", l.Job)
	}
}

// The board must not publish which panels are open. Listing them lets somebody
// wait for a particular one and take it, which is choosing by another route.
func TestBoardDoesNotListIndividualPanels(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	listReview(t, b, "panel_secret_name", "", 2)
	postTask(t, b, "task_1", 1)

	_, body := do(t, srv, "GET", "/v1/board", nil, nil)
	if strings.Contains(string(body), "panel_secret_name") {
		t.Fatalf("the board named an open panel: %s", body)
	}
	if !strings.Contains(string(body), "reviews_waiting") {
		t.Fatal("the board does not say how much verification work exists")
	}
	if !strings.Contains(string(body), "task_1") {
		t.Fatal("tasks should still be listed; choosing where to walk is the job")
	}
}

// Taking work at all now requires a worker identity. There must be no
// unauthenticated route left that hands out a capability.
func TestWorkCannotBeTakenAnonymously(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	listReview(t, b, "panel_1", "", 1)

	for _, p := range []string{
		"/v1/board/task_1/claim",
		"/v1/workers/claim/task_1",
		"/v1/workers/assign",
	} {
		if code, _ := do(t, srv, "POST", p, nil, nil); code == 200 {
			t.Fatalf("%s handed out work with no identity", p)
		}
	}
}

// Nobody works without an account. The guest tier is gone: work nobody can be
// paid for is work nobody has a reason to do, and an identity anybody can mint
// for free bounds none of the rules above.
func TestWorkRequiresAnAccount(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	listReview(t, b, "panel_1", "", 1)

	// No credential at all.
	for _, p := range []string{
		"/v1/workers", "/v1/workers/assign", "/v1/workers/claim/task_1",
	} {
		if code, _ := do(t, srv, "POST", p, nil, nil); code == 200 {
			t.Fatalf("%s worked with no account", p)
		}
	}
	// A forged token is no better.
	bad := map[string]string{"Authorization": "Bearer not-a-token"}
	if code, _ := do(t, srv, "POST", "/v1/workers/claim/task_1", nil, bad); code == 200 {
		t.Fatal("a forged token took work")
	}
}

// A signed-in worker can take work and is payable, because that is the whole
// reason to sign in.
func TestSignedInWorkerIsPayable(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	sign := registerWorker(t, srv)

	p := "/v1/workers/claim/task_1"
	code, body := do(t, srv, "POST", p, nil, sign("POST", p))
	if code != 200 {
		t.Fatalf("a signed-in worker could not take a task: %d %s", code, body)
	}
	if !strings.Contains(string(body), `"payable":true`) {
		t.Fatalf("a signed-in worker was reported unpayable: %s", body)
	}
}

// Telling somebody to act and giving them no way to is worse than telling them
// to wait. When no payment rail exists the console must say so, not invite
// them to connect one.
func TestPayoutStateDistinguishesOursFromTheirs(t *testing.T) {
	// Nothing to connect to.
	unavailable := PayoutState{Unavailable: true}
	if unavailable.Connected || unavailable.Ready {
		t.Fatal("an unavailable rail reported itself connected")
	}
	// Their move to make.
	theirs := PayoutState{}
	if theirs.Unavailable {
		t.Fatal("a missing account was reported as our problem")
	}
}

// A bid that disappears once placed reads as a bid that was lost.
func TestOpenBidCarriesItsOwnStatus(t *testing.T) {
	b := OpenBid{
		Job: "lawn", Title: "mow the lawn", AmountMinor: 4500, Currency: "USD",
		Status: "open — you can still change it", Placed: time.Now(),
	}
	if b.Status == "" {
		t.Fatal("a bid with no status leaves the worker guessing")
	}
	// The ceiling must never appear here either.
	raw, _ := json.Marshal(b)
	if strings.Contains(string(raw), "max_bid") {
		t.Fatalf("the ceiling leaked into a worker's own bid view: %s", raw)
	}
}
