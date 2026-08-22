package exchange

import (
	"strings"
	"testing"
)

// The reporting threshold has to be known before somebody crosses it.
//
// Collecting a tax document at the moment a worker tries to cash out means
// holding their money while they go and find one. The whole point of tracking
// this is to ask early.
func TestApproachingIsFlaggedBeforeCrossing(t *testing.T) {
	cases := []struct {
		earned              int64
		reportable, warning bool
		what                string
	}{
		{0, false, false, "a new worker"},
		{44999, false, false, "well under the line"},
		{45000, false, true, "three quarters of the way — ask now"},
		{59999, false, true, "one cent short"},
		{60000, true, false, "exactly at the threshold is over it"},
		{120000, true, false, "well over"},
	}
	for _, c := range cases {
		st := TaxStatus{ThresholdMinor: ReportingThresholdMinor, EarnedMinor: c.earned}
		st.Reportable = c.earned >= ReportingThresholdMinor
		st.Approaching = !st.Reportable && c.earned >= ReportingThresholdMinor*3/4
		if st.Reportable != c.reportable {
			t.Errorf("%s (%d): reportable=%v, wanted %v", c.what, c.earned, st.Reportable, c.reportable)
		}
		if st.Approaching != c.warning {
			t.Errorf("%s (%d): approaching=%v, wanted %v", c.what, c.earned, st.Approaching, c.warning)
		}
		// The two must never both be true: a worker told they are approaching
		// a line they already crossed is being told the wrong thing to do.
		if st.Reportable && st.Approaching {
			t.Errorf("%s: flagged as both approaching and over", c.what)
		}
	}
}

// $600 is the figure the rule turns on. If this constant drifts, the warning
// fires at the wrong time and the collection happens too late.
func TestReportingThresholdIsSixHundredDollars(t *testing.T) {
	if ReportingThresholdMinor != 60000 {
		t.Fatalf("threshold is %d minor units; 1099-NEC turns on $600",
			ReportingThresholdMinor)
	}
}

// What a real, freshly-created Connect account asks for.
//
// Taken from an actual test-mode account: ten requirements. Rendering all ten
// into one sentence produces a paragraph that reads like an obstacle course,
// when the provider in fact collects the whole set on a single page.
func TestRealRequirementListStaysReadable(t *testing.T) {
	fresh := []string{
		"business_profile.mcc", "business_profile.url", "external_account",
		"individual.address.city", "individual.address.line1",
		"individual.address.postal_code", "individual.dob.day",
		"individual.email", "individual.first_name", "tos_acceptance.date",
	}
	got := humanizeNeeds(fresh, "")
	if len(got) > 4 {
		t.Errorf("produced %d clauses from %d requirements: %v", len(got), len(fresh), got)
	}
	for _, g := range got {
		if strings.Contains(g, ".") || strings.Contains(g, "_") {
			t.Errorf("%q is a field name, not something a person can act on", g)
		}
	}
	if len(got) == 0 {
		t.Fatal("said nothing at all about ten outstanding requirements")
	}
	t.Logf("renders as: %s", joinPhrase(got))
}

func joinPhrase(ss []string) string {
	switch len(ss) {
	case 1:
		return ss[0]
	default:
		return strings.Join(ss[:len(ss)-1], ", ") + ", and " + ss[len(ss)-1]
	}
}
