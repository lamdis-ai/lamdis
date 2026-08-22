// Package ledger is where money actually is.
//
// The signed log says what was agreed; this says what is owed to whom. The two
// are kept apart on purpose — the fold never reads the ledger, so comparing
// them is a real check rather than a tautology.
//
// Every movement is double-entry: an operation writes two or more postings
// that sum to zero, and the sum of every posting ever written is zero forever.
// Conservation is therefore structural. There is no code path that creates
// money, because creating money would mean writing an unbalanced operation,
// and Post refuses to.
//
// This is what makes prefunded balances work. A card rail charges roughly
// 2.9% + 30c per movement, which is more than a $1.50 review is worth; moving
// the outcome lifecycle onto internal accounts makes each hold, capture and
// release exact, instant and free. Stripe then touches money only at the
// edges — a top-up in, a payout out — where the fee is amortised over many
// outcomes.
package ledger

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/ncruces/go-sqlite3/driver"
)

// Account names are structured strings rather than rows, so a new buyer or
// provider needs no registration step before money can be recorded against
// them. The prefix determines the rules.
const (
	// prefixBalance holds a buyer's topped-up funds, spendable by their agents.
	prefixBalance = "balance:"
	// prefixEscrow holds funds committed to one outcome and spendable by
	// nobody until it resolves.
	prefixEscrow = "escrow:"
	// prefixPayable holds what a provider has earned and not yet been paid.
	// Micro-payouts are uneconomic, so earnings accumulate here and leave in
	// one transfer once they clear a threshold.
	prefixPayable = "payable:"

	// AccountFees is the exchange's revenue.
	AccountFees = "fees"
	// AccountExternal is the contra-account for the world outside the
	// exchange. It goes negative as money arrives, which is correct: that
	// money is owed to somebody inside.
	AccountExternal = "external"
)

// BalanceOf, EscrowOf and PayableOf name accounts.
func BalanceOf(principal string) string { return prefixBalance + principal }
func EscrowOf(outcome string) string    { return prefixEscrow + outcome }
func PayableOf(principal string) string { return prefixPayable + principal }

// custodial reports whether an account holds value on someone's behalf. These
// may never go negative: an overdrawn balance is somebody spending money that
// was never topped up.
func custodial(account string) bool {
	return strings.HasPrefix(account, prefixBalance) ||
		strings.HasPrefix(account, prefixEscrow) ||
		strings.HasPrefix(account, prefixPayable)
}

// Posting is one side of a movement. Positive means the account gained value.
type Posting struct {
	Account     string
	AmountMinor int64
}

// Receipt is what an operation did.
type Receipt struct {
	Key      string
	Op       string
	Postings []Posting
	At       time.Time
	// Replay is true when this key had already been applied and the stored
	// result was returned untouched.
	Replay bool
}

// Ledger is the money store.
type Ledger struct {
	db  *sql.DB
	Now func() time.Time
}

