package exchange

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
)

// A record a business can give its bookkeeper.
//
// A month of income here was a balance that moved and a list of jobs on a web
// page. Nothing tied a payout to the work that earned it, nothing could be
// exported, and nothing reconciled against a bank statement. For a sole trader
// that is annoying; for a company with an accountant it is disqualifying.

// StatementServer renders what was earned over a period.
type StatementServer struct {
	Server  *Server
	Workers *api.Workers
}

func (ss *StatementServer) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/statement", ss.handle)
	mux.HandleFunc("GET /v1/statement.csv", ss.handleCSV)
}

type statementLine struct {
	Job   string    `json:"job"`
	Title string    `json:"title"`
	Kind  string    `json:"kind"`
	Done  time.Time `json:"done"`
	By    string    `json:"by,omitempty"`
	// Reference and Site are the buyer's own identifiers. A bookkeeper cannot
	// reconcile a month of work against purchase orders that appear nowhere in
	// the export.
	Reference    string `json:"reference,omitempty"`
	Site         string `json:"site,omitempty"`
	GrossMinor   int64  `json:"gross_minor"`
	FeeMinor     int64  `json:"fee_minor"`
	ExpenseMinor int64  `json:"expense_minor,omitempty"`
	NetMinor     int64  `json:"net_minor"`
	Currency     string `json:"currency"`
}

// lines gathers what this account earned in a window.
//
// Built from submissions rather than from ledger postings so each line can
// name the job it came from. The totals are checked against the ledger below,
// because a statement that does not reconcile is worse than none.
func (ss *StatementServer) lines(account string, from, to time.Time) []statementLine {
	s := ss.Server
	var out []statementLine
	for _, l := range s.Board.All() {
		for _, sub := range s.Submissions(l.Job) {
			if !sub.Verified && !sub.Attempted {
				continue
			}
			if sub.At.Before(from) || !sub.At.Before(to) {
				continue
			}
			// Attributed to the account the work counted for, which for an
			// employee is their employer.
			if s.Suppliers != nil && s.Suppliers.AccountFor(sub.Holder) != account {
				continue
			} else if s.Suppliers == nil && sub.Holder != account {
				continue
			}
			gross := earnedFor(l, sub)
			if gross <= 0 {
				continue
			}
			fee := gross * FeeBP / 10000
			line := statementLine{
				Job: l.Job, Title: l.Title, Kind: l.Kind, Done: sub.At,
				GrossMinor: gross, FeeMinor: fee, NetMinor: gross - fee,
				ExpenseMinor: expensesFor(l, sub),
				Currency:     l.Currency,
				Reference:    l.Reference,
				Site:         l.SiteID,
			}
			// Name the person who did it, so a company can tell its crews
			// apart on its own books.
			if s.Suppliers != nil && s.Suppliers.AccountFor(sub.Holder) != sub.Holder {
				line.By = shortHandle(sub.Holder)
			}
			out = append(out, line)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Done.Before(out[j].Done) })
	return out
}

func (ss *StatementServer) window(r *http.Request) (from, to time.Time) {
	now := ss.Server.now().UTC()
	// Default to the current calendar month, which is what somebody asking
	// for a statement almost always means.
	from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	to = from.AddDate(0, 1, 0)
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			from = t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			to = t.AddDate(0, 0, 1) // inclusive of the named day
		}
	}
	return from, to
}

func (ss *StatementServer) accountFor(r *http.Request) (string, bool) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	w, err := ss.Workers.Authenticate(r, body, ss.Server.now())
	if err != nil {
		return "", false
	}
	if ss.Server.Suppliers != nil {
		return ss.Server.Suppliers.AccountFor(w.ID), true
	}
	return w.ID, true
}

func (ss *StatementServer) handle(w http.ResponseWriter, r *http.Request) {
	account, ok := ss.accountFor(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "sign in first")
		return
	}
	from, to := ss.window(r)
	lines := ss.lines(account, from, to)

	var gross, fee, expenses, net int64
	for _, l := range lines {
		gross += l.GrossMinor
		fee += l.FeeMinor
		expenses += l.ExpenseMinor
		net += l.NetMinor
	}
	out := map[string]any{
		"account": shortHandle(account),
		"from":    from.Format("2006-01-02"),
		"to":      to.AddDate(0, 0, -1).Format("2006-01-02"),
		"lines":   lines,
		"totals": map[string]any{
			"jobs": len(lines), "gross_minor": gross, "fee_minor": fee,
			"expense_minor": expenses, "net_minor": net, "currency": "USD",
		},
		"csv": "/v1/statement.csv?from=" + from.Format("2006-01-02") +
			"&to=" + to.AddDate(0, 0, -1).Format("2006-01-02"),
	}
	// The ledger is derived independently, so disagreeing with it means one of
	// the two is wrong and saying nothing would hide which.
	if ss.Server.Ledger != nil {
		credited, err := ss.Server.Ledger.CreditedBetween(r.Context(),
			ledger.PayableOf(account), "USD", from, to)
		if err == nil {
			out["ledger_credited_minor"] = credited
			if credited != net {
				out["reconciles"] = false
				out["reconciliation_note"] = fmt.Sprintf(
					"this statement totals %d and the ledger recorded %d for the "+
						"same period; treat the ledger as authoritative and tell us",
					net, credited)
			} else {
				out["reconciles"] = true
			}
		}
	}
	writeJSONResponse(w, out)
}

func (ss *StatementServer) handleCSV(w http.ResponseWriter, r *http.Request) {
	account, ok := ss.accountFor(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "sign in first")
		return
	}
	from, to := ss.window(r)
	lines := ss.lines(account, from, to)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition",
		`attachment; filename="lamdis-`+from.Format("2006-01")+`.csv"`)
	c := csv.NewWriter(w)
	defer c.Flush()
	c.Write([]string{"date", "job", "reference", "site", "title", "kind",
		"done_by", "gross", "fee", "expenses", "net", "currency"})
	for _, l := range lines {
		c.Write([]string{
			l.Done.Format("2006-01-02"), l.Job, l.Reference, l.Site, l.Title, l.Kind, l.By,
			money2dp(l.GrossMinor), money2dp(l.FeeMinor), money2dp(l.ExpenseMinor),
			money2dp(l.NetMinor), l.Currency,
		})
	}
}

// money2dp writes minor units as a decimal a spreadsheet will read as money,
// without ever going through a float.
func money2dp(minor int64) string {
	neg := ""
	if minor < 0 {
		neg, minor = "-", -minor
	}
	return neg + strconv.FormatInt(minor/100, 10) + "." +
		fmt.Sprintf("%02d", minor%100)
}
