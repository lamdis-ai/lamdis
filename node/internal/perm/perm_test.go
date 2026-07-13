package perm

import (
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"

	protolog "github.com/lamdis-ai/lamdis-protocol/node/internal/log"
)

func key(t *testing.T) (ed25519.PrivateKey, string) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := protolog.PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		t.Fatal(err)
	}
	return priv, pid
}

func now() time.Time { return time.Date(2026, 7, 13, 9, 0, 0, 0, time.UTC) }

func setup(t *testing.T) (*protolog.ThreadLog, *protolog.Author, string, ed25519.PrivateKey) {
	t.Helper()
	priv, pid := key(t)
	l, _, err := protolog.NewThread(priv, "perm test", now)
	if err != nil {
		t.Fatal(err)
	}
	a, err := protolog.NewAuthor(l, priv)
	if err != nil {
		t.Fatal(err)
	}
	a.Now = now
	return l, a, pid, priv
}

func TestDenyByDefaultAndStewardImplicit(t *testing.T) {
	l, _, steward, _ := setup(t)
	_, stranger := key(t)
	st := Fold(l.Thread, l.Entries())
	if got := st.EffectiveScopes(stranger, now()); len(got) != 0 {
		t.Fatalf("stranger has scopes %v, want none", got)
	}
	if lanes := st.Lanes(stranger, now()); lanes != nil {
		t.Fatalf("stranger has lanes %v, want none", lanes)
	}
	if !st.EffectiveScopes(steward, now()).Has(ScopeRead) {
		t.Fatal("steward lacks implicit read")
	}
}

func TestGrantSummaryOnlyLanes(t *testing.T) {
	l, a, _, _ := setup(t)
	_, bob := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob, "scopes": []string{"summary", "search"}}}); err != nil {
		t.Fatal(err)
	}
	st := Fold(l.Thread, l.Entries())
	ss := st.EffectiveScopes(bob, now())
	if !ss.Has(ScopeSummary) || !ss.Has(ScopeSearch) || ss.Has(ScopeRead) || ss.Has(ScopeContribute) {
		t.Fatalf("bob scopes = %v", ss)
	}
	lanes := st.Lanes(bob, now())
	if len(lanes) != 2 || lanes[0] != protolog.LaneControl || lanes[1] != protolog.LaneSummary {
		t.Fatalf("bob lanes = %v, want [control summary]", lanes)
	}
}

func TestNonStewardAndAgentCannotGrant(t *testing.T) {
	l, a, steward, _ := setup(t)
	evePriv, eve := key(t)
	_, bob := key(t)
	// Eve (not a steward) writes a grant into the control lane; the entry is
	// chain-valid but the fold must ignore it.
	ea, err := protolog.NewAuthor(l, evePriv)
	if err != nil {
		t.Fatal(err)
	}
	ea.Now = now
	if _, err := ea.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob, "scopes": []string{"read"}}}); err != nil {
		t.Fatal(err)
	}
	st := Fold(l.Thread, l.Entries())
	if len(st.EffectiveScopes(bob, now())) != 0 {
		t.Fatal("non-steward grant took effect")
	}
	_ = eve

	// The steward delegates an agent key, then that agent tries to grant:
	// agent-signed grants must never take effect, even from a steward's agent.
	agentPriv, agentPid := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindDelegation, Lane: protolog.LaneControl,
		Body: map[string]any{"agent": agentPid}}); err != nil {
		t.Fatal(err)
	}
	// Make the agent a steward-by-inheritance test: the agent inherits the
	// person's scopes but must NOT inherit grant authority.
	ag, err := protolog.NewAuthor(l, agentPriv)
	if err != nil {
		t.Fatal(err)
	}
	ag.Now = now
	if _, err := ag.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		OnBehalfOf: steward,
		Body:       map[string]any{"principal": bob, "scopes": []string{"read"}}}); err != nil {
		t.Fatal(err)
	}
	st = Fold(l.Thread, l.Entries())
	if len(st.EffectiveScopes(bob, now())) != 0 {
		t.Fatal("agent-signed grant took effect")
	}
	// The delegated agent inherits its person's read access.
	if !st.EffectiveScopes(agentPid, now()).Has(ScopeRead) {
		t.Fatal("delegated agent did not inherit person scopes")
	}
}

