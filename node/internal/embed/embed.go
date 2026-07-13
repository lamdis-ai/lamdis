// Package embed turns entry text into vectors. One wire shape — the
// OpenAI-compatible /v1/embeddings API — covers OpenAI, Voyage, Ollama,
// LM Studio, and llama.cpp server, so local-first deployments need zero
// extra code. Embeddings are node-local: they never enter entries and
// never cross the sync boundary.
package embed

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
)

// Embedder is the single abstraction the node depends on.
type Embedder interface {
	// Embed returns one vector per input text, all with the same dimension.
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	// Profile identifies the model so nodes can declare it and detect
	// reindex-requiring changes. Never shared with peers as data.
	Profile() Profile
}

// Profile is the node's declared embedding configuration.
type Profile struct {
	Model string `json:"model"`
	Dim   int    `json:"dim,omitempty"` // 0 = provider default
}

// OpenAICompat speaks POST {base}/embeddings with bearer auth.
type OpenAICompat struct {
	BaseURL string // e.g. https://api.openai.com/v1 or http://localhost:11434/v1
	APIKey  string // optional (local servers ignore it)
	Model   string
	Client  *http.Client
}

func NewOpenAICompat(baseURL, apiKey, model string) *OpenAICompat {
	return &OpenAICompat{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		Client:  &http.Client{Timeout: 60 * time.Second},
	}
}

func (o *OpenAICompat) Profile() Profile { return Profile{Model: o.Model} }

func (o *OpenAICompat) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	payload, err := json.Marshal(map[string]any{"model": o.Model, "input": texts})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if o.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+o.APIKey)
	}
	resp, err := o.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("embeddings API %s: %s: %s", o.BaseURL, resp.Status, body)
	}
	var out struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Data) != len(texts) {
		return nil, fmt.Errorf("embeddings API returned %d vectors for %d inputs", len(out.Data), len(texts))
	}
	vecs := make([][]float32, len(texts))
	for _, d := range out.Data {
		if d.Index < 0 || d.Index >= len(vecs) {
			return nil, fmt.Errorf("embeddings API returned out-of-range index %d", d.Index)
		}
		vecs[d.Index] = d.Embedding
	}
	return vecs, nil
}

// Worker drains the store's pending-embed queue in batches. Run it from the
// node's main loop; it is safe to call Tick opportunistically (e.g. after
// every append) and on a timer.
type Worker struct {
	Store    store.Store
	Embedder Embedder
	Batch    int // default 32
}

// Tick embeds up to one batch. Returns the number embedded; callers loop
// while n > 0 to drain.
func (w *Worker) Tick(ctx context.Context) (int, error) {
	batch := w.Batch
	if batch <= 0 {
		batch = 32
	}
	ids, err := w.Store.PendingEmbeds(ctx, batch)
	if err != nil || len(ids) == 0 {
		return 0, err
	}
	texts := make([]string, len(ids))
	for i, id := range ids {
		t, err := w.Store.EntryText(ctx, id)
		if err != nil {
			return 0, err
		}
		texts[i] = t
	}
	vecs, err := w.Embedder.Embed(ctx, texts)
	if err != nil {
		return 0, err
	}
	for i, id := range ids {
		if err := w.Store.UpsertVector(ctx, id, vecs[i]); err != nil {
			return i, err
		}
	}
	return len(ids), nil
}
