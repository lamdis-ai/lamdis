package exchange

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/payment"
)

// The five endpoints the Agentic Commerce Protocol asks a merchant for.
//
// The mapping is closer than it first looks. ACP's fulfilment address is the
// job site. Its not_ready_for_payment state is exactly "we have not confirmed
// anybody can reach this address yet" — so the protocol's own state machine
// ends up carrying the check that matters most, instead of us discovering at
// capture time that the work cannot be done.

func (s *Server) registerACP(mux *http.ServeMux) {
	mux.HandleFunc("POST /acp/checkout_sessions", s.acp(s.handleACPCreate))
	mux.HandleFunc("POST /acp/checkout_sessions/{id}", s.acp(s.handleACPUpdate))
	mux.HandleFunc("POST /acp/checkout_sessions/{id}/complete", s.acp(s.handleACPComplete))
	mux.HandleFunc("POST /acp/checkout_sessions/{id}/cancel", s.acp(s.handleACPCancel))
	mux.HandleFunc("GET /acp/checkout_sessions/{id}", s.acp(s.handleACPGet))
	// What can be bought this way, so the catalogue is inspectable rather
	// than something only we know.
	mux.HandleFunc("GET /acp/offers", s.handleACPOffers)
}

// acp authenticates, verifies the signature, and hands the handler the raw
// body — which the signature was computed over and must not be re-encoded.
func (s *Server) acp(
	next func(w http.ResponseWriter, r *http.Request, body []byte),
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeACP(w, http.StatusBadRequest,
				acpError("invalid_request", "unreadable", "Could not read the request.", ""))
			return
		}
		if s.ACPKey == "" {
			// Not configured is not the same as not authorised, and saying so
			// saves somebody an afternoon.
			writeACP(w, http.StatusServiceUnavailable, acpError("service_unavailable",
				"acp_not_configured",
				"Agentic checkout is not switched on for this exchange.", ""))
			return
		}
		if tok := bearer(r); tok == "" || tok != s.ACPKey {
			writeACP(w, http.StatusUnauthorized, acpError("invalid_request",
				"unauthorized", "That key is not valid here.", ""))
			return
		}
		// GET carries no body to sign, so nothing to check.
		if r.Method != http.MethodGet {
			if !verifyACPSignature(s.ACPSecret, r.Header.Get("Signature"), body) {
				writeACP(w, http.StatusUnauthorized, acpError("invalid_request",
					"invalid_signature", "The request signature did not match.", ""))
				return
			}
		}
		w.Header().Set("API-Version", ACPVersion)
		if rid := r.Header.Get("Request-Id"); rid != "" {
			w.Header().Set("Request-Id", rid)
		}
		next(w, r, body)
	}
}

func bearer(r *http.Request) string {
	v := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(v) > 7 && strings.EqualFold(v[:7], "bearer ") {
		return strings.TrimSpace(v[7:])
	}
	return v
}

func writeACP(w http.ResponseWriter, code int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(body)
}

// handleACPOffers lists what can be bought.
func (s *Server) handleACPOffers(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]any, 0, len(Catalogue))
	for _, o := range Catalogue {
		out = append(out, map[string]any{
			"id": o.ID, "title": o.Title, "price_minor": o.PriceMinor,
			"currency": "usd", "needs_address": o.NeedsAddress,
			"proof": o.Deliverable,
		})
	}
	writeACP(w, http.StatusOK, map[string]any{"offers": out})
}

