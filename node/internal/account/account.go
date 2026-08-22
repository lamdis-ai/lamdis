// Package account holds who may spend an exchange balance, and how much.
//
// An account is a person or organisation with a balance. Their agents reach
// the exchange with API keys, and every key carries its own limits, so a
// runaway agent is bounded by something the exchange enforces rather than by
// the agent's own restraint.
//
// A key is a bearer credential, which is weaker than the signed-principal auth
// the protocol uses elsewhere. That is a deliberate trade for the thing
// developers will actually adopt, and it is made honestly: work authorised by
// a key is recorded as attested_by "api_key", the exchange signs the resulting
// entries with on_behalf_of set to the account, and the verification tier
// treats key-attested evidence as weaker than key-pair-attested evidence. The
// trail says what really happened.
package account

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// KeyPrefix marks an exchange API key. Secret scanners key off prefixes like
// this, which is why it is fixed and distinctive.
const KeyPrefix = "lam_sk_"

// secretAlphabet is Crockford base32, matching the protocol's principal ids
// and capability secrets.
var secretAlphabet = base32.NewEncoding("0123456789ABCDEFGHJKMNPQRSTVWXYZ").WithPadding(base32.NoPadding)

// Limits bound what one key may spend.
//
// They are per-key rather than per-account so that a key handed to an
// experiment cannot drain the balance funding production, and so revoking one
// agent does not disturb the others.
type Limits struct {
	// MaxPerOutcomeMinor caps a single purchase. Zero means the account
	// default applies.
	MaxPerOutcomeMinor int64 `json:"max_per_outcome_minor"`
	// MaxTotalMinor caps everything this key may ever commit. Zero is
	// unlimited, bounded only by the balance.
	MaxTotalMinor int64 `json:"max_total_minor"`
	// MaxOpen caps how many outcomes may be in flight at once, which is what
	// stops a loop from committing the whole balance before any of it
	// resolves. Zero is unlimited.
	MaxOpen int `json:"max_open"`
}

// Key is an issued API key. The secret itself is never stored.
type Key struct {
	ID       string    `json:"id"`
	Account  string    `json:"account"`
	Label    string    `json:"label"`
	Last4    string    `json:"last4"`
	Limits   Limits    `json:"limits"`
	Created  time.Time `json:"created"`
	Expires  time.Time `json:"expires,omitempty"`
	Revoked  bool      `json:"revoked"`
	LastUsed time.Time `json:"last_used,omitempty"`
}

// Active reports whether a key may still be used.
func (k *Key) Active(now time.Time) bool {
	if k.Revoked {
		return false
	}
	return k.Expires.IsZero() || now.Before(k.Expires)
}

// Store persists accounts and keys.
type Store struct {
	db  *sql.DB
	Now func() time.Time
}

func New(db *sql.DB) (*Store, error) {
	s := &Store{db: db, Now: time.Now}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	if err := s.migrateSpend(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id      TEXT PRIMARY KEY,
  email   TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id        TEXT PRIMARY KEY,
  account   TEXT NOT NULL REFERENCES accounts(id),
  hash      TEXT NOT NULL UNIQUE,
  label     TEXT NOT NULL DEFAULT '',
  last4     TEXT NOT NULL DEFAULT '',
  per_out   INTEGER NOT NULL DEFAULT 0,
  max_total INTEGER NOT NULL DEFAULT 0,
  max_open  INTEGER NOT NULL DEFAULT 0,
  created   INTEGER NOT NULL,
  expires   INTEGER NOT NULL DEFAULT 0,
  revoked   INTEGER NOT NULL DEFAULT 0,
  last_used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_keys_account ON api_keys(account);
`)
	return err
}

func (s *Store) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// CreateAccount registers an account. The id is the account's principal id
// where it has one, so the ledger and the signed log agree on who this is.
func (s *Store) CreateAccount(ctx context.Context, id, email string) error {
	if id == "" {
		return fmt.Errorf("account: an account needs an id")
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO accounts(id, email, created) VALUES (?,?,?)
		 ON CONFLICT(id) DO NOTHING`, id, email, s.now().UnixNano())
	return err
}

