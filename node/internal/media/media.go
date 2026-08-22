// Package media turns a video into things a verifier can actually read.
//
// A photograph is one claim about one moment. A video is a much stronger claim
// — it is far harder to fake a continuous walk up to a building than a single
// frame — but nothing in the verification pipeline can read one directly. So a
// video is decomposed into evidence of two kinds that already have readers:
// still frames, which the vision model describes, and a transcript, which is
// plain text.
//
// The transcript matters more than it first appears. A worker can be asked to
// say the challenge code aloud, and a spoken code recorded in continuous audio
// alongside the thing being photographed is harder to fabricate than a code
// held on a card, because it has to survive as one take.
package media

import (
	"context"
	"fmt"
	"time"
)

// Kind classifies an uploaded artifact.
const (
	KindImage = "image"
	KindVideo = "video"
	KindAudio = "audio"
)

// KindOf maps a media type to what we can do with it.
func KindOf(mime string) string {
	switch {
	case len(mime) > 6 && mime[:6] == "image/":
		return KindImage
	case len(mime) > 6 && mime[:6] == "video/":
		return KindVideo
	case len(mime) > 6 && mime[:6] == "audio/":
		return KindAudio
	}
	return ""
}

// Frame is one still taken from a video, with the offset it came from.
type Frame struct {
	At   time.Duration
	JPEG []byte
}

// Probe is what we learned about a file without decoding all of it.
type Probe struct {
	Duration time.Duration
	Width    int
	Height   int
	HasAudio bool
	Format   string
}

// Extractor pulls stills and audio out of a video.
//
// It is an interface because the implementation shells out to ffmpeg, and a
// test suite that needs ffmpeg installed is a test suite that does not run.
type Extractor interface {
	// Probe reads the container's metadata.
	Probe(ctx context.Context, data []byte, mime string) (Probe, error)
	// Frames returns up to n stills spread across the video. Evenly spaced
	// rather than clustered: a fabricated video is easiest to sustain for a
	// moment and hardest to sustain throughout.
	Frames(ctx context.Context, data []byte, mime string, n int) ([]Frame, error)
	// Audio returns the soundtrack as 16 kHz mono PCM WAV, which is what every
	// transcription service wants and what none of them agree on how to ask for.
	Audio(ctx context.Context, data []byte, mime string) ([]byte, error)
}

// Transcriber turns speech into text.
type Transcriber interface {
	Transcribe(ctx context.Context, wav []byte) (Transcript, error)
}

// Transcript is what was said, and how sure the service was.
type Transcript struct {
	Text       string
	Confidence float64
	// Segments allow a claim about *when* something was said, which is what
	// makes "the code was spoken during the walk" checkable rather than just
	// "the code appears somewhere".
	Segments []Segment
}

type Segment struct {
	Start, End time.Duration
	Text       string
	Confidence float64
}

// ErrUnsupported is returned when a file cannot be decomposed here.
var ErrUnsupported = fmt.Errorf("media: unsupported format")

// MaxFrames bounds how many stills one video contributes.
//
// Each frame costs a vision call, so this is a budget decision as much as a
// verification one. Eight spread across a clip is enough to establish
// continuity without turning one submission into a bill.
const MaxFrames = 8