// handleACPCreate opens a checkout session.
func (s *Server) handleACPCreate(w http.ResponseWriter, r *http.Request, body []byte) {
	var in struct {
		Items []struct {
			ID       string `json:"id"`
			Quantity int    `json:"quantity"`
		} `json:"items"`
		FulfillmentAddress *ACPAddress `json:"fulfillment_address,omitempty"`
	}
	if err := json.Unmarshal(body, &in); err != nil || len(in.Items) == 0 {
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"missing_items", "Name what you are buying.", "$.items"))
		return
	}
	// One outcome per session. A basket of physical jobs at different
	// addresses is a different product, and pretending otherwise would mean
	// one payment covering work that can succeed and fail independently.
	if len(in.Items) > 1 {
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"one_item_only",
			"One job at a time. Each has its own address and its own proof.",
			"$.items"))
		return
	}
	o, ok := OfferByID(in.Items[0].ID)
	if !ok {
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"unknown_item", "We do not sell that.", "$.items[0].id"))
		return
	}
	qty := in.Items[0].Quantity
	if qty < 1 {
		qty = 1
	}

	// A retry of the same create must not open a second session.
	key := r.Header.Get("Idempotency-Key")
	id := acpID(s.now())
	if prior, seen := s.ACP.Remember(key, id); seen {
		if sess, ok := s.ACP.Get(prior); ok {
			writeACP(w, http.StatusCreated, s.acpBody(sess))
			return
		}
	}

	sess := &ACPSession{
		ID: id, Status: ACPNotReady, OfferID: o.ID, Quantity: qty,
		Currency: "usd", Created: s.now(), Updated: s.now(),
	}
	if in.FulfillmentAddress != nil {
		sess.Address = *in.FulfillmentAddress
	}
	s.acpCheckSupply(sess, o)
	sess.Advance(o)
	s.ACP.Put(sess)
	writeACP(w, http.StatusCreated, s.acpBody(sess))
}

// handleACPUpdate takes a change of address or quantity.
func (s *Server) handleACPUpdate(w http.ResponseWriter, r *http.Request, body []byte) {
	sess, o, ok := s.acpLoad(w, r)
	if !ok {
		return
	}
	if sess.Status == ACPCompleted || sess.Status == ACPCanceled {
		writeACP(w, http.StatusMethodNotAllowed, acpError("invalid_request",
			"session_closed", "That checkout is already finished.", ""))
		return
	}
	var in struct {
		Items []struct {
			ID       string `json:"id"`
			Quantity int    `json:"quantity"`
		} `json:"items,omitempty"`
		FulfillmentAddress *ACPAddress `json:"fulfillment_address,omitempty"`
	}
	json.Unmarshal(body, &in)
	if in.FulfillmentAddress != nil {
		sess.Address = *in.FulfillmentAddress
		// The address changed, so what we knew about supply there is stale.
		sess.Feasible, sess.Why = false, ""
		s.acpCheckSupply(sess, o)
	}
	if len(in.Items) == 1 && in.Items[0].Quantity > 0 {
		sess.Quantity = in.Items[0].Quantity
	}
	sess.Updated = s.now()
	sess.Advance(o)
	s.ACP.Put(sess)
	writeACP(w, http.StatusOK, s.acpBody(sess))
}

// handleACPComplete takes the delegated payment token and does the work.
//
// The card is authorised, not captured. Money stays on the buyer's card while
// the job runs and is taken only when the outcome is proven — so a job nobody
// takes costs them nothing and needs no refund, because nothing ever moved.
func (s *Server) handleACPComplete(w http.ResponseWriter, r *http.Request, body []byte) {
	sess, o, ok := s.acpLoad(w, r)
	if !ok {
		return
	}
	if sess.Status == ACPCompleted {
		// A retried complete returns the same order rather than charging
		// again. This is the single most important idempotent path here.
		writeACP(w, http.StatusOK, s.acpBody(sess))
		return
	}
	if sess.Status != ACPReady {
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"not_ready", firstNonEmpty(sess.Why, "This checkout is not ready to pay."), ""))
		return
	}
	var in struct {
		PaymentData struct {
			Token    string `json:"token"`
			Provider string `json:"provider"`
		} `json:"payment_data"`
	}
	if err := json.Unmarshal(body, &in); err != nil || in.PaymentData.Token == "" {
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"missing_payment", "No payment token.", "$.payment_data.token"))
		return
	}
	if s.Charges == nil {
		writeACP(w, http.StatusServiceUnavailable, acpError("service_unavailable",
			"payments_down", "Payments are not available right now.", ""))
		return
	}

	amount := o.PriceMinor * int64(sess.Quantity)
	res, err := s.Charges.Hold(r.Context(), payment.Request{
		Key:         payment.DeriveKey("acp-hold", sess.ID),
		AmountMinor: amount, Currency: "usd",
		Source: in.PaymentData.Token, Outcome: sess.ID,
	})
	if err != nil {
		writeACP(w, http.StatusPaymentRequired, acpError("payment_failed",
			"authorization_failed", "That payment could not be authorised.", ""))
		return
	}
	sess.Intent = res.Ref

	// Post the work. Screening and every other posting rule apply exactly as
	// they do for an account holder — this is a different front door, not a
	// different set of rules.
	job := "acp-" + sess.ID
	l := &api.Listing{
		Job: job, Kind: o.Kind, Title: o.Predicate,
		Instructions: o.Instructions, Deliverable: o.Deliverable,
		Where: sess.Address.OneLine(), Area: acpArea(sess.Address),
		PayMinor: o.PayMinor * int64(sess.Quantity), Currency: "USD",
		Tier: "V2", Slots: sess.Quantity,
		Skills:        api.NormalizeSkills(o.Skills),
		PostedByAgent: true,
		Owner:         "acp:" + sess.ID,
		Expires:       s.now().Add(72 * time.Hour), Posted: s.now(),
	}
	if err := s.Board.Post(l); err != nil {
		// Authorised but unpostable. Release the hold rather than sit on
		// somebody's card while we work out what went wrong.
		if s.Charges != nil && sess.Intent != "" {
			_, _ = s.Charges.Release(r.Context(), payment.Request{
				Key: payment.DeriveKey("acp-release", sess.ID), HoldRef: sess.Intent,
			})
		}
		writeACP(w, http.StatusBadRequest, acpError("invalid_request",
			"cannot_post", err.Error(), ""))
		return
	}

	sess.Job = job
	sess.Status = ACPCompleted
	sess.Updated = s.now()
	s.ACP.Put(sess)
	writeACP(w, http.StatusOK, s.acpBody(sess))
}