// Open creates a ledger over its own SQLite file.
func Open(path string) (*Ledger, error) {
	db, err := driver.Open("file:" + path +
		"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	l, err := New(db)
	if err != nil {
		db.Close()
		return nil, err
	}
	return l, nil
}

// New wraps an existing connection, so the ledger can share the node's
// database file.
func New(db *sql.DB) (*Ledger, error) {
	l := &Ledger{db: db, Now: time.Now}
	if err := l.migrate(); err != nil {
		return nil, err
	}
	return l, nil
}

func (l *Ledger) migrate() error {
	_, err := l.db.Exec(`
CREATE TABLE IF NOT EXISTS ledger_ops (
  key      TEXT PRIMARY KEY,
  op       TEXT NOT NULL,
  outcome  TEXT NOT NULL,
  currency TEXT NOT NULL,
  ref      TEXT NOT NULL DEFAULT '',
  created  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_postings (
  id       INTEGER PRIMARY KEY,
  key      TEXT NOT NULL REFERENCES ledger_ops(key),
  account  TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_postings_account ON ledger_postings(account, currency);
CREATE INDEX IF NOT EXISTS idx_ops_outcome ON ledger_ops(outcome);
`)
	return err
}

func (l *Ledger) now() time.Time {
	if l.Now != nil {
		return l.Now()
	}
	return time.Now()
}

// Post applies one balanced operation.
//
// The key is the idempotency key derived from the signed instruction, so the
// same instruction applied twice — after a crash, on another node, days later
// — moves money once. A repeated key returns the original postings rather than
// an error, because the caller's intent has been satisfied either way.
func (l *Ledger) Post(ctx context.Context, key, op, outcome, currency string, postings []Posting) (Receipt, error) {
	if key == "" {
		return Receipt{}, fmt.Errorf("ledger: operation has no idempotency key")
	}
	if len(postings) < 2 {
		return Receipt{}, fmt.Errorf("ledger: %s has %d postings; a movement has at least two sides",
			op, len(postings))
	}
	currency = strings.ToUpper(currency)

	var sum int64
	for _, p := range postings {
		if p.Account == "" {
			return Receipt{}, fmt.Errorf("ledger: %s has a posting with no account", op)
		}
		sum += p.AmountMinor
	}
	// The one invariant everything else rests on.
	if sum != 0 {
		return Receipt{}, fmt.Errorf("ledger: %s does not balance; postings sum to %d, not 0", op, sum)
	}

	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return Receipt{}, err
	}
	defer tx.Rollback()

	// An already-applied key returns what it did the first time.
	var priorOp string
	err = tx.QueryRowContext(ctx, `SELECT op FROM ledger_ops WHERE key = ?`, key).Scan(&priorOp)
	if err == nil {
		prior, perr := l.postingsFor(ctx, tx, key)
		if perr != nil {
			return Receipt{}, perr
		}
		return Receipt{Key: key, Op: priorOp, Postings: prior, At: l.now(), Replay: true}, nil
	} else if err != sql.ErrNoRows {
		return Receipt{}, err
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO ledger_ops(key, op, outcome, currency, created) VALUES (?,?,?,?,?)`,
		key, op, outcome, currency, l.now().UnixNano()); err != nil {
		return Receipt{}, err
	}
	for _, p := range postings {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO ledger_postings(key, account, currency, amount) VALUES (?,?,?,?)`,
			key, p.Account, currency, p.AmountMinor); err != nil {
			return Receipt{}, err
		}
	}

	// Custodial accounts may not be overdrawn. Checked after the write, inside
	// the transaction, so concurrent operations cannot both pass a check that
	// only one of them could have.
	for _, p := range postings {
		if p.AmountMinor >= 0 || !custodial(p.Account) {
			continue
		}
		bal, err := balanceIn(ctx, tx, p.Account, currency)
		if err != nil {
			return Receipt{}, err
		}
		if bal < 0 {
			return Receipt{}, fmt.Errorf("ledger: %s would overdraw %s by %d %s",
				op, p.Account, -bal, currency)
		}
	}

	if err := tx.Commit(); err != nil {
		return Receipt{}, err
	}
	return Receipt{Key: key, Op: op, Postings: postings, At: l.now()}, nil
}

type querier interface {
	QueryRowContext(ctx context.Context, q string, args ...any) *sql.Row
	QueryContext(ctx context.Context, q string, args ...any) (*sql.Rows, error)
}

func balanceIn(ctx context.Context, q querier, account, currency string) (int64, error) {
	var bal sql.NullInt64
	err := q.QueryRowContext(ctx,
		`SELECT SUM(amount) FROM ledger_postings WHERE account = ? AND currency = ?`,
		account, strings.ToUpper(currency)).Scan(&bal)
	if err != nil {
		return 0, err
	}
	return bal.Int64, nil
}

