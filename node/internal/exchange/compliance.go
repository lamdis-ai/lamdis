package exchange

import (
	"context"
	"time"
)

// Obligations that arrive with paying people.
//
// Paying individuals for physical work is not the same business as charging a
// card. It brings reporting thresholds, worker-classification exposure, and —
// if the exchange held funds on its own account — money transmission. None of
// that appeared anywhere in this codebase until now, which made it read as
// unconsidered rather than decided.
//
// The posture, recorded here because a decision nobody wrote down gets made
// again by accident:
//
//   1. Funds sit in the exchange's own balance at the payment provider.
//
//      This comment previously claimed the exchange never takes custody. It
//      does: a top-up is a Checkout session with no transfer_data and no
//      on_behalf_of, so the money settles into the platform's Stripe balance,
//      and a payout is a transfer out of that same balance. Saying otherwise
//      described an intention as a fact, about a regulated question.
//
//      What is true and narrower: no wallet of our own, nothing held outside
//      the provider, no card number or bank account ever seen. The ledger here
//      records obligations against that balance rather than being a pot of
//      money itself.
//
//      Whether this is money transmission is a legal question and is not
//      settled in this file. A genuinely non-custodial arrangement is a
//      different integration — destination charges with on_behalf_of, so funds
//      never land in the platform balance — not a change of wording.
//
//   2. People doing work here are independent, not employed. They choose what
//      to take, when, at what price, using their own equipment. The exchange
//      must not drift into directing *how* work is done — scheduling people,
//      setting hours, requiring exclusivity — because those are the facts that
//      decide classification, and every one of them is a product decision
//      somebody could make without noticing.
//
//   3. Earnings are reportable above a calendar-year threshold. The provider
//      files for connected accounts it pays, but the exchange has to know who
//      is approaching the line so it can collect what is needed *before* the
//      money is stuck.
//
// This file tracks (3) because it is the only one that is code. (1) and (2)
// are constraints on what gets built next.

// ReportingThresholdMinor is the calendar-year figure above which payments to
// an individual become reportable in the United States.
//
// 1099-NEC, $600. Recorded as a constant rather than scattered as a literal,
// so when it changes it changes once.
const ReportingThresholdMinor = 60000

// TaxStatus is what the exchange knows about one person's reporting position.
type TaxStatus struct {
	Year           int   `json:"year"`
	EarnedMinor    int64 `json:"earned_minor"`
	ThresholdMinor int64 `json:"threshold_minor"`
	// Reportable is whether they have crossed the line this year.
	Reportable bool `json:"reportable"`
	// Approaching flags somebody close enough that details should be collected
	// now. Waiting until they cross means holding their money while they hunt
	// for a document, which is the worst moment to ask.
	Approaching bool `json:"approaching"`
}

// TaxStatusFor reports where a person stands this calendar year.
func (s *Server) TaxStatusFor(ctx context.Context, person string) TaxStatus {
	year := s.now().UTC().Year()
	st := TaxStatus{Year: year, ThresholdMinor: ReportingThresholdMinor}
	if s.Ledger == nil {
		return st
	}
	earned, err := s.Ledger.EarnedInYear(ctx, person, "USD", year)
	if err != nil {
		return st
	}
	st.EarnedMinor = earned
	st.Reportable = earned >= ReportingThresholdMinor
	// Three quarters of the way is early enough to ask without being early
	// enough to feel arbitrary.
	st.Approaching = !st.Reportable && earned >= ReportingThresholdMinor*3/4
	return st
}

// taxYearStart is the boundary reporting runs on, kept here so the rest of the
// codebase never has to reason about it.
func taxYearStart(t time.Time) time.Time {
	return time.Date(t.UTC().Year(), 1, 1, 0, 0, 0, 0, time.UTC)
}
