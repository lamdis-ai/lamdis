package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/account"
)

// Agents act for people, and the credential says whose.
//
// A person signs in with an email and a code. Their agent cannot do that — it
// has no inbox — so it carries a key the person issued from their own account,
// and everything it does is attributed to them. That is the honest shape: an
// agent is not a party to anything, it is somebody's instrument, and a market
// where instruments were parties would have nobody to hold responsible.
//
// The key is bounded when it is issued, not trusted afterwards. Per-outcome,
// total, and in-flight limits are checked by the exchange on every purchase,
// so an agent in a loop is stopped by us rather than by its own good sense.
type AgentKeys struct {
	Accounts *account.Store
	Workers  *Workers
	Now      func() time.Time
}

func (a *AgentKeys) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func (a *AgentKeys) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/agent-keys", a.handleIssue)
	mux.HandleFunc("GET /v1/agent-keys", a.handleList)
	mux.HandleFunc("DELETE /v1/agent-keys/{id}", a.handleRevoke)
}

// person resolves the signed-in human behind a request. Issuing a credential
// for an agent is a thing only a person may do, so an agent key is not
// accepted here: otherwise one compromised key mints unlimited replacements.
func (a *AgentKeys) person(r *http.Request, body []byte) (*Worker, bool) {
	if r.Header.Get("Authorization") == "" {
		return nil, false
	}
	w, err := a.Workers.Authenticate(r, body, a.now())
	if err != nil || !w.Verified {
		return nil, false
	}
	return w, true
}

type issueKeyRequest struct {
	Label string `json:"label"`
	// Limits, in minor units. Zero means unlimited, which is allowed but is a
	// decision the person makes rather than a default they never saw.
	MaxPerJobMinor int64 `json:"max_per_job_minor,omitempty"`
	MaxTotalMinor  int64 `json:"max_total_minor,omitempty"`
	MaxOpen        int   `json:"max_open,omitempty"`
	// ExpiresDays bounds the key's life. Absent means it does not expire.
	ExpiresDays int `json:"expires_days,omitempty"`
}

func (a *AgentKeys) handleIssue(w http.ResponseWriter, r *http.Request) {
	body, err := readBody(r)
	if err != nil {
		refuse(w)
		return
	}
	person, ok := a.person(r, body)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{
			"error": "sign in to issue a key for your agent", "signin": "/signin",
		})
		return
	}
	var in issueKeyRequest
	if err := json.Unmarshal(body, &in); err != nil {
		writeWork(w, http.StatusBadRequest, map[string]string{"error": "malformed request"})
		return
	}
	if in.Label == "" {
		in.Label = "agent"
	}
	if err := a.Accounts.CreateAccount(r.Context(), person.ID, person.Email); err != nil {
		writeWork(w, http.StatusInternalServerError,
			map[string]string{"error": "could not prepare your account"})
		return
	}
	var ttl time.Duration
	if in.ExpiresDays > 0 {
		ttl = time.Duration(in.ExpiresDays) * 24 * time.Hour
	}
	secret, key, err := a.Accounts.Issue(r.Context(), person.ID, in.Label, account.Limits{
		MaxPerOutcomeMinor: in.MaxPerJobMinor,
		MaxTotalMinor:      in.MaxTotalMinor,
		MaxOpen:            in.MaxOpen,
	}, ttl)
	if err != nil {
		writeWork(w, http.StatusInternalServerError,
			map[string]string{"error": "could not issue a key"})
		return
	}
	// Shown once. There is no endpoint that returns it again, and the absence
	// of one is the security property.
	writeWork(w, http.StatusOK, map[string]any{
		"key":    secret,
		"id":     key.ID,
		"label":  key.Label,
		"last4":  key.Last4,
		"limits": key.Limits,
		"note":   "copy this now; it is not shown again",
	})
}

func (a *AgentKeys) handleList(w http.ResponseWriter, r *http.Request) {
	body, _ := readBody(r)
	person, ok := a.person(r, body)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{"error": "sign in"})
		return
	}
	keys, err := a.Accounts.List(r.Context(), person.ID)
	if err != nil {
		writeWork(w, http.StatusInternalServerError, map[string]string{"error": "could not list keys"})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{"keys": keys})
}

func (a *AgentKeys) handleRevoke(w http.ResponseWriter, r *http.Request) {
	body, _ := readBody(r)
	person, ok := a.person(r, body)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{"error": "sign in"})
		return
	}
	// A key may only be revoked by the account that owns it.
	keys, err := a.Accounts.List(r.Context(), person.ID)
	if err != nil {
		refuse(w)
		return
	}
	id := r.PathValue("id")
	for _, k := range keys {
		if k.ID == id {
			if err := a.Accounts.Revoke(r.Context(), id); err != nil {
				refuse(w)
				return
			}
			writeWork(w, http.StatusOK, map[string]any{"revoked": id})
			return
		}
	}
	// Not theirs, or not real. The same answer either way.
	writeWork(w, http.StatusNotFound, map[string]any{"error": "no such key"})
}

// AuthenticateAgent resolves an agent key to the person it acts for.
//
// The returned worker is the human. Nothing downstream needs to know an agent
// was involved, except the trail, which records it.
func (a *AgentKeys) AuthenticateAgent(r *http.Request) (*account.Key, *Worker, bool) {
	presented := r.Header.Get("X-Lamdis-Key")
	if presented == "" {
		return nil, nil, false
	}
	key, err := a.Accounts.Authenticate(r.Context(), presented)
	if err != nil {
		return nil, nil, false
	}
	person, ok := a.Workers.Get(key.Account)
	if !ok {
		return nil, nil, false
	}
	return key, person, true
}
