package exchange

import (
	"encoding/json"
	"net/http"
	"strings"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	nodemcp "github.com/lamdis-ai/lamdis-protocol/node/internal/mcp"
)

// The front door.
//
// Using this exchange from an agent meant: clone a repo, build a Go binary,
// write an .mcp.json pointing at it, and put a key in the environment. Three
// gates before anybody has seen a single tool, and every one of them loses
// people who were only ever going to spend ten minutes finding out whether
// this was interesting.
//
// A remote endpoint removes two of them:
//
//	claude mcp add --transport http lamdis https://exchange.lamdis.ai/mcp \
//	  --header "Authorization: Bearer lam_..."
//
// One line, no build, no binary. What remains is the key, which cannot go —
// the tools spend real money out of a real balance, and an endpoint anybody
// could call anonymously would be an endpoint anybody could spend somebody
// else's money through.
//
// The security property that makes this safe is worth stating plainly, because
// getting it wrong would be catastrophic and the wrong version looks almost
// identical: the server is built per request, from the key that request
// presented. There is no shared Exchange client and no server-held key. Two
// agents calling this endpoint at the same time are two different principals
// with two different balances, and neither can reach the other's.

// mcpPath is where the endpoint lives. Named once so the docs, the console and
// the handler cannot drift.
const mcpPath = "/mcp"

func (s *Server) registerMCP(mux *http.ServeMux) {
	h := sdk.NewStreamableHTTPHandler(s.mcpServerFor, nil)
	mux.Handle("POST "+mcpPath, s.requireAgentKey(h))
	mux.Handle("GET "+mcpPath, s.requireAgentKey(h))
	mux.Handle("DELETE "+mcpPath, s.requireAgentKey(h))
}

// mcpServerFor builds a server bound to the credential this request presented.
//
// Called per request by the SDK. It reads the key back out of the request
// rather than closing over anything, which is what keeps one caller's tools
// from ever holding another caller's balance.
func (s *Server) mcpServerFor(r *http.Request) *sdk.Server {
	srv := sdk.NewServer(&sdk.Implementation{
		Name: "lamdis-exchange", Version: "1",
	}, nil)
	nodemcp.RegisterExchange(srv, nodemcp.NewExchange(s.BaseURL, agentKeyFrom(r)))
	return srv
}

// agentKeyFrom reads the caller's key from either header.
//
// Authorization: Bearer is what every MCP client sends, because it is what the
// --header flag is for and what OAuth would use. X-Lamdis-Key is what the rest
// of this API already takes. Accepting both means the documented one-liner
// works and nothing that already worked stops.
func agentKeyFrom(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get("Authorization")); v != "" {
		if len(v) > 7 && strings.EqualFold(v[:7], "bearer ") {
			return strings.TrimSpace(v[7:])
		}
		return v
	}
	return strings.TrimSpace(r.Header.Get("X-Lamdis-Key"))
}

// requireAgentKey refuses an unauthenticated caller before the MCP machinery
// runs, and says how to get a key rather than returning a bare 401.
//
// The refusal is deliberately helpful. Somebody hitting this has already
// decided to try the exchange; sending them away with "unauthorized" and no
// next step wastes the one moment they were willing to spend on it.
func (s *Server) requireAgentKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := agentKeyFrom(r)
		if key == "" {
			w.Header().Set("Content-Type", "application/json")
			// WWW-Authenticate so a client that knows how to prompt for a
			// credential does, instead of showing a raw failure.
			w.Header().Set("WWW-Authenticate", `Bearer realm="lamdis-exchange"`)
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "this endpoint needs an agent key, because its tools " +
					"spend real money out of a real balance",
				"how": "Sign in at " + s.BaseURL + "/console, issue an agent key " +
					"under Integration, and pass it as a bearer token.",
				"example": `claude mcp add --transport http lamdis ` +
					s.BaseURL + mcpPath + ` --header "Authorization: Bearer lam_..."`,
			})
			return
		}
		// Checked here so a bad key fails once, plainly, rather than as an
		// error inside every tool call the agent then tries.
		if s.agents != nil {
			probe := r.Clone(r.Context())
			probe.Header.Set("X-Lamdis-Key", key)
			if _, _, ok := s.agents.AuthenticateAgent(probe); !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]any{
					"error": "that agent key is not valid on this exchange",
					"how":   "Issue a new one at " + s.BaseURL + "/console under Integration.",
				})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
