package api

import "testing"

// A cut lawn is a cut lawn. Nothing in the exchange knew whose.
func TestHouseNumberIsConservative(t *testing.T) {
	cases := map[string]string{
		"812 Marlow Street, Detroit MI": "812",
		"14A Beech Road":                "14A",
		"  9 Elm ":                      "9",
		"Marlow Street":                 "", // no number, no mark
		"Apt 4, 812 Marlow":             "", // leading token is not a number
		"":                              "",
		"PO Box 12":                     "",
	}
	for where, want := range cases {
		if got := HouseNumber(where); got != want {
			t.Errorf("HouseNumber(%q) = %q, want %q", where, got, want)
		}
	}
}

// The mark has to survive being read as part of a longer string, because on a
// real photograph it almost always is.
func TestMarkIsFoundInsideRealText(t *testing.T) {
	seen := []string{"812 MARLOW ST", "NO PARKING", "Smith"}
	if !MarkSeenIn(seen, "812") {
		t.Error("a number on a kerb was not recognised")
	}
	if MarkSeenIn(seen, "813") {
		t.Error("the neighbour's number matched")
	}
	if MarkSeenIn([]string{"a green lawn, freshly cut"}, "812") {
		t.Error("a description with no number matched")
	}
}

// A buyer's own mark beats one we guessed, because they know whether their
// number can actually be seen from where the work is.
func TestStatedMarkBeatsDerived(t *testing.T) {
	l := &Listing{Where: "812 Marlow Street"}
	m := l.MarkFor()
	if m == nil || m.Text != "812" || !m.Derived {
		t.Fatalf("expected a derived mark from the address, got %+v", m)
	}
	l.SiteMark = &SiteMark{Text: "Meter A-4471", Note: "on the side wall"}
	m = l.MarkFor()
	if m == nil || m.Text != "Meter A-4471" || m.Derived {
		t.Fatalf("the buyer's own mark was not used: %+v", m)
	}
}

// A job about nowhere in particular must not be asked for a house number.
func TestPracticeJobsAreNotTiedToAPlace(t *testing.T) {
	practice := &Listing{Title: "Practice: photograph anything", Area: "Anywhere"}
	if practice.TiedToPlace() {
		t.Error("a job with no address is being treated as site-bound")
	}
	if practice.MarkFor() != nil {
		t.Error("a mark was demanded of a job about nowhere")
	}
	sited := &Listing{Where: "812 Marlow Street"}
	if !sited.TiedToPlace() {
		t.Error("a job with an address is not site-bound")
	}
}
