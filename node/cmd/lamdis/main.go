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
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/embed"
	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	nodemcp "github.com/lamdis-ai/lamdis-protocol/node/internal/mcp"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/perm"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
	syncp "github.com/lamdis-ai/lamdis-protocol/node/internal/sync"
)

const version = "0.1.0-dev"

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

  mcp                         serve MCP over stdio (add to your agent's .mcp.json)
  serve [-addr :8420]         serve sync to peers (run this; give peers your URL)
  peer add <name> <url>       remember a peer node
  peers                       list peers
  sync [peer]                 pull permitted threads from peers (default: all)

  grant <thread> <person> <scopes>   grant scopes (comma-sep: summary,search,read,contribute)
       [-ttl 168h]                   optional expiry
  revoke <thread> <person>           revoke all scopes
  access <thread>                    show stewards and effective grants

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
	case "mcp":
		priv, pid, err := loadKey(*dataDir)
		if err != nil {
			return err
		}
		peers, err := loadPeers(*dataDir)
		if err != nil {
			return err
		}
		return nodemcp.RunStdio(ctx, &nodemcp.Node{
			Store: s, Key: priv, Self: pid, Peers: peers, Embedder: embedderFromEnv(),
		}, version)
	case "serve":
		return cmdServe(*dataDir, s, rest)
	case "peer":
		if len(rest) == 3 && rest[0] == "add" {
			return cmdPeerAdd(*dataDir, rest[1], rest[2])
		}
		return usage()
	case "peers":
		return cmdPeers(*dataDir)
	case "sync":
		return cmdSync(ctx, *dataDir, s, rest)
	case "grant":
		return cmdGrant(ctx, *dataDir, s, rest)
	case "revoke":
		if len(rest) != 2 {
			return usage()
		}
		return cmdGrantWrite(ctx, *dataDir, s, protolog.KindRevoke, rest[0],
			map[string]any{"principal": rest[1]})
	case "access":
		if len(rest) != 1 {
			return usage()
		}
		return cmdAccess(ctx, s, rest[0])
	default:
		return usage()
	}
}

func peersPath(dataDir string) string { return filepath.Join(dataDir, "peers.json") }

func loadPeers(dataDir string) (map[string]string, error) {
	peers := map[string]string{}
	raw, err := os.ReadFile(peersPath(dataDir))
	if os.IsNotExist(err) {
		return peers, nil
	}
	if err != nil {
		return nil, err
	}
	return peers, json.Unmarshal(raw, &peers)
}

func cmdPeerAdd(dataDir, name, url string) error {
	peers, err := loadPeers(dataDir)
	if err != nil {
		return err
	}
	peers[name] = strings.TrimRight(url, "/")
	raw, _ := json.MarshalIndent(peers, "", "  ")
	if err := os.WriteFile(peersPath(dataDir), raw, 0o600); err != nil {
		return err
	}
	fmt.Printf("peer %s -> %s\n", name, peers[name])
	return nil
}

func cmdPeers(dataDir string) error {
	peers, err := loadPeers(dataDir)
	if err != nil {
		return err
	}
	for name, url := range peers {
		fmt.Printf("%s  %s\n", name, url)
	}
	return nil
}

func cmdServe(dataDir string, s store.Store, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	addr := fs.String("addr", ":8420", "listen address")
	if err := fs.Parse(args); err != nil {
		return err
	}
	_, pid, err := loadKey(dataDir)
	if err != nil {
		return err
	}
	srv := &api.Server{Sync: &syncp.Server{Store: s}}
	fmt.Printf("lamdis node serving on %s\nprincipal: %s\ngive peers this URL; grants decide what they can pull\n", *addr, pid)
	return http.ListenAndServe(*addr, srv.Handler())
}

