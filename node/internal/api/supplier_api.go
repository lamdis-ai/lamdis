package api

import (
	"encoding/json"
	"net/http"
	"time"
)

// SupplierServer lets a business describe itself and manage who works for it.
type SupplierServer struct {
	Suppliers *Suppliers
	Workers   *Workers
	Board     *Board
	Now       func() time.Time
}

func (s *SupplierServer) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *SupplierServer) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/supplier", s.handleGet)
	mux.HandleFunc("PUT /v1/supplier", s.handleSet)
	mux.HandleFunc("POST /v1/supplier/members", s.handleAddMember)
	mux.HandleFunc("DELETE /v1/supplier/members/{person}", s.handleRemoveMember)
}

func (s *SupplierServer) person(r *http.Request) (*Worker, []byte, bool) {
	body, _ := readBody(r)
	w, err := s.Workers.Authenticate(r, body, s.now())
	if err != nil || !w.Verified {
		return nil, body, false
	}
	return w, body, true
}

func (s *SupplierServer) handleGet(w http.ResponseWriter, r *http.Request) {
	worker, _, ok := s.person(r)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{
			"error": "sign in first", "signin": "/signin"})
		return
	}
	now := s.now()
	out := map[string]any{
		// What the ceiling actually is, so the control that sets it can stop
		// offering numbers the board will refuse.
		"vetted_ceiling": VettedMax,
	}
	sup, exists := s.Suppliers.Get(worker.ID)
	if !exists {
		out["supplier"] = nil
		out["ceiling"] = 0
		if s.Board != nil {
			_, _, allowance, _ := s.Board.Standing(worker.ID)
			out["ceiling"] = allowance
		}
		writeWork(w, http.StatusOK, out)
		return
	}
	out["supplier"] = sup
	if s.Board != nil {
		_, _, allowance, _ := s.Board.Standing(worker.ID)
		out["ceiling"] = allowance
	}
	// Name what is stopping them, since "not vetted" is not actionable on its
	// own and a lapsing licence is the thing that silently stops work
	// arriving.
	var blocking []string
	if !sup.Vetted {
		blocking = append(blocking,
			"a reviewer has not checked your licences and cover yet")
	}
	for _, l := range sup.Licences {
		switch {
		case !l.Verified:
			blocking = append(blocking, SkillLabel(l.Skill)+" licence not verified yet")
		case l.Expiring(now):
			blocking = append(blocking, SkillLabel(l.Skill)+" licence expires on "+
				l.Expires.Format("2 January"))
		case !l.Valid(now):
			blocking = append(blocking, SkillLabel(l.Skill)+" licence has expired")
		}
	}
	if sup.Insurance != nil && !sup.Insurance.Active(now) {
		blocking = append(blocking, "your cover is unverified or out of date")
	}
	out["attention"] = blocking
	writeWork(w, http.StatusOK, out)
}

func (s *SupplierServer) handleSet(w http.ResponseWriter, r *http.Request) {
	worker, body, ok := s.person(r)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{
			"error": "sign in first", "signin": "/signin"})
		return
	}
	var in Supplier
	if err := json.Unmarshal(body, &in); err != nil {
		writeWork(w, http.StatusBadRequest, map[string]any{
			"error": "could not read that"})
		return
	}
	sup, err := s.Suppliers.Upsert(worker.ID, in)
	if err != nil {
		writeWork(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	writeWork(w, http.StatusOK, map[string]any{
		"supplier": sup,
		// Said plainly, because a business that edits a licence and finds work
		// has stopped arriving deserves to know why.
		"note": "licences and cover are checked by a person before they count. " +
			"Changing one clears its verification.",
	})
}

func (s *SupplierServer) handleAddMember(w http.ResponseWriter, r *http.Request) {
	worker, body, ok := s.person(r)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{"error": "sign in first"})
		return
	}
	var in struct {
		Person string `json:"person"`
	}
	if err := json.Unmarshal(body, &in); err != nil || in.Person == "" {
		writeWork(w, http.StatusBadRequest, map[string]any{
			"error": "name the person to add"})
		return
	}
	if err := s.Suppliers.AddMember(worker.ID, in.Person); err != nil {
		writeWork(w, http.StatusConflict, map[string]any{"error": err.Error()})
		return
	}
	sup, _ := s.Suppliers.Get(worker.ID)
	writeWork(w, http.StatusOK, map[string]any{"supplier": sup})
}

func (s *SupplierServer) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	worker, _, ok := s.person(r)
	if !ok {
		writeWork(w, http.StatusUnauthorized, map[string]any{"error": "sign in first"})
		return
	}
	if err := s.Suppliers.RemoveMember(worker.ID, r.PathValue("person")); err != nil {
		writeWork(w, http.StatusConflict, map[string]any{"error": err.Error()})
		return
	}
	sup, _ := s.Suppliers.Get(worker.ID)
	writeWork(w, http.StatusOK, map[string]any{"supplier": sup})
}
