package mcp

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"path/filepath"
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/store"
)

func callText(t *testing.T, sess *sdk.ClientSession, name string, args map[string]any) string {
	t.Helper()
	res, err := sess.CallTool(context.Background(), &sdk.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if res.IsError {
		t.Fatalf("%s returned tool error: %+v", name, res.Content)
	}
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*sdk.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	return b.String()
}

func TestMCPToolSurface(t *testing.T) {
	ctx := context.Background()
	s, err := store.OpenSQLite(filepath.Join(t.TempDir(), "node.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := protolog.PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	node := &Node{Store: s, Key: priv, Self: pid}

	serverT, clientT := sdk.NewInMemoryTransports()
	srv := NewServer(node, "test")
	go srv.Run(ctx, serverT) //nolint:errcheck — ends when client disconnects

	client := sdk.NewClient(&sdk.Implementation{Name: "test-client", Version: "0"}, nil)
	sess, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer sess.Close()

	// The grant-shaped tools must NOT exist — approvals are never tool calls.
	tools, err := sess.ListTools(ctx, &sdk.ListToolsParams{})
	if err != nil {
		t.Fatal(err)
	}
	for _, tool := range tools.Tools {
		switch tool.Name {
		case "grant", "revoke", "deny", "respond_access_request", "approve":
			t.Fatalf("forbidden approval tool exposed over MCP: %s", tool.Name)
		}
	}
	if len(tools.Tools) != 9 {
		t.Fatalf("tool count = %d, want 9", len(tools.Tools))
	}

	if out := callText(t, sess, "whoami", nil); !strings.Contains(out, pid) {
		t.Fatalf("whoami missing principal: %s", out)
	}

	out := callText(t, sess, "create_thread", map[string]any{"title": "pool project"})
	threadID := strings.TrimSpace(strings.TrimPrefix(out, "created thread "))

	callText(t, sess, "post_entry", map[string]any{
		"thread": threadID, "text": "pump arrived, sitting in the garage"})
	callText(t, sess, "post_entry", map[string]any{
		"thread": threadID, "text": "pool project: pump delivered, deck quote pending", "lane": "summary"})

	read := callText(t, sess, "read_thread", map[string]any{"thread": threadID})
	if !strings.Contains(read, "pump arrived") || !strings.Contains(read, "[summary|core.summary]") {
		t.Fatalf("read_thread missing entries:\n%s", read)
	}

	found := callText(t, sess, "search_context", map[string]any{"query": "garage pump"})
	if !strings.Contains(found, threadID) {
		t.Fatalf("search_context did not find the entry:\n%s", found)
	}

	if out := callText(t, sess, "sync_peers", nil); !strings.Contains(out, "no peers") {
		t.Fatalf("sync_peers without peers: %s", out)
	}
}