// handleACPCancel ends a session that has not been paid.
func (s *Server) handleACPCancel(w http.ResponseWriter, r *http.Request, body []byte) {
	sess, o, ok := s.acpLoad(w, r)
	if !ok {
		return
	}
	if sess.Status == ACPCompleted {
		writeACP(w, http.StatusMethodNotAllowed, acpError("invalid_request",
			"already_completed",
			"That job is already running. Cancelling it now is a refund, not a cancellation.", ""))
		return
	}
	sess.Status = ACPCanceled
	sess.Updated = s.now()
	s.ACP.Put(sess)
	_ = o
	writeACP(w, http.StatusOK, s.acpBody(sess))
}

// handleACPGet returns the current state.
func (s *Server) handleACPGet(w http.ResponseWriter, r *http.Request, _ []byte) {
	sess, _, ok := s.acpLoad(w, r)
	if !ok {
		return
	}
	writeACP(w, http.StatusOK, s.acpBody(sess))
}

func (s *Server) acpLoad(w http.ResponseWriter, r *http.Request) (*ACPSession, Offer, bool) {
	sess, ok := s.ACP.Get(r.PathValue("id"))
	if !ok {
		writeACP(w, http.StatusNotFound, acpError("invalid_request",
			"no_such_session", "No such checkout.", ""))
		return nil, Offer{}, false
	}
	o, ok := OfferByID(sess.OfferID)
	if !ok {
		writeACP(w, http.StatusNotFound, acpError("invalid_request",
			"offer_withdrawn", "That job is no longer offered.", ""))
		return nil, Offer{}, false
	}
	return sess, o, true
}

// acpCheckSupply asks whether anybody could actually do this, there.
//
// The whole reason a checkout can be not_ready_for_payment. Selling somebody
// an outcome we cannot deliver is worse than declining the sale, and it is
// worse inside somebody else's assistant than it is on our own site, because
// the trust it spends is not ours.
func (s *Server) acpCheckSupply(sess *ACPSession, o Offer) {
	if o.NeedsAddress && !sess.Address.Complete() {
		return
	}
	if s.Board == nil {
		return
	}
	// Reachable supply, asked the same way the quoting route asks it — so
	// checkout and check_feasible cannot disagree about whether a place is
	// covered, which would be the worst possible inconsistency here.
	reach, _ := s.reachFor(QuoteRequest{
		Kind: o.Kind, Predicate: o.Predicate, Instructions: o.Instructions,
		Skills: api.NormalizeSkills(o.Skills), Slots: sess.Quantity,
	})
	if reach <= 0 {
		sess.Feasible = false
		sess.Why = "Nobody near that address can take this yet. We are adding " +
			"places, and you have not been charged."
		return
	}
	sess.Feasible = true
	sess.Why = ""
}

func acpArea(a ACPAddress) string {
	parts := []string{}
	if a.City != "" {
		parts = append(parts, a.City)
	}
	if a.State != "" {
		parts = append(parts, a.State)
	}
	if len(parts) == 0 {
		return "nearby"
	}
	return strings.Join(parts, ", ")
}

