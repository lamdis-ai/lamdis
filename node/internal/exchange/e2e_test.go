package exchange

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// The whole loop, over HTTP, on a server built the way the binary builds one.
//
// Every other test constructs the component it exercises and hands it its
// dependencies, which is why the deployed service could be missing its ledger,
// its accounts and its verifier while the suite stayed green. This one starts
// the real thing and follows the money: a buyer funds a balance, a job is
// posted and escrowed, a worker signs in and takes it, uploads a photograph
// carrying the code they were privately given, and is credited.

type e2e struct {
	t   *testing.T
	srv *Server
	h   *httptest.Server
}

func newE2E(t *testing.T, seesCode string) *e2e {
	t.Helper()
	key := ed25519.NewKeyFromSeed(make([]byte, ed25519.SeedSize))
	s, err := Open(key, "http://example.test", Options{
		DataDir: t.TempDir(),
		Vision:  &scriptedVision{text: seesCode},
	})
	if err != nil {
		t.Fatal(err)
	}
	h := httptest.NewServer(s.Handler())
	t.Cleanup(h.Close)
	return &e2e{t: t, srv: s, h: h}
}

// scriptedVision reads back whatever it was told the picture says.
type scriptedVision struct{ text string }

func (v *scriptedVision) ID() string { return "scripted" }
func (v *scriptedVision) Describe(ctx context.Context, img []byte) (*vision.Observation, vision.Usage, error) {
	obs := &vision.Observation{Scene: "a building"}
	obs.TextVisible = append(obs.TextVisible, struct {
		Text       string  `json:"text"`
		Location   string  `json:"location"`
		Legibility float64 `json:"legibility"`
	}{Text: v.text, Legibility: 0.95})
	return obs, vision.Usage{}, nil
}
func (v *scriptedVision) Adjudicate(ctx context.Context, p string, o *vision.Observation) (*vision.Adjudication, vision.Usage, error) {
	return &vision.Adjudication{}, vision.Usage{}, nil
}

func (e *e2e) do(method, path string, body []byte, hdr map[string]string) (int, []byte) {
	e.t.Helper()
	req, err := http.NewRequest(method, e.h.URL+path, bytes.NewReader(body))
	if err != nil {
		e.t.Fatal(err)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	buf := new(bytes.Buffer)
	buf.ReadFrom(res.Body)
	return res.StatusCode, buf.Bytes()
}

// capHdr signs a capability request the way the worker's browser does.
func capHdr(job, secret, method, path string, body []byte) map[string]string {
	ts := time.Now().UTC().Format(time.RFC3339)
	sum := sha256.Sum256(body)
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(method + "\n" + path + "\n" + ts + "\n" + hex.EncodeToString(sum[:])))
	return map[string]string{
		"X-Lamdis-Timestamp":  ts,
		"X-Lamdis-Capability": job + "." + hex.EncodeToString(m.Sum(nil)),
	}
}

func photo(t *testing.T, seed int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 96, 96))
	for y := 0; y < 96; y++ {
		for x := 0; x < 96; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x*2 + seed), G: uint8(y * 2), B: 90, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// The path everything else exists to serve.
