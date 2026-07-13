package store

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"path/filepath"
	"testing"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

// contractTest runs the driver-independent Store contract. Postgres reuses
// it when that driver lands.
func contractTest(t *testing.T, open func(t *testing.T) Store, reopen func(t *testing.T) Store) {
	ctx := context.Background()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := func() time.Time { return time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC) }
	l, genesis, err := protolog.NewThread(priv, "pool project", now)
	if err != nil {
		t.Fatal(err)
	}
	a, err := protolog.NewAuthor(l, priv)
	if err != nil {
		t.Fatal(err)
	}
	a.Now = now

	msg1, err := a.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "the pool pump arrived and is sitting in the garage"}})
	if err != nil {
		t.Fatal(err)
	}
	msg2, err := a.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "concrete contractor quoted twelve thousand for the deck"}})
	if err != nil {
		t.Fatal(err)
	}
	sum, err := a.Append(protolog.Draft{Kind: protolog.KindSummary, Lane: protolog.LaneSummary,
		Refs: &protolog.Refs{Covers: &protolog.Covers{From: msg1.ID, To: msg2.ID}},
		Body: map[string]any{"text": "pool project: pump delivered, awaiting deck concrete quote decision"}})
	if err != nil {
		t.Fatal(err)
	}

	s := open(t)
	if err := s.AppendEntries(ctx, l.Entries()); err != nil {
		t.Fatal(err)
	}
	// Idempotent redelivery.
	if err := s.AppendEntries(ctx, []*protolog.Entry{msg1}); err != nil {
		t.Fatalf("redelivery rejected: %v", err)
	}

	// Persistence: a fresh store instance over the same data sees the thread.
	s.Close()
	s = reopen(t)
	defer s.Close()

	threads, err := s.Threads(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(threads) != 1 || threads[0] != genesis.ID {
		t.Fatalf("threads = %v, want [%s]", threads, genesis.ID)
	}
	tl, err := s.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if tl.Len() != 4 {
		t.Fatalf("reloaded thread has %d entries, want 4", tl.Len())
	}

	// Lane filtering is the permission enforcement point: summary-only read
	// must return zero content-lane bytes.
	sumOnly, err := s.Entries(ctx, genesis.ID, []protolog.Lane{protolog.LaneSummary})
	if err != nil {
		t.Fatal(err)
	}
	if len(sumOnly) != 1 || sumOnly[0].ID != sum.ID {
		t.Fatalf("summary-lane read returned %d entries, want exactly the summary", len(sumOnly))
	}
	// Deny by default: no lanes = error, not "all lanes".
	if _, err := s.Entries(ctx, genesis.ID, nil); err == nil {
		t.Fatal("empty lane set should be rejected, not treated as all-lanes")
	}
	if _, err := s.Search(ctx, SearchRequest{Query: "pump"}); err == nil {
		t.Fatal("search with empty lane set should be rejected")
	}

	// Regression: authoring through the store's CACHED thread log must still
	// persist. (Author.Append mutates the shared log; AppendEntries must
	// decide persistence from the database, not the cache.)
	cached, err := s.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	ca, err := protolog.NewAuthor(cached, priv)
	if err != nil {
		t.Fatal(err)
	}
	ca.Now = now
	aliased, err := ca.Append(protolog.Draft{Kind: protolog.KindMessage, Lane: protolog.LaneContent,
		Body: map[string]any{"text": "tile samples picked up from the showroom"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AppendEntries(ctx, []*protolog.Entry{aliased}); err != nil {
		t.Fatal(err)
	}
	s.Close()
	s = reopen(t)
	tl, err = s.Thread(ctx, genesis.ID)
	if err != nil {
		t.Fatal(err)
	}
	if tl.Get(aliased.ID) == nil {
		t.Fatal("entry authored via cached log was not persisted")
	}

	// FTS search, content lane. "quotes" only matches "quoted" via stemming.
	hits, err := s.Search(ctx, SearchRequest{Query: "contractor quotes", Mode: ModeFTS,
		Lanes: []protolog.Lane{protolog.LaneContent}})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 || hits[0].EntryID != msg2.ID {
		t.Fatalf("stemmed fts hits = %+v, want msg2 only", hits)
	}
	hits, err = s.Search(ctx, SearchRequest{Query: "pump garage", Mode: ModeFTS,
		Lanes: []protolog.Lane{protolog.LaneContent}})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 1 || hits[0].EntryID != msg1.ID {
		t.Fatalf("fts hits = %+v, want msg1 only", hits)
	}
	// Same query, summary lane only: content hit must not leak.
	hits, err = s.Search(ctx, SearchRequest{Query: "garage", Mode: ModeFTS,
		Lanes: []protolog.Lane{protolog.LaneSummary}})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) != 0 {
		t.Fatalf("summary-scoped search leaked content hits: %+v", hits)
	}
	// FTS syntax injection must not error.
	if _, err := s.Search(ctx, SearchRequest{Query: `pump" OR NEAR(x y)`, Mode: ModeFTS,
		Lanes: []protolog.Lane{protolog.LaneContent}}); err != nil {
		t.Fatalf("fts query with syntax characters errored: %v", err)
	}

	// Vector pipeline: pending embeds → upsert → vector + hybrid search.
	pending, err := s.PendingEmbeds(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 4 {
		t.Fatalf("pending embeds = %d, want 4 (three messages + summary)", len(pending))
	}
	vecs := map[string][]float32{
		msg1.ID: {1, 0, 0, 0},
		msg2.ID: {0, 1, 0, 0},
		sum.ID:  {0.9, 0.1, 0, 0},
	}
	for id, v := range vecs {
		if err := s.UpsertVector(ctx, id, v); err != nil {
			t.Fatal(err)
		}
	}
	if pending, _ = s.PendingEmbeds(ctx, 10); len(pending) != 1 {
		t.Fatalf("pending embeds after upserts = %d, want 1 (aliased entry unembedded)", len(pending))
	}
	hits, err = s.Search(ctx, SearchRequest{Query: "irrelevant", Mode: ModeVector,
		QueryVec: []float32{1, 0, 0, 0}, Lanes: []protolog.Lane{protolog.LaneContent}})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 || hits[0].EntryID != msg1.ID {
		t.Fatalf("vector search top hit = %+v, want msg1", hits)
	}
	// Vector search respects lane scope: nearest neighbor overall is msg1
	// (content), but summary-scoped search may only surface the summary.
	hits, err = s.Search(ctx, SearchRequest{Query: "x", Mode: ModeVector,
		QueryVec: []float32{1, 0, 0, 0}, Lanes: []protolog.Lane{protolog.LaneSummary}})
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range hits {
		if h.Lane != protolog.LaneSummary {
			t.Fatalf("vector search leaked lane %s entry %s", h.Lane, h.EntryID)
		}
	}
	// Hybrid: RRF merges FTS and vector lists.
	hits, err = s.Search(ctx, SearchRequest{Query: "pump", Mode: ModeHybrid,
		QueryVec: []float32{1, 0, 0, 0}, Lanes: []protolog.Lane{protolog.LaneContent, protolog.LaneSummary}})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) == 0 || hits[0].EntryID != msg1.ID {
		t.Fatalf("hybrid top hit = %+v, want msg1 (in both lists)", hits)
	}
	// Dimension mismatch is an error, not silent corruption.
	if err := s.UpsertVector(ctx, msg2.ID, []float32{1, 2}); err == nil {
		t.Fatal("dimension mismatch accepted")
	}
}

func TestSQLiteContract(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lamdis.db")
	open := func(t *testing.T) Store {
		s, err := OpenSQLite(path)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	contractTest(t, open, open)
}
