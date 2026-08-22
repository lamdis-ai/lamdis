package evidence

import (
	"image"
	"image/color"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// gradient builds a deterministic test image with a distinguishing block, so
// perturbations of it can be compared meaningfully.
func gradient(w, h int, shift int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := uint8((x*255/w + y*128/h + shift) % 256)
			img.Set(x, y, color.RGBA{v, uint8(255 - int(v)), uint8((int(v) * 3) % 256), 255})
		}
	}
	// A dark block so the image is not symmetric: without it a mirror is
	// indistinguishable from the original and the mirror test proves nothing.
	for y := h / 8; y < h/3; y++ {
		for x := w / 8; x < w/3; x++ {
			img.Set(x, y, color.RGBA{10, 10, 10, 255})
		}
	}
	return img
}

func TestDHashSurvivesRecompression(t *testing.T) {
	img := gradient(320, 240, 0)
	high, err := EncodeJPEG(img, 95)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	low, err := EncodeJPEG(img, 60)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	a, err := Analyze(high, "image/jpeg")
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}
	b, err := Analyze(low, "image/jpeg")
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}
	// The bytes differ completely; the perceptual fingerprint must not.
	if a.SHA256 == b.SHA256 {
		t.Fatal("re-encoding did not change the bytes, so this proves nothing")
	}
	if d := Distance(a.DHash, b.DHash); d > 6 {
		t.Errorf("re-encoding moved the fingerprint by %d bits; a reused photo would slip through", d)
	}
}

func TestDHashSeparatesDifferentImages(t *testing.T) {
	a, _ := Analyze(mustEncode(t, gradient(320, 240, 0)), "image/jpeg")
	b, _ := Analyze(mustEncode(t, gradient(320, 240, 90)), "image/jpeg")
	if d := Distance(a.DHash, b.DHash); d < 8 {
		t.Errorf("two different images are only %d bits apart; the index would false-positive", d)
	}
}

// TestMirrorHashCatchesFlips covers the cheapest possible evasion: flipping an
// old photo so a single fingerprint no longer matches.
func TestMirrorHashCatchesFlips(t *testing.T) {
	orig := gradient(320, 240, 0)
	a, err := Analyze(mustEncode(t, orig), "image/jpeg")
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}

	flip := image.NewRGBA(image.Rect(0, 0, 320, 240))
	for y := 0; y < 240; y++ {
		for x := 0; x < 320; x++ {
			flip.Set(x, y, orig.At(319-x, y))
		}
	}
	b, err := Analyze(mustEncode(t, flip), "image/jpeg")
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}

	if Distance(a.DHash, b.DHash) <= 10 {
		t.Skip("this image is too symmetric for the flip to be detectable")
	}
	// The flipped submission's plain hash misses, but its mirror hash must
	// match the original's plain hash.
	if d := Distance(a.DHash, b.MirrorHash); d > 6 {
		t.Errorf("a mirrored resubmission was not caught: mirror distance %d", d)
	}
}

func TestParseEXIFOnRealPhoto(t *testing.T) {
	// A real iPhone capture, if one has been staged for the test.
	path := filepath.Join("testdata", "real_photo.jpg")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("no real photo staged at %s", path)
	}
	e, err := ParseEXIF(data)
	if err != nil {
		t.Fatalf("ParseEXIF: %v", err)
	}
	if !e.Present {
		t.Fatal("expected EXIF in a camera original")
	}
	if !e.HasDateTime {
		t.Error("expected a capture timestamp")
	}
	if e.Make == "" && e.Model == "" {
		t.Error("expected a device make or model")
	}
	if age, ok := e.Age(time.Now()); ok && age < 0 {
		t.Errorf("capture time is in the future by %s", -age)
	}
}

// TestParseEXIFAbsentIsNotAnError covers the case that matters most for
// scoring: a file with no metadata is a finding, not a failure.
func TestParseEXIFAbsentIsNotAnError(t *testing.T) {
	data := mustEncode(t, gradient(64, 64, 0))
	e, err := ParseEXIF(data)
	if err != nil {
		t.Fatalf("ParseEXIF on a bare JPEG should not error: %v", err)
	}
	if e.Present {
		t.Error("a freshly encoded JPEG should carry no EXIF")
	}
	if e.Summary() != "no EXIF" {
		t.Errorf("summary = %q", e.Summary())
	}
}

func TestParseEXIFRejectsNonJPEG(t *testing.T) {
	if e, err := ParseEXIF([]byte("not an image at all")); err != nil || e.Present {
		t.Errorf("garbage input should report absent EXIF without erroring, got %v / %v", e.Present, err)
	}
}

func TestAnalyzeRejectsUndecodableBytes(t *testing.T) {
	if _, err := Analyze([]byte("nope"), "image/jpeg"); err == nil {
		t.Fatal("expected an error decoding non-image bytes")
	}
}

func mustEncode(t *testing.T, img image.Image) []byte {
	t.Helper()
	b, err := EncodeJPEG(img, 92)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	return b
}
