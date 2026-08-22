package account

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ncruces/go-sqlite3/driver"
)

func newStore(t *testing.T) *Store {
	t.Helper()
	db, err := driver.Open("file:" + filepath.Join(t.TempDir(), "a.db") +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatalf("opening: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	s, err := New(db)
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	if err := s.CreateAccount(context.Background(), "ed25519:acct", "a@example.com"); err != nil {
		t.Fatalf("account: %v", err)
	}
	return s
}

// The secret is returned once and never stored, so a database copy is not a
// set of working credentials.
func TestSecretIsNotRecoverableFromStorage(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	secret, k, err := s.Issue(ctx, "ed25519:acct", "prod agent", Limits{}, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(secret, KeyPrefix) {
		t.Fatalf("secret %q lacks the scannable prefix", secret[:8])
	}
	var found int
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM api_keys WHERE hash = ? OR label = ?`, secret, secret).Scan(&found); err != nil {
		t.Fatal(err)
	}
	if found != 0 {
		t.Fatal("the secret itself was written to the database")
	}
	// What is stored identifies the key without being usable as one.
	if k.Last4 == "" || len(k.Last4) != 4 {
		t.Fatalf("last4 = %q", k.Last4)
	}
}

func TestAuthenticateAcceptsOnlyTheRealSecret(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	secret, issued, err := s.Issue(ctx, "ed25519:acct", "agent", Limits{}, 0)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Authenticate(ctx, secret)
	if err != nil {
		t.Fatalf("the issued secret was rejected: %v", err)
	}
	if got.ID != issued.ID || got.Account != "ed25519:acct" {
		t.Fatalf("authenticated as %+v", got)
	}
	for _, bad := range []string{
		"", "lam_sk_", secret + "X", secret[:len(secret)-1],
		strings.Replace(secret, KeyPrefix, "lam_pk_", 1),
	} {
		if _, err := s.Authenticate(ctx, bad); err == nil {
			t.Fatalf("a bad secret was accepted: %q", bad)
		}
	}
}

// Every rejection must look the same, or the error tells an attacker whether
// a key exists.
func TestRejectionsAreIndistinguishable(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	secret, k, _ := s.Issue(ctx, "ed25519:acct", "agent", Limits{}, 0)
	if err := s.Revoke(ctx, k.ID); err != nil {
		t.Fatal(err)
	}
	_, revokedErr := s.Authenticate(ctx, secret)
	_, unknownErr := s.Authenticate(ctx, KeyPrefix+"NEVERISSUEDNEVERISSUEDNEVERISSUED")
	if revokedErr == nil || unknownErr == nil {
		t.Fatal("a revoked or unknown key authenticated")
	}
	if revokedErr.Error() != unknownErr.Error() {
		t.Fatalf("revoked says %q but unknown says %q", revokedErr, unknownErr)
	}
}

func TestExpiredKeyIsRejected(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	now := time.Unix(1700000000, 0)
	s.Now = func() time.Time { return now }
	secret, _, err := s.Issue(ctx, "ed25519:acct", "short-lived", Limits{}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, secret); err != nil {
		t.Fatalf("a fresh key was rejected: %v", err)
	}
	now = now.Add(2 * time.Hour)
	if _, err := s.Authenticate(ctx, secret); err == nil {
		t.Fatal("an expired key still authenticated")
	}
}

// A key may not exceed its per-outcome limit, however many times it tries.
func TestPerOutcomeLimitEnforced(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	_, k, _ := s.Issue(ctx, "ed25519:acct", "agent",
		Limits{MaxPerOutcomeMinor: 2500}, 0)

	if err := s.Commit(ctx, k, "th_1", 2500, "USD"); err != nil {
		t.Fatalf("a purchase at exactly the limit was refused: %v", err)
	}
	err := s.Commit(ctx, k, "th_2", 2501, "USD")
	var over ErrOverLimit
	if !errors.As(err, &over) {
		t.Fatalf("a purchase over the limit returned %v, want ErrOverLimit", err)
	}
}

// The total limit is what stops a loop, not the per-outcome one.
func TestTotalLimitStopsRepeatedSmallPurchases(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	_, k, _ := s.Issue(ctx, "ed25519:acct", "agent",
		Limits{MaxPerOutcomeMinor: 500, MaxTotalMinor: 2000}, 0)

	ok := 0
	for i := 0; i < 20; i++ {
		if err := s.Commit(ctx, k, "th_"+string(rune('a'+i)), 500, "USD"); err == nil {
			ok++
		}
	}
	if ok != 4 {
		t.Fatalf("%d purchases of 500 succeeded against a 2000 total, want 4", ok)
	}
	total, _, err := s.Committed(ctx, k.ID)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2000 {
		t.Fatalf("committed %d, want 2000", total)
	}
}

// In-flight limits bound exposure while outcomes are unresolved, which total
// limits alone cannot do.
func TestOpenOutcomeLimit(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	_, k, _ := s.Issue(ctx, "ed25519:acct", "agent", Limits{MaxOpen: 2}, 0)

	if err := s.Commit(ctx, k, "th_1", 100, "USD"); err != nil {
		t.Fatal(err)
	}
	if err := s.Commit(ctx, k, "th_2", 100, "USD"); err != nil {
		t.Fatal(err)
	}
	if err := s.Commit(ctx, k, "th_3", 100, "USD"); err == nil {
		t.Fatal("a third outcome opened against a limit of two")
	}
	// Resolving one frees the slot.
	if err := s.CloseOut(ctx, "th_1"); err != nil {
		t.Fatal(err)
	}
	if err := s.Commit(ctx, k, "th_3", 100, "USD"); err != nil {
		t.Fatalf("a slot did not free up after an outcome closed: %v", err)
	}
}

// One compromised key must not be able to spend what another was trusted with.
func TestKeysHaveSeparateLimits(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	_, small, _ := s.Issue(ctx, "ed25519:acct", "experiment", Limits{MaxTotalMinor: 100}, 0)
	_, big, _ := s.Issue(ctx, "ed25519:acct", "production", Limits{MaxTotalMinor: 100000}, 0)

	if err := s.Commit(ctx, small, "th_1", 100, "USD"); err != nil {
		t.Fatal(err)
	}
	if err := s.Commit(ctx, small, "th_2", 100, "USD"); err == nil {
		t.Fatal("the experiment key spent past its limit")
	}
	// The production key is unaffected by the other's exhaustion.
	if err := s.Commit(ctx, big, "th_3", 50000, "USD"); err != nil {
		t.Fatalf("production key blocked by another key's limit: %v", err)
	}
}

// Revoking a key stops it immediately without disturbing its siblings.
func TestRevokeIsImmediateAndScoped(t *testing.T) {
	ctx := context.Background()
	s := newStore(t)
	leaked, lk, _ := s.Issue(ctx, "ed25519:acct", "leaked", Limits{}, 0)
	other, _, _ := s.Issue(ctx, "ed25519:acct", "other", Limits{}, 0)

	if _, err := s.Authenticate(ctx, leaked); err != nil {
		t.Fatal(err)
	}
	if err := s.Revoke(ctx, lk.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(ctx, leaked); err == nil {
		t.Fatal("a revoked key still worked")
	}
	if _, err := s.Authenticate(ctx, other); err != nil {
		t.Fatalf("revoking one key broke another: %v", err)
	}
	keys, err := s.List(ctx, "ed25519:acct")
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 {
		t.Fatalf("listed %d keys, want 2", len(keys))
	}
}

// A key cannot be issued for an account that does not exist.
func TestIssueRequiresAnAccount(t *testing.T) {
	s := newStore(t)
	if _, _, err := s.Issue(context.Background(), "ed25519:nobody", "x", Limits{}, 0); err == nil {
		t.Fatal("a key was issued against a nonexistent account")
	}
}