func (l *Ledger) postingsFor(ctx context.Context, q querier, key string) ([]Posting, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT account, amount FROM ledger_postings WHERE key = ? ORDER BY id`, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Posting
	for rows.Next() {
		var p Posting
		if err := rows.Scan(&p.Account, &p.AmountMinor); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Balance is derived from postings every time rather than kept in a column.
// A cached balance is a second source of truth, and the first thing to drift.
func (l *Ledger) Balance(ctx context.Context, account, currency string) (int64, error) {
	return balanceIn(ctx, l.db, account, currency)
}

// Credited is everything ever paid into an account, ignoring what has since
// left it.
//
// A balance answers "what is owed now"; this answers "what has this person
// earned", and a worker who has been paid out wants to see both rather than a
// balance that resets to zero every time they are paid.
func (l *Ledger) Credited(ctx context.Context, account, currency string) (int64, error) {
	var v sql.NullInt64
	err := l.db.QueryRowContext(ctx,
		`SELECT SUM(amount) FROM ledger_postings
		 WHERE account = ? AND currency = ? AND amount > 0`,
		account, strings.ToUpper(currency)).Scan(&v)
	return v.Int64, err
}

// Applied reports whether an idempotency key has already moved money.
func (l *Ledger) Applied(ctx context.Context, key string) (bool, error) {
	var n int
	err := l.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM ledger_ops WHERE key = ?`, key).Scan(&n)
	return n > 0, err
}

// Audit checks that the ledger as a whole still sums to zero.
//
// It cannot fail if Post is the only writer, which is the point: if it ever
// does fail, something wrote to the database that was not this package.
func (l *Ledger) Audit(ctx context.Context) error {
	rows, err := l.db.QueryContext(ctx,
		`SELECT currency, SUM(amount) FROM ledger_postings GROUP BY currency`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cur string
		var sum int64
		if err := rows.Scan(&cur, &sum); err != nil {
			return err
		}
		if sum != 0 {
			return fmt.Errorf("ledger: %s postings sum to %d, not 0; money was created or destroyed",
				cur, sum)
		}
	}
	return rows.Err()
}

// Accounts lists non-empty accounts, for the reconciliation screen.
func (l *Ledger) Accounts(ctx context.Context, currency string) (map[string]int64, error) {
	rows, err := l.db.QueryContext(ctx,
		`SELECT account, SUM(amount) FROM ledger_postings WHERE currency = ?
		 GROUP BY account HAVING SUM(amount) != 0 ORDER BY account`,
		strings.ToUpper(currency))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var a string
		var v int64
		if err := rows.Scan(&a, &v); err != nil {
			return nil, err
		}
		out[a] = v
	}
	return out, rows.Err()
}

func (l *Ledger) Close() error { return l.db.Close() }

// CreditedBetween is everything paid into an account within a window.
//
// The window exists for one reason: tax reporting runs on calendar years, and
// a lifetime total cannot answer "did this person cross the threshold in
// 2026". Postings carry no time of their own — they inherit the op's — so the
// join is where the answer lives.
func (l *Ledger) CreditedBetween(ctx context.Context, account, currency string, from, to time.Time) (int64, error) {
	var v sql.NullInt64
	err := l.db.QueryRowContext(ctx,
		`SELECT SUM(p.amount) FROM ledger_postings p
		 JOIN ledger_ops o ON o.key = p.key
		 WHERE p.account = ? AND p.currency = ? AND p.amount > 0
		   AND o.created >= ? AND o.created < ?`,
		account, strings.ToUpper(currency), from.Unix(), to.Unix()).Scan(&v)
	return v.Int64, err
}

// EarnedInYear is what one person earned in a calendar year, in minor units.
func (l *Ledger) EarnedInYear(ctx context.Context, person, currency string, year int) (int64, error) {
	from := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	return l.CreditedBetween(ctx, PayableOf(person), currency, from, from.AddDate(1, 0, 0))
}
