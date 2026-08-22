package api

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
)

// What a job needs someone to be qualified for.
//
// A trade is not a job kind. "do" describes the shape of the work — go
// somewhere, change something, prove it. Whether that change is legal for you
// to make is a different question, and answering it with the same field is how
// you end up dispatching a drain snake to a gas line.

// Skill is a normalized capability tag: lowercase, no spaces.
type Skill = string

// Skills the exchange knows about, with the credential each one implies.
//
// This list is deliberately short. A taxonomy nobody maintains is worse than
// no taxonomy, because it looks authoritative while going stale. These are the
// trades where doing the work without the license is a crime rather than a
// disappointment, plus the handful of unlicensed skills buyers actually ask
// for by name.
var skillCatalog = map[Skill]SkillInfo{
	"hvac":       {Label: "HVAC", Licensed: true, Note: "state mechanical license"},
	"electrical": {Label: "Electrical", Licensed: true, Note: "journeyman or master electrician"},
	"plumbing":   {Label: "Plumbing", Licensed: true, Note: "state plumbing license"},
	"refrigerant": {Label: "Refrigerant handling", Licensed: true,
		Note: "EPA 608 certification"},
	"locksmith": {Label: "Locksmith", Licensed: true, Note: "state locksmith license"},
	"drone":     {Label: "Drone flight", Licensed: true, Note: "FAA Part 107"},
	"cdl":       {Label: "Commercial driving", Licensed: true, Note: "CDL"},
	"notary":    {Label: "Notary", Licensed: true, Note: "commission in the job's state"},
	"ladder":    {Label: "Ladder work", Licensed: false, Note: "comfortable above 12 feet"},
	"vehicle":   {Label: "Has a vehicle", Licensed: false},
	"lifting":   {Label: "Heavy lifting", Licensed: false, Note: "50 lb and up"},
	"cleaning":  {Label: "Cleaning", Licensed: false},
	"assembly":  {Label: "Assembly", Licensed: false},
	"photography": {Label: "Photography", Licensed: false,
		Note: "beyond a phone snapshot"},
}

// SkillInfo is what the exchange can say about a skill without asking anyone.
type SkillInfo struct {
	Label    string `json:"label"`
	Licensed bool   `json:"licensed"`
	Note     string `json:"note,omitempty"`
}

// KnownSkills is the catalog, ordered, for anything that needs to show a list.
func KnownSkills() []struct {
	Skill Skill `json:"skill"`
	SkillInfo
} {
	out := make([]struct {
		Skill Skill `json:"skill"`
		SkillInfo
	}, 0, len(skillCatalog))
	for s, info := range skillCatalog {
		out = append(out, struct {
			Skill Skill `json:"skill"`
			SkillInfo
		}{s, info})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Licensed != out[j].Licensed {
			return out[i].Licensed
		}
		return out[i].Label < out[j].Label
	})
	return out
}

// SkillLabel is the human name, falling back to the tag for anything unknown.
func SkillLabel(s Skill) string {
	if info, ok := skillCatalog[s]; ok {
		return info.Label
	}
	return s
}

// Licensed reports whether doing this work without a credential is illegal.
func Licensed(s Skill) bool { return skillCatalog[s].Licensed }

// NormalizeSkills cleans a submitted list: lowercased, deduped, ordered, and
// limited to the catalog.
//
// Unknown tags are dropped rather than kept. A buyer who invents "hvac-j"
// would otherwise post a job that matches nobody and looks like the exchange
// has no supply, when in fact the exchange has no such skill.
func NormalizeSkills(in []Skill) []Skill {
	seen := map[Skill]bool{}
	out := make([]Skill, 0, len(in))
	for _, s := range in {
		s = strings.ToLower(strings.TrimSpace(s))
		if s == "" || seen[s] {
			continue
		}
		if _, ok := skillCatalog[s]; !ok {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// MeetsSkills reports whether someone holding `has` can take work needing
// `needs`.
//
// Every required skill must be held. This is an and, not an or: a job that
// needs both a ladder and an EPA card is not half-doable by someone with a
// ladder.
func MeetsSkills(needs, has []Skill) bool {
	if len(needs) == 0 {
		return true
	}
	held := make(map[Skill]bool, len(has))
	for _, s := range has {
		held[s] = true
	}
	for _, s := range needs {
		if !held[s] {
			return false
		}
	}
	return true
}

// MissingSkills is what to tell someone who cannot take a job yet.
func MissingSkills(needs, has []Skill) []Skill {
	held := make(map[Skill]bool, len(has))
	for _, s := range has {
		held[s] = true
	}
	var out []Skill
	for _, s := range needs {
		if !held[s] {
			out = append(out, s)
		}
	}
	return out
}

// SkillPhrase renders a list for a sentence: "HVAC and EPA 608".
func SkillPhrase(ss []Skill) string {
	labels := make([]string, len(ss))
	for i, s := range ss {
		labels[i] = SkillLabel(s)
	}
	switch len(labels) {
	case 0:
		return ""
	case 1:
		return labels[0]
	case 2:
		return labels[0] + " and " + labels[1]
	default:
		return strings.Join(labels[:len(labels)-1], ", ") + ", and " + labels[len(labels)-1]
	}
}

// RegisterSkills publishes the catalog.
//
// Open, because a buyer's agent and an operator's console both need the same
// vocabulary, and a taxonomy only one side can read produces jobs that match
// nobody.
func RegisterSkills(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/skills", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		json.NewEncoder(w).Encode(map[string]any{"skills": KnownSkills()})
	})
}

// AddressInTitle reports whether a public title appears to repeat the private
// address.
//
// Removing Where and Instructions from the board closed the obvious leak and
// not the quiet one: the title is public by necessity, and an agent writing
// "a FOR LEASE sign is displayed at 742 Evergreen Rd" puts the address back on
// the board through the front door.
//
// This does not try to recognise addresses in general — that is a losing
// exercise. It checks the narrow, reliable case: the buyer gave us an exact
// address, and the public title contains its distinctive part. That catches
// the mistake agents actually make, which is pasting the same string into
// both fields.
//
// For some jobs the address genuinely belongs in the title: a sign on a
// commercial street is a public fact. So this reports rather than refuses, and
// the caller decides.
func AddressInTitle(title, where string) bool {
	if title == "" || where == "" {
		return false
	}
	t := strings.ToLower(title)
	// The distinctive part of a street address is the number plus the first
	// word of the street name. "812 Marlow" identifies a property; "Street"
	// does not.
	fields := strings.Fields(strings.ToLower(where))
	if len(fields) < 2 {
		return false
	}
	if !looksNumeric(fields[0]) {
		return false
	}
	return strings.Contains(t, fields[0]+" "+fields[1])
}

func looksNumeric(s string) bool {
	if s == "" {
		return false
	}
	digits := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits++
		}
	}
	return digits > 0 && digits >= len(s)-1
}
