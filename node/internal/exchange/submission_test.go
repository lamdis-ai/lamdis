package exchange

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/media"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/verify"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/vision"
)

// fakeVision transcribes whatever text it was configured to see.
type fakeVision struct {
	text []string
	err  error
}

func (f *fakeVision) ID() string { return "fake" }
func (f *fakeVision) Describe(ctx context.Context, img []byte) (*vision.Observation, vision.Usage, error) {
	if f.err != nil {
		return nil, vision.Usage{}, f.err
	}
	obs := &vision.Observation{Scene: "a street"}
	for _, t := range f.text {
		obs.TextVisible = append(obs.TextVisible, struct {
			Text       string  `json:"text"`
			Location   string  `json:"location"`
			Legibility float64 `json:"legibility"`
		}{Text: t, Location: "centre", Legibility: 0.9})
	}
	return obs, vision.Usage{}, nil
}
func (f *fakeVision) Adjudicate(ctx context.Context, p string, o *vision.Observation) (*vision.Adjudication, vision.Usage, error) {
	return &vision.Adjudication{}, vision.Usage{}, nil
}

func sub(challenge string) api.Submission { return subBy("worker-1", challenge) }

func subBy(holder, challenge string) api.Submission {
	return api.Submission{
		Job: "task_1", Challenge: challenge,
		AttestedBy: "capability", Holder: holder, At: time.Now(),
	}
}

// withImage attaches one still to a submission and returns a blob reader for
// it, which is how the verifier is handed bytes now.
func withImage(s api.Submission, img []byte) (api.Submission, func(string) ([]byte, bool)) {
	sum := sha256.Sum256(img)
	sha := hex.EncodeToString(sum[:])
	s.Artifacts = []api.Artifact{{
		SHA256: sha, Mime: "image/jpeg", Bytes: len(img), Kind: media.KindImage,
	}}
	return s, func(want string) ([]byte, bool) { return img, want == sha }
}

// The whole point of the challenge: a photograph without it proves nothing
// about when or where it was taken, so it cannot be paid for.
func TestChallengeMustAppearInTheImage(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{Vision: &fakeVision{text: []string{"FOR LEASE", "555-0100"}}}
	got, err := v.Verify(withImage(sub("MRCPFJ"), img))
	if err == nil {
		t.Fatal("a photograph without the challenge code was accepted")
	}
	if got.Verified {
		t.Fatal("it was marked verified anyway")
	}
}

func TestChallengePresentIsVerified(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{Vision: &fakeVision{text: []string{"FOR LEASE", "MRCPFJ"}}}
	got, err := v.Verify(withImage(sub("MRCPFJ"), img))
	if err != nil {
		t.Fatalf("a correct submission was refused: %v", err)
	}
	if !got.Verified {
		t.Fatal("a correct submission was not marked verified")
	}
}

// A handwritten code read back by OCR should still match. Crockford base32
// excludes the ambiguous letters for exactly this reason.
func TestChallengeToleratesTranscriptionConfusion(t *testing.T) {
	img := testJPEG(t)
	// The code contains a zero; the describer read it as the letter O, and
	// added spaces around the characters.
	v := &SubmissionVerifier{Vision: &fakeVision{text: []string{"code: MRC PFO"}}}
	got, err := v.Verify(withImage(sub("MRCPF0"), img))
	if err != nil {
		t.Fatalf("an O read for a 0 broke the match: %v", err)
	}
	if !got.Verified {
		t.Fatal("not verified")
	}
}

// Nothing has looked at it, so it is not payable — and it must not error
// either, because the submission itself was fine.
func TestWithoutVisionNothingIsVerified(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{}
	got, err := v.Verify(withImage(sub("MRCPFJ"), img))
	if err != nil {
		t.Fatalf("a valid upload was rejected with no verifier: %v", err)
	}
	if got.Verified {
		t.Fatal("a submission nobody looked at was marked verified")
	}
}

// On an open board the cheapest fraud is submitting one photograph everywhere.
func TestReusedImageIsRefused(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{
		Vision: &fakeVision{text: []string{"MRCPFJ"}},
		Corpus: verify.NewCorpus(),
	}
	// Two different workers submitting the same photograph — one of them
	// found it somewhere rather than taking it.
	if _, err := v.Verify(withImage(subBy("worker-1", "MRCPFJ"), img)); err != nil {
		t.Fatalf("first submission: %v", err)
	}
	if _, err := v.Verify(withImage(subBy("worker-2", "MRCPFJ"), img)); err == nil {
		t.Fatal("a second worker submitted the same image and was accepted")
	}
}

// A model outage must not silently pass work through.
func TestVisionFailureDoesNotVerify(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{Vision: &fakeVision{err: context.DeadlineExceeded}}
	got, err := v.Verify(withImage(sub("MRCPFJ"), img))
	if err == nil {
		t.Fatal("a failed check reported success")
	}
	if got.Verified {
		t.Fatal("a failed check marked the submission verified")
	}
}

