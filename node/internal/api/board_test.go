package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newBoardServer(t *testing.T) (*Board, *WorkServer, *httptest.Server, map[string][]byte) {
	t.Helper()
	caps := NewCapabilities()
	b := NewBoard(caps)
	blobs := map[string][]byte{}
	ws := &WorkServer{
		Caps: caps, Board: b,
		Store: func(job string, a Artifact, data []byte) error {
			blobs[a.SHA256] = data
			return nil
		},
		Submit: func(sub Submission) (Submission, error) { return sub, nil },
	}
	mux := http.NewServeMux()
	b.Register(mux)
	ws.Register(mux)
	rs := &ReviewServer{Caps: caps, Reviews: NewReviewStore(), Secrets: b.Secrets}
	rs.Register(mux)
	workers := NewWorkers()
	// A stand-in identity provider, so tests exercise the real verification
	// path rather than a weakened one.
	workers.Cognito, testSigner = newTestIssuer(t)
	wk := &WorkerServer{Workers: workers, Board: b}
	wk.Register(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return b, ws, srv, blobs
}

// testSigner mints identity tokens for the stand-in issuer installed by
// newBoardServer.
var testSigner func(subject string) string

// registerWorker signs somebody in and returns a function that authenticates
// requests as them. Signing in is now the only way to take work.
func registerWorker(t *testing.T, srv *httptest.Server) func(method, path string) map[string]string {
	t.Helper()
	if testSigner == nil {
		t.Fatal("no test issuer installed")
	}
	sub := "worker-" + t.Name() + "-" + time.Now().Format("150405.000000000")
	token := testSigner(sub)
	hdr := map[string]string{"Authorization": "Bearer " + token}
	code, body := do(t, srv, "POST", "/v1/workers", nil, hdr)
	if code != http.StatusOK {
		t.Fatalf("signing in returned %d: %s", code, body)
	}
	return func(method, path string) map[string]string {
		return map[string]string{"Authorization": "Bearer " + token}
	}
}

func postTask(t *testing.T, b *Board, job string, slots int) {
	t.Helper()
	if err := b.Post(&Listing{
		Job: job, Kind: KindTask, Title: "a FOR LEASE sign is up at 742 Evergreen",
		Where: "742 Evergreen Rd", PayMinor: 500, BonusMinor: 1800,
		Currency: "USD", Slots: slots, Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
}

// jpeg builds a minimal file that sniffs as a JPEG.
func jpegBytes(n int) []byte {
	b := make([]byte, n)
	b[0], b[1], b[2] = 0xFF, 0xD8, 0xFF
	return b
}

func capHeaders(job, secret, method, path string, body []byte) map[string]string {
	ts := time.Now().UTC().Format(time.RFC3339)
	sum := sha256.Sum256(body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(method + "\n" + path + "\n" + ts + "\n" + hex.EncodeToString(sum[:])))
	return map[string]string{
		"X-Lamdis-Timestamp":  ts,
		"X-Lamdis-Capability": job + "." + hex.EncodeToString(mac.Sum(nil)),
	}
}

func do(t *testing.T, srv *httptest.Server, method, path string, body []byte, hdr map[string]string) (int, []byte) {
	t.Helper()
	var rdr *bytes.Reader
	if body == nil {
		rdr = bytes.NewReader(nil)
	} else {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, srv.URL+path, rdr)
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	buf := new(bytes.Buffer)
	buf.ReadFrom(res.Body)
	return res.StatusCode, buf.Bytes()
}

// The public board must show what work exists without leaking anything that
// would let somebody fake having done it.
func TestBoardListingHidesTheChallengeCode(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 2)

	code, body := do(t, srv, "GET", "/v1/board", nil, nil)
	if code != http.StatusOK {
		t.Fatalf("board returned %d", code)
	}
	var out struct{ Work []map[string]any }
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatal(err)
	}
	if len(out.Work) != 1 {
		t.Fatalf("listed %d items", len(out.Work))
	}
	for _, forbidden := range []string{"challenge", "Challenge", "secret"} {
		if strings.Contains(string(body), forbidden) {
			t.Fatalf("the public board exposed %q: %s", forbidden, body)
		}
	}
	if out.Work[0]["title"] == "" {
		t.Fatal("the listing has no title")
	}
}

// Claiming is what turns a stranger into somebody who can do the work.
func TestClaimMintsAWorkingCapability(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)

	sign := registerWorker(t, srv)
	p0 := "/v1/workers/claim/task_1"
	code, body := do(t, srv, "POST", p0, nil, sign("POST", p0))
	if code != http.StatusOK {
		t.Fatalf("claim returned %d: %s", code, body)
	}
	var claim struct{ Job, Kind, URL string }
	json.Unmarshal(body, &claim)
	if claim.Kind != KindTask || !strings.HasPrefix(claim.URL, "/w/task_1#") {
		t.Fatalf("unexpected claim %+v", claim)
	}
	secret := claim.URL[strings.Index(claim.URL, "#")+1:]

	// The brief is reachable with that capability, and carries the challenge.
	path := "/v1/work/task_1"
	code, body = do(t, srv, "GET", path, nil, capHeaders("task_1", secret, "GET", path, nil))
	if code != http.StatusOK {
		t.Fatalf("brief returned %d: %s", code, body)
	}
	var brief workBrief
	json.Unmarshal(body, &brief)
	if len(brief.Challenge) != 6 {
		t.Fatalf("challenge %q is not a six-character code", brief.Challenge)
	}
	if brief.PayMinor != 500 {
		t.Fatalf("brief pays %d", brief.PayMinor)
	}
}

