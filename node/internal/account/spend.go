package account

import (
	"context"
	"database/sql"
	"fmt"
)

// Spend tracking is separate from the ledger on purpose.
//
// The ledger records what the account's money did; this records what a
// particular key caused. They answer different questions, and merging them
// would put a credential concept inside the one package that must stay a pure
// statement about money.

func (s *Store) migrateSpend() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS key_commitments (
  outcome  TEXT PRIMARY KEY,
  key_id   TEXT NOT NULL,
  account  TEXT NOT NULL,
  amount   INTEGER NOT NULL,
  currency TEXT NOT NULL,
  open     INTEGER NOT NULL DEFAULT 1,
  created  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commitments_key ON key_commitments(key_id, open);
`)
	return err
}

// ErrOverLimit is returned when a key's own limits stop a purchase. It is
// deliberately distinct from an insufficient balance: one means the agent has
// exceeded what it was trusted with, the other means the account is empty, and
// a caller needs to tell a human different things about each.
type ErrOverLimit struct {
	Reason string
}

func (e ErrOverLimit) Error() string { return "account: over limit: " + e.Reason }

// Commit records that a key has committed funds to an outcome, after checking
// that its limits allow it.
//
// The check and the record happen in one transaction, so two concurrent
// purchases cannot both observe room for the last one.
func (s *Store) Commit(ctx context.Context, k *Key, outcome string, amountMinor int64, currency string) error {
	if k == nil {
		return ErrUnauthorized
	}
	if amountMinor <= 0 {
		return fmt.Errorf("account: a commitment must be positive")
	}
	lim := k.Limits
	if lim.MaxPerOutcomeMinor > 0 && amountMinor > lim.MaxPerOutcomeMinor {
		return ErrOverLimit{Reason: fmt.Sprintf(
			"this outcome commits %d, above the key's per-outcome limit of %d",
			amountMinor, lim.MaxPerOutcomeMinor)}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if lim.MaxTotalMinor > 0 {
		var spent sql.NullInt64
		if err := tx.QueryRowContext(ctx,
			`SELECT SUM(amount) FROM key_commitments WHERE key_id = ?`, k.ID).Scan(&spent); err != nil {
			return err
		}
		if spent.Int64+amountMinor > lim.MaxTotalMinor {
			return ErrOverLimit{Reason: fmt.Sprintf(
				"this key has committed %d of its %d total limit and this outcome needs %d",
				spent.Int64, lim.MaxTotalMinor, amountMinor)}
		}
	}
	if lim.MaxOpen > 0 {
		var open int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM key_commitments WHERE key_id = ? AND open = 1`, k.ID).Scan(&open); err != nil {
			return err
		}
		if open >= lim.MaxOpen {
			return ErrOverLimit{Reason: fmt.Sprintf(
				"this key already has %d outcomes in flight, its limit", open)}
		}
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO key_commitments(outcome, key_id, account, amount, currency, created)
		 VALUES (?,?,?,?,?,?)
		 ON CONFLICT(outcome) DO NOTHING`,
		outcome, k.ID, k.Account, amountMinor, currency, s.now().UnixNano()); err != nil {
		return err
	}
	return tx.Commit()
}

// CloseOut marks an outcome resolved, freeing one of the key's in-flight slots.
func (s *Store) CloseOut(ctx context.Context, outcome string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE key_commitments SET open = 0 WHERE outcome = ?`, outcome)
	return err
}

// Committed reports what a key has committed in total, and how much of that is
// still in flight.
func (s *Store) Committed(ctx context.Context, keyID string) (total, open int64, err error) {
	var t, o sql.NullInt64
	err = s.db.QueryRowContext(ctx,
		`SELECT SUM(amount), SUM(CASE WHEN open = 1 THEN amount ELSE 0 END)
		 FROM key_commitments WHERE key_id = ?`, keyID).Scan(&t, &o)
	return t.Int64, o.Int64, err
}