// A worker cannot be paid for an escrow that could not cover the work.
func TestMaxPayoutCoversEverySeatAndBonus(t *testing.T) {
	l := &api.Listing{PayMinor: 500, BonusMinor: 1800, Slots: 3}
	if got := MaxPayoutFor(l); got != (500+1800)*3 {
		t.Fatalf("escrow requirement %d would leave the last worker unpaid", got)
	}
}

// testJPEG builds a real, decodable image. The verifier hashes it
// perceptually, so a handful of magic bytes will not do.
func testJPEG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 4), G: uint8(y * 4), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// A job that names a place must refuse evidence taken somewhere else. This is
// what makes "go and do this at this address" checkable rather than a promise.
func TestEvidenceOutsideTheAreaIsRefused(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{Vision: &fakeVision{text: []string{"MRCPFJ"}}}

	// Detroit, with a 500 m fence.
	s, blob := withImage(sub("MRCPFJ"), img)
	s.LatE7, s.LonE7, s.RadiusM = 423312000, -830456000, 500

	// A photo whose metadata puts it in Chicago.
	s.Artifacts[0].HasGeo = true
	s.Artifacts[0].LatE7, s.Artifacts[0].LonE7 = 418781000, -876298000
	if _, err := v.Verify(s, blob); err == nil {
		t.Fatal("evidence from another city satisfied a geofenced job")
	}

	// The same shot, actually at the address.
	s2, blob2 := withImage(sub("MRCPFJ"), img)
	s2.LatE7, s2.LonE7, s2.RadiusM = 423312000, -830456000, 500
	s2.Artifacts[0].HasGeo = true
	s2.Artifacts[0].LatE7, s2.Artifacts[0].LonE7 = 423313000, -830457000
	got, err := v.Verify(s2, blob2)
	if err != nil {
		t.Fatalf("evidence at the right place was refused: %v", err)
	}
	if !got.Verified {
		t.Fatal("not verified")
	}
}

// A photo with no location must not be treated as a photo from the wrong
// place. Phones strip metadata constantly, and refusing everyone whose camera
// did would reject mostly honest work.
func TestMissingLocationIsNotAWrongLocation(t *testing.T) {
	img := testJPEG(t)
	v := &SubmissionVerifier{Vision: &fakeVision{text: []string{"MRCPFJ"}}}
	s, blob := withImage(sub("MRCPFJ"), img)
	s.LatE7, s.LonE7, s.RadiusM = 423312000, -830456000, 500
	// No HasGeo on the artifact at all.
	got, err := v.Verify(s, blob)
	if err != nil {
		t.Fatalf("a photo with no location was rejected: %v", err)
	}
	if !got.Verified {
		t.Fatal("not verified")
	}
}

// Several angles of the same scene are one submission, and the code needs to
// be legible in only one of them.
func TestChallengeInAnyOneArtifactIsEnough(t *testing.T) {
	a, b := testJPEG(t), testJPEGVariant(t)
	seen := map[string][]byte{}
	mk := func(data []byte) api.Artifact {
		sum := sha256.Sum256(data)
		sha := hex.EncodeToString(sum[:])
		seen[sha] = data
		return api.Artifact{SHA256: sha, Mime: "image/jpeg",
			Bytes: len(data), Kind: media.KindImage}
	}
	s := sub("MRCPFJ")
	s.Artifacts = []api.Artifact{mk(a), mk(b)}
	blob := func(sha string) ([]byte, bool) { d, ok := seen[sha]; return d, ok }

	// The describer reads the code only in the second image.
	calls := 0
	v := &SubmissionVerifier{Vision: &visionPerCall{texts: [][]string{
		{"a wall"}, {"MRCPFJ"},
	}, n: &calls}}
	got, err := v.Verify(s, blob)
	if err != nil {
		t.Fatalf("a submission whose second photo carried the code was refused: %v", err)
	}
	if !got.Verified {
		t.Fatal("not verified")
	}
}

// visionPerCall returns different text on each call.
type visionPerCall struct {
	texts [][]string
	n     *int
}

func (v *visionPerCall) ID() string { return "per-call" }
func (v *visionPerCall) Describe(ctx context.Context, img []byte) (*vision.Observation, vision.Usage, error) {
	i := *v.n
	*v.n++
	if i >= len(v.texts) {
		i = len(v.texts) - 1
	}
	obs := &vision.Observation{Scene: "x"}
	for _, t := range v.texts[i] {
		obs.TextVisible = append(obs.TextVisible, struct {
			Text       string  `json:"text"`
			Location   string  `json:"location"`
			Legibility float64 `json:"legibility"`
		}{Text: t, Legibility: 0.9})
	}
	return obs, vision.Usage{}, nil
}
func (v *visionPerCall) Adjudicate(ctx context.Context, p string, o *vision.Observation) (*vision.Adjudication, vision.Usage, error) {
	return &vision.Adjudication{}, vision.Usage{}, nil
}

func testJPEGVariant(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.RGBA{R: uint8(255 - x*4), G: 20, B: uint8(y * 3), A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