// Two claimants of the same task must get different codes, or one can submit
// the other's photograph.
func TestChallengeCodesDifferPerClaimant(t *testing.T) {
	b, _, _, _ := newBoardServer(t)
	postTask(t, b, "task_1", 2)

	s1, _, err := b.Claim("task_1", "client-a")
	if err != nil {
		t.Fatal(err)
	}
	s2, _, err := b.Claim("task_1", "client-b")
	if err != nil {
		t.Fatal(err)
	}
	c1, _ := b.Caps.Lookup(s1)
	c2, _ := b.Caps.Lookup(s2)
	if ChallengeFor("task_1", c1) == ChallengeFor("task_1", c2) {
		t.Fatal("two claimants were given the same challenge code")
	}
}

// A listing with one slot may be claimed once.
func TestSlotsAreFinite(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)

	p0 := "/v1/workers/claim/task_1"
	first := registerWorker(t, srv)
	if code, body := do(t, srv, "POST", p0, nil, first("POST", p0)); code != http.StatusOK {
		t.Fatalf("first claim returned %d: %s", code, body)
	}
	// A different person entirely, so this is the seat running out rather
	// than one worker being told they already hold it.
	second := registerWorker(t, srv)
	code, _ := do(t, srv, "POST", p0, nil, second("POST", p0))
	if code == http.StatusOK {
		t.Fatal("a one-slot task was claimed twice")
	}
	// And it disappears from the board rather than teasing people.
	_, body := do(t, srv, "GET", "/v1/board", nil, nil)
	if strings.Contains(string(body), "task_1") {
		t.Fatal("a fully claimed task is still listed as open")
	}
}

// One claimant may not hoard the whole board.
func TestOneClientCannotClaimEverything(t *testing.T) {
	b, _, _, _ := newBoardServer(t)
	for _, j := range []string{"t1", "t2", "t3", "t4", "t5"} {
		postTask(t, b, j, 1)
	}
	got := 0
	for _, j := range []string{"t1", "t2", "t3", "t4", "t5"} {
		if _, _, err := b.Claim(j, "greedy"); err == nil {
			got++
		}
	}
	// An unknown worker gets one seat, not three. Concurrency is earned by
	// finishing work, because an abandoned seat costs a buyer a day.
	if got != 1 {
		t.Fatalf("an unknown client claimed %d tasks at once", got)
	}
	// Somebody else is unaffected.
	if _, _, err := b.Claim("t4", "somebody-else"); err != nil {
		t.Fatalf("a second worker was blocked by the first's limit: %v", err)
	}
}

