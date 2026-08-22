// Package evidence handles the bytes: content-addressed storage and the
// deterministic checks that run over an artifact before any model sees it.
package evidence

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"math/bits"
	"os"
)

// DHash computes a 64-bit difference hash from actual pixels.
//
// The image is reduced to 9x8 greyscale and each pixel compared with its right
// neighbour, giving 64 bits that survive re-encoding, moderate cropping, and
// brightness shifts — the transformations a provider reaching for an old photo
// would apply. It is intentionally not a cryptographic hash: two visually
// similar images must land close together, which is the entire point.
func DHash(img image.Image) uint64 {
	const w, h = 9, 8
	var grey [h][w]float64
	b := img.Bounds()
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			// Box-sample the source region for this cell.
			x0 := b.Min.X + x*b.Dx()/w
			x1 := b.Min.X + (x+1)*b.Dx()/w
			y0 := b.Min.Y + y*b.Dy()/h
			y1 := b.Min.Y + (y+1)*b.Dy()/h
			if x1 <= x0 {
				x1 = x0 + 1
			}
			if y1 <= y0 {
				y1 = y0 + 1
			}
			var sum float64
			var n int
			for yy := y0; yy < y1 && yy < b.Max.Y; yy++ {
				for xx := x0; xx < x1 && xx < b.Max.X; xx++ {
					r, g, bl, _ := img.At(xx, yy).RGBA()
					// Rec. 601 luma.
					sum += 0.299*float64(r>>8) + 0.587*float64(g>>8) + 0.114*float64(bl>>8)
					n++
				}
			}
			if n > 0 {
				grey[y][x] = sum / float64(n)
			}
		}
	}
	var hash uint64
	bit := 0
	for y := 0; y < h; y++ {
		for x := 0; x < w-1; x++ {
			if grey[y][x] > grey[y][x+1] {
				hash |= 1 << uint(bit)
			}
			bit++
		}
	}
	return hash
}

// MirrorDHash is the hash of the horizontally flipped image. Storing both is
// what catches a provider who mirrors an old photo to defeat a naive index —
// the cheapest possible evasion, and the one a single hash misses.
func MirrorDHash(img image.Image) uint64 {
	return DHash(&flipped{img})
}

type flipped struct{ image.Image }

func (f *flipped) At(x, y int) color.Color {
	b := f.Image.Bounds()
	return f.Image.At(b.Max.X-1-(x-b.Min.X), y)
}

// Distance is the Hamming distance between two fingerprints.
func Distance(a, b uint64) int { return bits.OnesCount64(a ^ b) }

// Artifact is a stored piece of evidence with its computed fingerprints.
type Artifact struct {
	SHA256     string
	MediaType  string
	Bytes      int64
	DHash      uint64
	MirrorHash uint64
	Width      int
	Height     int
}

// Analyze reads image bytes and computes everything derivable from them alone.
func Analyze(data []byte, mediaType string) (Artifact, error) {
	sum := sha256.Sum256(data)
	a := Artifact{
		SHA256:    hex.EncodeToString(sum[:]),
		MediaType: mediaType,
		Bytes:     int64(len(data)),
	}
	img, _, err := image.Decode(bytesReader(data))
	if err != nil {
		return a, fmt.Errorf("evidence: decoding image: %w", err)
	}
	a.DHash = DHash(img)
	a.MirrorHash = MirrorDHash(img)
	a.Width, a.Height = img.Bounds().Dx(), img.Bounds().Dy()
	return a, nil
}

// LoadJPEG reads a file and analyses it.
func LoadJPEG(path string) ([]byte, Artifact, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, Artifact{}, err
	}
	art, err := Analyze(data, "image/jpeg")
	return data, art, err
}

// EncodeJPEG is used by the demo image generator.
func EncodeJPEG(img image.Image, quality int) ([]byte, error) {
	var buf writeBuffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return buf.b, nil
}
