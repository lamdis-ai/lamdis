package embed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fakeEmbeddings serves an OpenAI-compatible /embeddings endpoint that
// returns a deterministic unit vector per input.
func fakeEmbeddings(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embeddings" {
			http.NotFound(w, r)
			return
		}
		var req struct {
			Input []string `json:"input"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		type datum struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		}
		var data []datum
		for i, s := range req.Input {
			v := []float32{float32(len(s)), 1, 0}
			data = append(data, datum{Index: i, Embedding: v})
		}
		json.NewEncoder(w).Encode(map[string]any{"data": data})
	}))
}

func TestOpenAICompat(t *testing.T) {
	srv := fakeEmbeddings(t)
	defer srv.Close()
	e := NewOpenAICompat(srv.URL, "", "test-model")
	vecs, err := e.Embed(context.Background(), []string{"a", "longer text"})
	if err != nil {
		t.Fatal(err)
	}
	if len(vecs) != 2 || len(vecs[0]) != 3 {
		t.Fatalf("unexpected vectors: %v", vecs)
	}
	if vecs[0][0] != 1 || vecs[1][0] != 11 {
		t.Fatalf("vectors not aligned to inputs: %v", vecs)
	}
}