// The crown jewel, in board form: a capability for one kind of work must not
// reach the other kind's routes.
func TestCapabilitiesDoNotCrossKinds(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	if err := b.Post(&Listing{
		Job: "panel_1", Kind: KindReview, Title: "does this show a FOR LEASE sign?",
		PayMinor: 150, Currency: "USD", Slots: 1, Expires: time.Now().Add(time.Hour),
	}); err != nil {
		t.Fatal(err)
	}
	taskSecret, _, err := b.Claim("task_1", "worker")
	if err != nil {
		t.Fatal(err)
	}
	reviewSecret, _, err := b.AssignReview("reviewer")
	if err != nil {
		t.Fatal(err)
	}

	img := jpegBytes(64)

	// A review capability must not be able to submit evidence.
	p := "/v1/work/panel_1/evidence"
	code, _ := do(t, srv, "POST", p, img, capHeaders("panel_1", reviewSecret, "POST", p, img))
	if code == http.StatusOK {
		t.Fatal("a review capability uploaded evidence")
	}

	// A task capability must not be able to cast a review.
	rp := "/v1/claims/task_1/review"
	vote := []byte(`{"finding":true,"confident":true,"reason":"looks right"}`)
	code, _ = do(t, srv, "POST", rp, vote, capHeaders("task_1", taskSecret, "POST", rp, vote))
	if code == http.StatusOK {
		t.Fatal("a task capability cast a review")
	}

	// And a capability for one job must not reach another job.
	other := "/v1/work/task_1"
	code, _ = do(t, srv, "GET", other, nil, capHeaders("task_1", reviewSecret, "GET", other, nil))
	if code == http.StatusOK {
		t.Fatal("a capability for one job read another job's brief")
	}
}

// The upload path stores the exact bytes it was given.
func TestUploadStoresOriginalBytes(t *testing.T) {
	b, _, srv, blobs := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	secret, _, err := b.Claim("task_1", "worker")
	if err != nil {
		t.Fatal(err)
	}
	img := jpegBytes(2048)
	for i := 3; i < len(img); i++ {
		img[i] = byte(i % 251)
	}
	p := "/v1/work/task_1/evidence"
	code, body := do(t, srv, "POST", p, img, capHeaders("task_1", secret, "POST", p, img))
	if code != http.StatusOK {
		t.Fatalf("upload returned %d: %s", code, body)
	}
	var out struct {
		SHA256 string `json:"sha256"`
		Bytes  int    `json:"bytes"`
		Type   string `json:"type"`
	}
	json.Unmarshal(body, &out)
	if out.Bytes != len(img) || out.Type != "image/jpeg" {
		t.Fatalf("stored %d bytes as %q", out.Bytes, out.Type)
	}
	stored, ok := blobs[out.SHA256]
	if !ok {
		t.Fatal("the blob was not stored under its reported hash")
	}
	if !bytes.Equal(stored, img) {
		t.Fatal("the stored bytes differ from what was uploaded")
	}
	sum := sha256.Sum256(img)
	if out.SHA256 != hex.EncodeToString(sum[:]) {
		t.Fatal("the reported hash does not describe the uploaded file")
	}
}

// An upload the verifier could not read, or could execute, is refused.
func TestUploadRejectsUnknownFormats(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)
	secret, _, _ := b.Claim("task_1", "worker")

	for name, payload := range map[string][]byte{
		"html":  []byte("<html><script>alert(1)</script></html>"),
		"svg":   []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>`),
		"empty": {},
		"text":  []byte("just a note saying trust me"),
	} {
		p := "/v1/work/task_1/evidence"
		code, _ := do(t, srv, "POST", p, payload, capHeaders("task_1", secret, "POST", p, payload))
		if code == http.StatusOK {
			t.Fatalf("%s was accepted as evidence", name)
		}
	}
}

// An unclaimed job has no capability, so its routes are simply unreachable.
func TestUnclaimedWorkIsUnreachable(t *testing.T) {
	b, _, srv, _ := newBoardServer(t)
	postTask(t, b, "task_1", 1)

	p := "/v1/work/task_1"
	code, _ := do(t, srv, "GET", p, nil, capHeaders("task_1", "made-up-secret", "GET", p, nil))
	if code == http.StatusOK {
		t.Fatal("an invented secret read the brief")
	}
	code, _ = do(t, srv, "GET", p, nil, nil)
	if code == http.StatusOK {
		t.Fatal("the brief was readable with no capability at all")
	}
}

// Expired work leaves the board.
func TestExpiredWorkIsNotClaimable(t *testing.T) {
	b, _, _, _ := newBoardServer(t)
	if err := b.Post(&Listing{
		Job: "old", Kind: KindTask, Title: "yesterday's job",
		PayMinor: 100, Currency: "USD", Slots: 5,
		Expires: time.Now().Add(-time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	if len(b.Listings()) != 0 {
		t.Fatal("expired work is still listed")
	}
	if _, _, err := b.Claim("old", "worker"); err == nil {
		t.Fatal("expired work was claimed")
	}
}
