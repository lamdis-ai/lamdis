package evidence

import (
	"bytes"
	"io"
)

func bytesReader(b []byte) io.Reader { return bytes.NewReader(b) }

// writeBuffer is a tiny io.Writer that keeps what was written.
type writeBuffer struct{ b []byte }

func (w *writeBuffer) Write(p []byte) (int, error) {
	w.b = append(w.b, p...)
	return len(p), nil
}