func firstNonEmpty(ss ...string) string {
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

// acpBody renders a session the way the protocol expects.
func (s *Server) acpBody(sess *ACPSession) map[string]any {
	o, _ := OfferByID(sess.OfferID)
	base := o.PriceMinor * int64(sess.Quantity)

	msgs := []map[string]any{}
	if sess.Why != "" {
		msgs = append(msgs, map[string]any{
			"type": "error", "code": "not_ready",
			"content_type": "plain", "content": sess.Why,
		})
	}
	if sess.Status == ACPCompleted {
		msgs = append(msgs, map[string]any{
			"type": "info", "code": "dispatched", "content_type": "plain",
			"content": "Sent. Your card is authorised but not charged — we take " +
				"the money when there is a photograph proving it was done, and " +
				"nothing at all if nobody does it.",
		})
	}

	out := map[string]any{
		"id": sess.ID, "status": sess.Status, "currency": sess.Currency,
		"line_items": []map[string]any{{
			"id":   "li_" + sess.ID,
			"item": map[string]any{"id": o.ID, "quantity": sess.Quantity},
			// No tax handling here, and saying zero is more honest than
			// inventing a number. A service sold in one metro is a tax
			// question to answer before this is switched on anywhere real.
			"base_amount": base, "discount": 0, "subtotal": base,
			"tax": 0, "total": base,
		}},
		"fulfillment_options": []map[string]any{{
			"type": "shipping", "id": "dispatch", "title": "Dispatched to whoever is nearest",
			"subtotal": 0, "tax": 0, "total": 0,
		}},
		"fulfillment_option_id": "dispatch",
		"totals":                sess.Totals(o),
		"payment_provider": map[string]any{
			"provider": "stripe", "supported_payment_methods": []string{"card"},
		},
		"messages": msgs,
		"links": []map[string]any{
			{"type": "terms_of_use", "url": "https://lamdis.ai/terms"},
			{"type": "privacy_policy", "url": "https://lamdis.ai/privacy"},
		},
	}
	if sess.Address.Complete() {
		out["fulfillment_address"] = sess.Address
	}
	if sess.Job != "" {
		out["order"] = map[string]any{
			"id": sess.Job, "checkout_session_id": sess.ID, "status": "created",
			"permalink_url": s.BaseURL + "/j/" + sess.Job,
		}
	}
	return out
}

// SettleACP takes the money once an outcome is proven, or lets it go if the
// work never happened.
//
// This is the half that makes agentic checkout worth doing rather than just
// a second way in. On the account path a buyer's money sits in our Stripe
// balance for as long as they keep a balance. Here it sits on their card:
// authorised, uncaptured, and taken only against a photograph that passed.
// A job nobody takes needs no refund, because nothing ever moved.
//
// Called from the same places that settle an ordinary job, so a job posted
// this way cannot be paid by a path that skips verification.
func (s *Server) SettleACP(ctx context.Context, job string, accepted bool) {
	if s.ACP == nil || s.Charges == nil {
		return
	}
	sess, ok := s.acpSessionForJob(job)
	if !ok || sess.Intent == "" {
		return
	}
	if accepted {
		if _, err := s.Charges.Capture(ctx, payment.Request{
			Key:     payment.DeriveKey("acp-capture", sess.ID),
			HoldRef: sess.Intent, Outcome: sess.ID,
		}); err != nil {
			// Left authorised rather than silently dropped. An uncaptured
			// hold expires on its own and costs the buyer nothing, which is
			// the safe direction to fail in.
			log.Printf("acp        capture failed for %s: %v", job, err)
		}
		return
	}
	if _, err := s.Charges.Release(ctx, payment.Request{
		Key:     payment.DeriveKey("acp-release", sess.ID),
		HoldRef: sess.Intent, Outcome: sess.ID,
	}); err != nil {
		log.Printf("acp        release failed for %s: %v", job, err)
	}
}

// acpSessionForJob finds the checkout a job came from.
func (s *Server) acpSessionForJob(job string) (*ACPSession, bool) {
	if !strings.HasPrefix(job, "acp-") {
		return nil, false
	}
	return s.ACP.Get(strings.TrimPrefix(job, "acp-"))
}