// Issue mints a key and returns the secret exactly once.
//
// Only the hash is kept, so a copy of the database yields no working keys and
// there is no "show me the key again" to build later — the absence of that
// feature is the security property.
func (s *Store) Issue(ctx context.Context, accountID, label string, lim Limits, ttl time.Duration) (secret string, k *Key, err error) {
	var exists int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM accounts WHERE id = ?`, accountID).Scan(&exists); err != nil {
		return "", nil, err
	}
	if exists == 0 {
		return "", nil, fmt.Errorf("account: no such account %q", accountID)
	}

	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("account: generating key: %w", err)
	}
	body := secretAlphabet.EncodeToString(raw)
	secret = KeyPrefix + body

	sum := sha256.Sum256([]byte(secret))
	hash := hex.EncodeToString(sum[:])
	id := hash[:16]

	now := s.now()
	k = &Key{
		ID: id, Account: accountID, Label: label,
		Last4: body[len(body)-4:], Limits: lim, Created: now,
	}
	if ttl > 0 {
		k.Expires = now.Add(ttl)
	}
	var exp int64
	if !k.Expires.IsZero() {
		exp = k.Expires.UnixNano()
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO api_keys(id, account, hash, label, last4, per_out, max_total, max_open, created, expires)
		 VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id, accountID, hash, label, k.Last4,
		lim.MaxPerOutcomeMinor, lim.MaxTotalMinor, lim.MaxOpen,
		now.UnixNano(), exp); err != nil {
		return "", nil, err
	}
	return secret, k, nil
}

// Authenticate resolves a presented secret to its key.
//
// It returns one generic error for every failure — unknown, revoked, expired,
// malformed — because a caller learning *why* a key was rejected learns
// whether it exists.
var ErrUnauthorized = fmt.Errorf("account: unauthorized")

func (s *Store) Authenticate(ctx context.Context, presented string) (*Key, error) {
	presented = strings.TrimSpace(presented)
	if !strings.HasPrefix(presented, KeyPrefix) {
		return nil, ErrUnauthorized
	}
	sum := sha256.Sum256([]byte(presented))
	hash := hex.EncodeToString(sum[:])

	var k Key
	var exp, created, lastUsed int64
	var revoked int
	var storedHash string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, account, hash, label, last4, per_out, max_total, max_open, created, expires, revoked, last_used
		 FROM api_keys WHERE hash = ?`, hash).
		Scan(&k.ID, &k.Account, &storedHash, &k.Label, &k.Last4,
			&k.Limits.MaxPerOutcomeMinor, &k.Limits.MaxTotalMinor, &k.Limits.MaxOpen,
			&created, &exp, &revoked, &lastUsed)
	if err == sql.ErrNoRows {
		return nil, ErrUnauthorized
	} else if err != nil {
		return nil, err
	}
	// The lookup was by hash, so this compares equal by construction; it is
	// here so the comparison is constant-time if the lookup ever changes.
	if subtle.ConstantTimeCompare([]byte(storedHash), []byte(hash)) != 1 {
		return nil, ErrUnauthorized
	}

	k.Created = time.Unix(0, created)
	if exp != 0 {
		k.Expires = time.Unix(0, exp)
	}
	if lastUsed != 0 {
		k.LastUsed = time.Unix(0, lastUsed)
	}
	k.Revoked = revoked != 0
	if !k.Active(s.now()) {
		return nil, ErrUnauthorized
	}
	_, _ = s.db.ExecContext(ctx,
		`UPDATE api_keys SET last_used = ? WHERE id = ?`, s.now().UnixNano(), k.ID)
	return &k, nil
}

// Revoke disables a key immediately.
func (s *Store) Revoke(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE api_keys SET revoked = 1 WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("account: no such key %q", id)
	}
	return nil
}

// List returns an account's keys, never their secrets.
func (s *Store) List(ctx context.Context, accountID string) ([]*Key, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, account, label, last4, per_out, max_total, max_open, created, expires, revoked, last_used
		 FROM api_keys WHERE account = ? ORDER BY created DESC`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Key
	for rows.Next() {
		var k Key
		var created, exp, lastUsed int64
		var revoked int
		if err := rows.Scan(&k.ID, &k.Account, &k.Label, &k.Last4,
			&k.Limits.MaxPerOutcomeMinor, &k.Limits.MaxTotalMinor, &k.Limits.MaxOpen,
			&created, &exp, &revoked, &lastUsed); err != nil {
			return nil, err
		}
		k.Created = time.Unix(0, created)
		if exp != 0 {
			k.Expires = time.Unix(0, exp)
		}
		if lastUsed != 0 {
			k.LastUsed = time.Unix(0, lastUsed)
		}
		k.Revoked = revoked != 0
		out = append(out, &k)
	}
	return out, rows.Err()
}