func cmdSync(ctx context.Context, dataDir string, s store.Store, args []string) error {
	fs := flag.NewFlagSet("sync", flag.ContinueOnError)
	watch := fs.Duration("watch", 0, "keep syncing on this interval (e.g. 30s); 0 = once")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	priv, pid, err := loadKey(dataDir)
	if err != nil {
		return err
	}
	peers, err := loadPeers(dataDir)
	if err != nil {
		return err
	}
	if len(rest) == 1 {
		url, ok := peers[rest[0]]
		if !ok {
			return fmt.Errorf("unknown peer %q (add with `lamdis peer add`)", rest[0])
		}
		peers = map[string]string{rest[0]: url}
	}
	if len(peers) == 0 {
		return fmt.Errorf("no peers configured (add with `lamdis peer add <name> <url>`)")
	}
	round := func() {
		for name, url := range peers {
			client := &syncp.Client{Store: s, Peer: api.NewHTTPTransport(url, priv), Self: pid}
			counts, err := client.SyncAll(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "lamdis: sync %s: %v\n", name, err)
				continue
			}
			total := 0
			for _, n := range counts {
				total += n
			}
			if *watch == 0 || total > 0 {
				fmt.Printf("%s: %d threads visible, %d entries exchanged\n", name, len(counts), total)
			}
		}
		drainEmbeds(ctx, s)
	}
	round()
	if *watch <= 0 {
		return nil
	}
	fmt.Printf("watching every %s (ctrl-c to stop)\n", *watch)
	tick := time.NewTicker(*watch)
	defer tick.Stop()
	for range tick.C {
		round()
	}
	return nil
}

func cmdGrant(ctx context.Context, dataDir string, s store.Store, args []string) error {
	fs := flag.NewFlagSet("grant", flag.ContinueOnError)
	ttl := fs.Duration("ttl", 0, "grant expiry (e.g. 168h); 0 = no expiry")
	if err := fs.Parse(args); err != nil {
		return err
	}
	rest := fs.Args()
	if len(rest) != 3 {
		return fmt.Errorf("usage: grant [-ttl 168h] <thread> <person-principal> <scope,scope>")
	}
	thread, principal, scopesArg := rest[0], rest[1], rest[2]
	var scopes []string
	for _, sc := range strings.Split(scopesArg, ",") {
		sc = strings.TrimSpace(sc)
		if !perm.ValidScope(perm.Scope(sc)) {
			return fmt.Errorf("invalid scope %q (valid: contribute, read, summary, search)", sc)
		}
		scopes = append(scopes, sc)
	}
	body := map[string]any{"principal": principal, "scopes": scopes}
	if *ttl > 0 {
		body["ttl_seconds"] = int64(ttl.Seconds())
	}
	return cmdGrantWrite(ctx, dataDir, s, protolog.KindGrant, thread, body)
}

// cmdGrantWrite signs a control-lane entry with the PERSON key. This CLI
// invocation is the human approval step: only a human at this keyboard
// holds the person key.
func cmdGrantWrite(ctx context.Context, dataDir string, s store.Store, kind, thread string, body map[string]any) error {
	priv, _, err := loadKey(dataDir)
	if err != nil {
		return err
	}
	tl, err := s.Thread(ctx, thread)
	if err != nil {
		return err
	}
	a, err := protolog.NewAuthor(tl, priv)
	if err != nil {
		return err
	}
	e, err := a.Append(protolog.Draft{Kind: kind, Lane: protolog.LaneControl, Body: body})
	if err != nil {
		return err
	}
	if err := s.AppendEntries(ctx, []*protolog.Entry{e}); err != nil {
		return err
	}
	fmt.Println(e.ID)
	return nil
}

func cmdAccess(ctx context.Context, s store.Store, thread string) error {
	tl, err := s.Thread(ctx, thread)
	if err != nil {
		return err
	}
	st := perm.Fold(thread, tl.Entries())
	for p := range st.Stewards {
		fmt.Printf("steward     %s\n", p)
	}
	for _, e := range tl.Entries() {
		if e.Kind != protolog.KindGrant {
			continue
		}
		var body struct {
			Principal string   `json:"principal"`
			Scopes    []string `json:"scopes"`
		}
		if json.Unmarshal(e.Body, &body) != nil {
			continue
		}
		eff := st.EffectiveScopes(body.Principal, time.Now())
		if len(eff) == 0 {
			continue // revoked, denied, or expired
		}
		var have []string
		for sc := range eff {
			have = append(have, string(sc))
		}
		fmt.Printf("granted     %s  %s\n", body.Principal, strings.Join(have, ","))
	}
	return nil
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
