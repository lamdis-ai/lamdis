// Command lamdis is the Lamdis Protocol node: an embedded store of
// permissioned, hash-chained context threads that agents read, write, and
// search. M0 surface: local CLI. REST/MCP/sync land in later milestones.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/embed"
	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "lamdis:", err)
		os.Exit(1)
	}
}

func usage() error {
	fmt.Fprint(os.Stderr, `usage: lamdis [-data DIR] <command> [args]

commands:
  init                        create a person keypair and empty store
  whoami                      print this node's person principal id
  thread new <title>          create a thread; prints its id
  threads                     list thread ids and titles
  post <thread> <text>        append a core.message to a thread
  post -kind K -lane L ...    append any kind/lane (body from -text or -json)
  read <thread>               print a thread's entries (all lanes)
  search <query>              hybrid search across all local threads

environment:
  LAMDIS_DATA        data directory (default ~/.lamdis)
  LAMDIS_EMBED_URL   OpenAI-compatible base URL (e.g. http://localhost:11434/v1)
  LAMDIS_EMBED_MODEL embedding model name
  LAMDIS_EMBED_KEY   API key if the endpoint needs one
`)
	return fmt.Errorf("missing or unknown command")
}

func run(args []string) error {
	fs := flag.NewFlagSet("lamdis", flag.ContinueOnError)
	defaultData := os.Getenv("LAMDIS_DATA")
	if defaultData == "" {
		home, _ := os.UserHomeDir()
		defaultData = filepath.Join(home, ".lamdis")
	}
	dataDir := fs.String("data", defaultData, "data directory")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) == 0 {
		return usage()
	}
	ctx := context.Background()
	cmd, rest := rest[0], rest[1:]

	switch cmd {
	case "init":
		return cmdInit(*dataDir)
	case "whoami":
		_, pid, err := loadKey(*dataDir)
		if err != nil {
			return err
		}
		fmt.Println(pid)
		return nil
	}

	// Every other command needs the store open.
	s, err := openStore(*dataDir)
	if err != nil {
		return err
	}
	defer s.Close()

	switch cmd {
	case "thread":
		if len(rest) < 2 || rest[0] != "new" {
			return usage()
		}
		return cmdThreadNew(ctx, *dataDir, s, strings.Join(rest[1:], " "))
	case "threads":
		return cmdThreads(ctx, s)
	case "post":
		return cmdPost(ctx, *dataDir, s, rest)
	case "read":
		if len(rest) != 1 {
			return usage()
		}
		return cmdRead(ctx, s, rest[0])
	case "search":
		if len(rest) == 0 {
			return usage()
		}
		return cmdSearch(ctx, s, strings.Join(rest, " "))
	default:
		return usage()
	}
}

func keyPath(dataDir string) string { return filepath.Join(dataDir, "person.key") }
func dbPath(dataDir string) string  { return filepath.Join(dataDir, "lamdis.db") }

func cmdInit(dataDir string) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	if _, err := os.Stat(keyPath(dataDir)); err == nil {
		return fmt.Errorf("%s already exists; refusing to overwrite a person key", keyPath(dataDir))
	}
	pid, priv, err := protolog.GenerateKeypair()
	if err != nil {
		return err
	}
	if err := os.WriteFile(keyPath(dataDir), []byte(hex.EncodeToString(priv.Seed())+"\n"), 0o600); err != nil {
		return err
	}
	s, err := store.OpenSQLite(dbPath(dataDir))
	if err != nil {
		return err
	}
	s.Close()
	fmt.Printf("initialized %s\nperson principal: %s\n", dataDir, pid)
	return nil
}

func loadKey(dataDir string) (ed25519.PrivateKey, string, error) {
	raw, err := os.ReadFile(keyPath(dataDir))
	if err != nil {
		return nil, "", fmt.Errorf("no person key (run `lamdis init` first): %w", err)
	}
	seed, err := hex.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(seed) != ed25519.SeedSize {
		return nil, "", fmt.Errorf("person key at %s is corrupt", keyPath(dataDir))
	}
	priv := ed25519.NewKeyFromSeed(seed)
	pid, err := protolog.PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		return nil, "", err
	}
	return priv, pid, nil
}

func openStore(dataDir string) (store.Store, error) {
	if _, err := os.Stat(dbPath(dataDir)); err != nil {
		return nil, fmt.Errorf("no store at %s (run `lamdis init` first)", dbPath(dataDir))
	}
	return store.OpenSQLite(dbPath(dataDir))
}

func embedderFromEnv() embed.Embedder {
	url := os.Getenv("LAMDIS_EMBED_URL")
	model := os.Getenv("LAMDIS_EMBED_MODEL")
	if url == "" || model == "" {
		return nil
	}
	return embed.NewOpenAICompat(url, os.Getenv("LAMDIS_EMBED_KEY"), model)
}

