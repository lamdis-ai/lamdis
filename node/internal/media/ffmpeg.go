package media

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

// FFmpeg decomposes video by shelling out.
//
// The same choice as the vision client makes with the AWS CLI, for the same
// reason: the hard part is not invoking the tool, it is everything the tool
// knows about broken files, and reimplementing that in Go would be worse in
// every way that matters.
//
// It costs the image its distroless base — ffmpeg needs a real userland — and
// that is a genuine loss of attack surface, not a free upgrade. It is worth it
// only because video evidence is much harder to fake than a photograph, which
// is the whole reason to accept it.
type FFmpeg struct {
	// Bin and Probe are the binaries. Named rather than assumed, so a
	// deployment can point at a pinned build.
	Bin      string
	ProbeBin string
	// Timeout bounds one decode. A malformed file that makes ffmpeg spin is a
	// denial of service if nothing stops it.
	Timeout time.Duration
	// MaxBytes refuses a file too large to decode at all.
	MaxBytes int
}

func NewFFmpeg() *FFmpeg {
	return &FFmpeg{Bin: "ffmpeg", ProbeBin: "ffprobe",
		Timeout: 90 * time.Second, MaxBytes: 256 << 20}
}

// Available reports whether the binaries are actually present, so a deployment
// without them degrades to images rather than failing at the first video.
func (f *FFmpeg) Available() bool {
	if _, err := exec.LookPath(f.bin()); err != nil {
		return false
	}
	_, err := exec.LookPath(f.probeBin())
	return err == nil
}

func (f *FFmpeg) bin() string {
	if f.Bin != "" {
		return f.Bin
	}
	return "ffmpeg"
}

func (f *FFmpeg) probeBin() string {
	if f.ProbeBin != "" {
		return f.ProbeBin
	}
	return "ffprobe"
}

func (f *FFmpeg) timeout() time.Duration {
	if f.Timeout > 0 {
		return f.Timeout
	}
	return 90 * time.Second
}

// scratch writes the upload somewhere ffmpeg can seek in it.
//
// Streaming through a pipe would avoid the write, but seeking is what makes
// frame extraction cheap, and a container that cannot be seeked is decoded
// from the start for every single frame.
func (f *FFmpeg) scratch(data []byte, mime string) (path string, cleanup func(), err error) {
	if f.MaxBytes > 0 && len(data) > f.MaxBytes {
		return "", func() {}, fmt.Errorf("media: file is too large to decode")
	}
	dir, err := os.MkdirTemp("", "lamdis-media-")
	if err != nil {
		return "", func() {}, err
	}
	ext := ".bin"
	switch mime {
	case "video/mp4":
		ext = ".mp4"
	case "video/quicktime":
		ext = ".mov"
	case "video/webm":
		ext = ".webm"
	}
	p := filepath.Join(dir, "in"+ext)
	if err := os.WriteFile(p, data, 0o600); err != nil {
		os.RemoveAll(dir)
		return "", func() {}, err
	}
	return p, func() { os.RemoveAll(dir) }, nil
}

func (f *FFmpeg) Probe(ctx context.Context, data []byte, mime string) (Probe, error) {
	path, cleanup, err := f.scratch(data, mime)
	if err != nil {
		return Probe{}, err
	}
	defer cleanup()

	ctx, cancel := context.WithTimeout(ctx, f.timeout())
	defer cancel()
	out, err := exec.CommandContext(ctx, f.probeBin(),
		"-v", "error", "-print_format", "json",
		"-show_format", "-show_streams", path).Output()
	if err != nil {
		return Probe{}, ErrUnsupported
	}
	var parsed struct {
		Format struct {
			Duration string `json:"duration"`
			Name     string `json:"format_name"`
		} `json:"format"`
		Streams []struct {
			CodecType string `json:"codec_type"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(out, &parsed); err != nil {
		return Probe{}, ErrUnsupported
	}
	p := Probe{Format: parsed.Format.Name}
	if secs, err := strconv.ParseFloat(parsed.Format.Duration, 64); err == nil {
		p.Duration = time.Duration(secs * float64(time.Second))
	}
	for _, st := range parsed.Streams {
		switch st.CodecType {
		case "video":
			if st.Width > p.Width {
				p.Width, p.Height = st.Width, st.Height
			}
		case "audio":
			p.HasAudio = true
		}
	}
	if p.Width == 0 {
		return p, ErrUnsupported
	}
	return p, nil
}

func (f *FFmpeg) Frames(ctx context.Context, data []byte, mime string, n int) ([]Frame, error) {
	if n <= 0 || n > MaxFrames {
		n = MaxFrames
	}
	probe, err := f.Probe(ctx, data, mime)
	if err != nil {
		return nil, err
	}
	path, cleanup, err := f.scratch(data, mime)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	// A very short clip does not have room for many distinct stills.
	if probe.Duration < time.Duration(n)*time.Second {
		n = int(probe.Duration/time.Second) + 1
		if n < 1 {
			n = 1
		}
	}

	frames := make([]Frame, 0, n)
	for i := 0; i < n; i++ {
		// Sample inside the clip rather than at its edges: the first and last
		// frames of a phone recording are usually a pocket or a thumb.
		at := probe.Duration * time.Duration(2*i+1) / time.Duration(2*n)
		jpeg, err := f.frameAt(ctx, path, at)
		if err != nil {
			continue
		}
		frames = append(frames, Frame{At: at, JPEG: jpeg})
	}
	if len(frames) == 0 {
		return nil, ErrUnsupported
	}
	return frames, nil
}

func (f *FFmpeg) frameAt(ctx context.Context, path string, at time.Duration) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, f.timeout())
	defer cancel()
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, f.bin(),
		// Seeking before the input is the fast path; after it is exact but
		// decodes everything up to the point asked for.
		"-ss", fmt.Sprintf("%.3f", at.Seconds()),
		"-i", path,
		"-frames:v", "1",
		// Cap the long edge. The vision tier reads a 2576px image, and a 4K
		// still costs several times the tokens for no additional legibility.
		"-vf", "scale='min(2048,iw)':-2",
		"-q:v", "3",
		"-f", "image2", "-vcodec", "mjpeg", "pipe:1")
	cmd.Stdout = &buf
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	if buf.Len() == 0 {
		return nil, ErrUnsupported
	}
	return buf.Bytes(), nil
}

func (f *FFmpeg) Audio(ctx context.Context, data []byte, mime string) ([]byte, error) {
	path, cleanup, err := f.scratch(data, mime)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	ctx, cancel := context.WithTimeout(ctx, f.timeout())
	defer cancel()
	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, f.bin(),
		"-i", path,
		"-vn",      // drop video
		"-ac", "1", // mono
		"-ar", "16000", // 16 kHz, what every transcriber expects
		"-acodec", "pcm_s16le",
		"-f", "wav", "pipe:1")
	cmd.Stdout = &buf
	if err := cmd.Run(); err != nil {
		return nil, ErrUnsupported
	}
	if buf.Len() < 1024 {
		// A header and nothing else means there was no soundtrack.
		return nil, ErrUnsupported
	}
	return buf.Bytes(), nil
}