func TestEndToEndAJobIsPostedWorkedAndPaid(t *testing.T) {
	ctx := context.Background()

	// The worker will be told a code; the model will read that code back.
	// Set up in two steps because the code is issued at claim time.
	e := newE2E(t, "PLACEHOLDER")

	const buyer, worker = "buyer-1", "worker-1"
	if _, err := e.srv.Ledger.Topup(ctx, "t1", buyer, 50000, "USD", ""); err != nil {
		t.Fatal(err)
	}

	// A job, escrowed before it is listed.
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve,
		Title:    "a FOR LEASE sign is displayed at 742 Evergreen Rd",
		PayMinor: 500, BonusMinor: 1800, Currency: "USD", Slots: 1,
		Expires: time.Now().Add(time.Hour),
	}
	if _, err := e.srv.Ledger.Hold(ctx, "h1", l.Job, buyer, MaxPayoutFor(l), "USD"); err != nil {
		t.Fatal(err)
	}
	if err := e.srv.Board.Post(l); err != nil {
		t.Fatal(err)
	}
	e.srv.mu.Lock()
	e.srv.buyers[l.Job] = buyer
	e.srv.mu.Unlock()

	// A worker takes it and is privately given a code.
	secret, _, err := e.srv.Board.Claim("obs_1", worker)
	if err != nil {
		t.Fatal(err)
	}
	cap, ok := e.srv.Caps.Lookup(secret)
	if !ok {
		t.Fatal("the claim produced no capability")
	}
	code := api.ChallengeFor("obs_1", cap)
	if len(code) != 6 {
		t.Fatalf("challenge %q", code)
	}
	// The photograph they take contains that code.
	e.srv.Verify = (&SubmissionVerifier{Vision: &scriptedVision{text: code}}).Verify

	// The brief is readable with the capability, and carries the code.
	p := "/v1/work/obs_1"
	code2, body := e.do("GET", p, nil, capHdr("obs_1", secret, "GET", p, nil))
	if code2 != 200 {
		t.Fatalf("brief: %d %s", code2, body)
	}

	// Upload, then submit.
	img := photo(t, 1)
	up := "/v1/work/obs_1/evidence"
	if c, b := e.do("POST", up, img, capHdr("obs_1", secret, "POST", up, img)); c != 200 {
		t.Fatalf("upload: %d %s", c, b)
	}
	fin := "/v1/work/obs_1/submit"
	c, b := e.do("POST", fin, nil, capHdr("obs_1", secret, "POST", fin, nil))
	if c != 200 {
		t.Fatalf("submit: %d %s", c, b)
	}
	var res struct {
		Verified bool `json:"verified"`
		Files    int  `json:"files"`
	}
	json.Unmarshal(b, &res)
	if !res.Verified {
		t.Fatalf("a photograph carrying the issued code was not accepted: %s", b)
	}

	// And the money moved. This is the assertion the whole system is for.
	pay, _ := e.srv.Ledger.Balance(ctx, ledger.PayableOf(worker), "USD")
	if pay <= 0 {
		t.Fatal("the worker was credited nothing for accepted work")
	}
	// 500 base + 1800 bonus is only paid on a positive finding; a bare
	// acceptance earns the base fee less the exchange's cut.
	if pay != net(500) {
		t.Fatalf("worker credited %d, want %d", pay, net(500))
	}
	// The unearned part went back rather than sitting in escrow.
	if held, _ := e.srv.Ledger.Held(ctx, "obs_1", "USD"); held != 0 {
		t.Fatalf("%d is still stuck in escrow", held)
	}
	if err := e.srv.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}

// A photograph that does not carry the code is not evidence of this job, and
// must not be paid for.
func TestEndToEndWrongCodeIsNotPaid(t *testing.T) {
	ctx := context.Background()
	e := newE2E(t, "NOTTHECODE")

	const buyer, worker = "buyer-1", "worker-1"
	e.srv.Ledger.Topup(ctx, "t1", buyer, 50000, "USD", "")
	l := &api.Listing{
		Job: "obs_1", Kind: api.KindObserve, Title: "is the sign up",
		PayMinor: 500, Currency: "USD", Slots: 1, Expires: time.Now().Add(time.Hour),
	}
	e.srv.Ledger.Hold(ctx, "h1", l.Job, buyer, MaxPayoutFor(l), "USD")
	e.srv.Board.Post(l)
	e.srv.mu.Lock()
	e.srv.buyers[l.Job] = buyer
	e.srv.mu.Unlock()

	secret, _, err := e.srv.Board.Claim("obs_1", worker)
	if err != nil {
		t.Fatal(err)
	}
	img := photo(t, 2)
	up := "/v1/work/obs_1/evidence"
	e.do("POST", up, img, capHdr("obs_1", secret, "POST", up, img))
	fin := "/v1/work/obs_1/submit"
	c, b := e.do("POST", fin, nil, capHdr("obs_1", secret, "POST", fin, nil))
	if c == 200 {
		t.Fatalf("a photo without the code was accepted: %s", b)
	}
	if pay, _ := e.srv.Ledger.Balance(ctx, ledger.PayableOf(worker), "USD"); pay != 0 {
		t.Fatalf("credited %d for evidence that did not carry the code", pay)
	}
	// The buyer's money is untouched and still available for somebody else.
	if held, _ := e.srv.Ledger.Held(ctx, "obs_1", "USD"); held != MaxPayoutFor(l) {
		t.Fatalf("escrow moved on a rejected submission: %d", held)
	}
	if err := e.srv.Ledger.Audit(ctx); err != nil {
		t.Fatal(err)
	}
}