// drainEmbeds opportunistically embeds pending entries; without a configured
// embedder it is a no-op and search degrades to FTS.
func drainEmbeds(ctx context.Context, s store.Store) {
	e := embedderFromEnv()
	if e == nil {
		return
	}
	w := embed.Worker{Store: s, Embedder: e}
	for {
		n, err := w.Tick(ctx)
		if err != nil {
			fmt.Fprintln(os.Stderr, "lamdis: embed worker:", err)
			return
		}
		if n == 0 {
			return
		}
	}
}

func cmdThreadNew(ctx context.Context, dataDir string, s store.Store, title string) error {
	priv, _, err := loadKey(dataDir)
	if err != nil {
		return err
	}
	l, genesis, err := protolog.NewThread(priv, title, nil)
	if err != nil {
		return err
	}
	if err := s.AppendEntries(ctx, l.Entries()); err != nil {
		return err
	}
	fmt.Println(genesis.ID)
	return nil
}

func cmdThreads(ctx context.Context, s store.Store) error {
	ids, err := s.Threads(ctx)
	if err != nil {
		return err
	}
	for _, id := range ids {
		title := ""
		if tl, err := s.Thread(ctx, id); err == nil {
			if g := tl.Get(id); g != nil {
				var body struct {
					Title string `json:"title"`
				}
				json.Unmarshal(g.Body, &body)
				title = body.Title
			}
		}
		fmt.Printf("%s  %s\n", id, title)
	}
	return nil
}

func cmdPost(ctx context.Context, dataDir string, s store.Store, args []string) error {
	fs := flag.NewFlagSet("post", flag.ContinueOnError)
	kind := fs.String("kind", protolog.KindMessage, "entry kind")
	lane := fs.String("lane", string(protolog.LaneContent), "lane: content|summary|control")
	jsonBody := fs.String("json", "", "raw JSON body (overrides text)")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) < 1 {
		return fmt.Errorf("post: thread id required")
	}
	threadID := rest[0]
	var body any
	if *jsonBody != "" {
		body = json.RawMessage(*jsonBody)
	} else if len(rest) > 1 {
		body = map[string]any{"text": strings.Join(rest[1:], " ")}
	} else {
		return fmt.Errorf("post: text or -json body required")
	}
	priv, _, err := loadKey(dataDir)
	if err != nil {
		return err
	}
	tl, err := s.Thread(ctx, threadID)
	if err != nil {
		return err
	}
	a, err := protolog.NewAuthor(tl, priv)
	if err != nil {
		return err
	}
	e, err := a.Append(protolog.Draft{Kind: *kind, Lane: protolog.Lane(*lane), Body: body})
	if err != nil {
		return err
	}
	if err := s.AppendEntries(ctx, []*protolog.Entry{e}); err != nil {
		return err
	}
	drainEmbeds(ctx, s)
	fmt.Println(e.ID)
	return nil
}

func cmdRead(ctx context.Context, s store.Store, threadID string) error {
	entries, err := s.Entries(ctx, threadID,
		[]protolog.Lane{protolog.LaneControl, protolog.LaneSummary, protolog.LaneContent})
	if err != nil {
		return err
	}
	for _, e := range entries {
		var body struct {
			Text  string `json:"text"`
			Title string `json:"title"`
		}
		json.Unmarshal(e.Body, &body)
		txt := body.Text
		if txt == "" {
			txt = body.Title
		}
		fmt.Printf("%s  %-9s %-22s %s\n", e.TS, e.Lane, e.Kind, txt)
	}
	return nil
}

func cmdSearch(ctx context.Context, s store.Store, query string) error {
	req := store.SearchRequest{
		Query: query,
		Lanes: []protolog.Lane{protolog.LaneControl, protolog.LaneSummary, protolog.LaneContent},
	}
	if e := embedderFromEnv(); e != nil {
		drainEmbeds(ctx, s)
		vecs, err := e.Embed(ctx, []string{query})
		if err != nil {
			fmt.Fprintln(os.Stderr, "lamdis: embedding query failed, using FTS only:", err)
		} else {
			req.QueryVec = vecs[0]
		}
	}
	hits, err := s.Search(ctx, req)
	if err != nil {
		return err
	}
	if len(hits) == 0 {
		fmt.Println("no results")
		return nil
	}
	for _, h := range hits {
		fmt.Printf("%.4f  %s  [%s/%s] %s\n", h.Rank, h.Thread, h.Lane, h.Kind, h.Snippet)
	}
	return nil
}