func TestRevokeAndDenyWinsOverConcurrentGrant(t *testing.T) {
	l, a, _, _ := setup(t)
	_, bob := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob, "scopes": []string{"read"}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindRevoke, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob}}); err != nil {
		t.Fatal(err)
	}
	st := Fold(l.Thread, l.Entries())
	if len(st.EffectiveScopes(bob, now())) != 0 {
		t.Fatal("revoked principal still has scopes")
	}

	// Concurrency: craft a second steward whose grant carries the SAME
	// lamport as the revoke (a real concurrent fork on another replica).
	revokeLamport := l.MaxLamport()
	stewardPriv2, steward2 := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindMembership, Lane: protolog.LaneControl,
		Body: map[string]any{"member": steward2, "role": "steward"}}); err != nil {
		t.Fatal(err)
	}
	// Replay everything onto a fresh replica, then append steward2's grant
	// with lamport pinned to the revoke's lamport via a forked log.
	replica := protolog.NewThreadLog(l.Thread)
	for _, e := range l.Entries() {
		if err := replica.Append(e); err != nil {
			t.Fatal(err)
		}
	}
	a2, err := protolog.NewAuthor(replica, stewardPriv2)
	if err != nil {
		t.Fatal(err)
	}
	a2.Now = now
	g, err := a2.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob, "scopes": []string{"read"}}})
	if err != nil {
		t.Fatal(err)
	}
	if g.Lamport <= revokeLamport {
		t.Fatalf("test setup: grant lamport %d not > revoke %d", g.Lamport, revokeLamport)
	}
	// Later-lamport grant by a steward legitimately re-grants: sanity check.
	st = Fold(replica.Thread, replica.Entries())
	if !st.EffectiveScopes(bob, now()).Has(ScopeRead) {
		t.Fatal("later grant by steward should re-grant")
	}
	// Now the true tie: fold a synthetic order where the grant's lamport
	// equals the revoke's. Simulate by folding entries with the grant's
	// lamport manually rewritten in a copy (fold reads lamport only).
	tie := *g
	tie.Lamport = revokeLamport
	var forged []*protolog.Entry
	for _, e := range l.Entries() {
		forged = append(forged, e)
	}
	forged = append(forged, &tie)
	st = Fold(l.Thread, sortTotal(forged))
	if len(st.EffectiveScopes(bob, now())) != 0 {
		t.Fatal("same-lamport grant beat the revoke; deny must win ties")
	}
}

func sortTotal(es []*protolog.Entry) []*protolog.Entry {
	out := append([]*protolog.Entry(nil), es...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && protolog.Less(out[j], out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

func TestGrantTTLExpiry(t *testing.T) {
	l, a, _, _ := setup(t)
	_, bob := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindGrant, Lane: protolog.LaneControl,
		Body: map[string]any{"principal": bob, "scopes": []string{"summary"}, "ttl_seconds": 3600}}); err != nil {
		t.Fatal(err)
	}
	st := Fold(l.Thread, l.Entries())
	if !st.EffectiveScopes(bob, now().Add(30*time.Minute)).Has(ScopeSummary) {
		t.Fatal("grant not effective within TTL")
	}
	if len(st.EffectiveScopes(bob, now().Add(2*time.Hour))) != 0 {
		t.Fatal("grant still effective after TTL expiry")
	}
}

func TestDelegationRevocationSeversAgent(t *testing.T) {
	l, a, _, _ := setup(t)
	_, agentPid := key(t)
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindDelegation, Lane: protolog.LaneControl,
		Body: map[string]any{"agent": agentPid}}); err != nil {
		t.Fatal(err)
	}
	st := Fold(l.Thread, l.Entries())
	if !st.EffectiveScopes(agentPid, now()).Has(ScopeRead) {
		t.Fatal("delegated agent lacks inherited scopes")
	}
	if _, err := a.Append(protolog.Draft{Kind: protolog.KindDelegation, Lane: protolog.LaneControl,
		Body: map[string]any{"agent": agentPid, "revoked": true}}); err != nil {
		t.Fatal(err)
	}
	st = Fold(l.Thread, l.Entries())
	if len(st.EffectiveScopes(agentPid, now())) != 0 {
		t.Fatal("revoked delegation did not sever agent access")
	}
}
