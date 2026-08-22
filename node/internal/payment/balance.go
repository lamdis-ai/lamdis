package payment

import (
	"context"
	"fmt"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/ledger"
)

// Balance is the rail the outcome engine actually settles on.
//
// Nothing leaves the exchange here. A hold moves a buyer's own topped-up funds
// into an escrow account, a capture credits the provider's payable account,
// and a release hands the remainder back — all of it exact integer minor
// units, instant, and free.
//
// That last word is the reason this exists. Measured against Stripe's test
// API, a card movement costs 2.9% + 30c; on a $1.50 human review that is a
// fifth of the job. A rail with a fixed per-movement cost cannot price a small
// outcome at all. Cards therefore appear exactly twice in the system — one
// top-up in and one payout out — and both are amortised over many outcomes.
//
// Request.Source carries the buyer and Request.Destination the provider, both
// as principal ids. The ledger needs no registration step for either.
type Balance struct {
	L *ledger.Ledger
}

func NewBalance(l *ledger.Ledger) *Balance { return &Balance{L: l} }

func (b *Balance) Rail() string { return "balance" }

func (b *Balance) Hold(ctx context.Context, r Request) (Result, error) {
	if r.Source == "" {
		return Result{}, fmt.Errorf("payment: a hold needs the buyer it draws on")
	}
	rec, err := b.L.Hold(ctx, string(r.Key), r.Outcome, r.Source, r.AmountMinor, r.Currency)
	return b.result(rec, err)
}

// Capture credits the provider and the exchange out of the escrow.
//
// The provider is credited, not paid: the money stays inside until a payout
// clears the threshold that makes a transfer worth making.
func (b *Balance) Capture(ctx context.Context, r Request) (Result, error) {
	if r.Destination == "" {
		return Result{}, fmt.Errorf("payment: a capture needs the provider it credits")
	}
	rec, err := b.L.Capture(ctx, string(r.Key), r.Outcome, r.Destination,
		r.AmountMinor, r.FeeMinor, r.Currency)
	return b.result(rec, err)
}

func (b *Balance) Release(ctx context.Context, r Request) (Result, error) {
	if r.Source == "" {
		return Result{}, fmt.Errorf("payment: a release needs the buyer it returns to")
	}
	rec, err := b.L.Release(ctx, string(r.Key), r.Outcome, r.Source, r.AmountMinor, r.Currency)
	return b.result(rec, err)
}

// Refund reverses a capture, taking money back out of the provider's payable
// account and returning it to the buyer.
//
// It fails if the provider has already been paid out, because their payable
// account would go negative and the ledger will not overdraw a custodial
// account. That failure is the reason payouts wait for the dispute window to
// close: the delay is not caution, it is what makes a refund possible at all.
func (b *Balance) Refund(ctx context.Context, r Request) (Result, error) {
	if r.Source == "" || r.Destination == "" {
		return Result{}, fmt.Errorf("payment: a refund needs both the provider and the buyer")
	}
	rec, err := b.L.Post(ctx, string(r.Key), "refund", r.Outcome, r.Currency, []ledger.Posting{
		{Account: ledger.PayableOf(r.Destination), AmountMinor: -r.AmountMinor},
		{Account: ledger.BalanceOf(r.Source), AmountMinor: r.AmountMinor},
	})
	return b.result(rec, err)
}

// Status is exact here. An internal rail cannot lose a response, so an
// operation either moved money or it did not, and Unknown never arises.
func (b *Balance) Status(ctx context.Context, key Key) (Result, error) {
	applied, err := b.L.Applied(ctx, string(key))
	if err != nil {
		return Result{State: StateUnknown}, err
	}
	if !applied {
		return Result{State: StateFailed}, nil
	}
	return Result{Ref: string(key), State: StateSucceeded}, nil
}

func (b *Balance) result(rec ledger.Receipt, err error) (Result, error) {
	if err != nil {
		return Result{State: StateFailed}, err
	}
	return Result{Ref: rec.Key, State: StateSucceeded, ObservedAt: rec.At}, nil
}
