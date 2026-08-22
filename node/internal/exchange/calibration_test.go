package exchange

import (
	"strings"
	"testing"
)

// A number that decides whether somebody gets paid must be measured.
//
// This test exists because of a specific failure. Asked whether fabricated
// imagery would be caught, the reasoning went: grep shows the signal is
// discarded, therefore the question is settled and measuring it would only
// confirm what the code already says. The first half was true and the
// conclusion was wrong. When the measurement was taken, real photographs
// topped out at 0.30, generated ones started at 0.45, and the constant sitting
// in the tree was 0.60 — on the wrong side of the gap, passing the exact
// fabrication it existed to stop.
//
// Grep can tell you whether a signal is used. It cannot tell you whether the
// number is right. Only measurement does that, and the difference is invisible
// unless something insists on it.
func TestEveryEnforcedThresholdWasMeasured(t *testing.T) {
	enforced := map[string]bool{"SyntheticThreshold": true}

	for _, c := range Calibrations {
		if !enforced[c.Name] {
			// An unmeasured threshold is fine as long as it gates nothing.
			if c.Measured {
				continue
			}
			if c.Value != 0 {
				t.Errorf("%s is unmeasured and set to %v; an unmeasured "+
					"threshold must be zero so it cannot quietly begin to bite",
					c.Name, c.Value)
			}
			continue
		}
		if !c.Measured {
			t.Errorf("%s refuses people's work and was never measured", c.Name)
			continue
		}
		// A measurement nobody can reproduce or date is a story, not evidence.
		for field, v := range map[string]string{
			"date":                 c.On,
			"method":               c.Method,
			"negative set":         c.Negative,
			"positive set":         c.Positive,
			"limits of the sample": c.Limits,
		} {
			if strings.TrimSpace(v) == "" {
				t.Errorf("%s is enforced but records no %s", c.Name, field)
			}
		}
	}

	if err := CheckCalibrations(enforced); err != nil {
		t.Errorf("a server would refuse to start: %v", err)
	}
}

// Wiring an unmeasured threshold must stop the exchange from starting, rather
// than silently deciding somebody's payout.
func TestAnUnmeasuredThresholdCannotBeEnforced(t *testing.T) {
	err := CheckCalibrations(map[string]bool{"RecaptureThreshold": true})
	if err == nil {
		t.Fatal("an unmeasured threshold was allowed to gate work")
	}
	if !strings.Contains(err.Error(), "never measured") {
		t.Errorf("the refusal does not say why: %v", err)
	}
}

// Signals that gate nothing must still be recorded, or the measurement can
// never be taken.
func TestUnenforcedSignalsAreStillCollected(t *testing.T) {
	var found bool
	for _, c := range Calibrations {
		if c.Name == "RecaptureThreshold" {
			found = true
			if c.Measured {
				t.Error("recapture is marked measured; no such measurement was taken")
			}
			if !strings.Contains(c.Limits, "recorded") {
				t.Error("nothing says the signal is being collected, so nobody " +
					"will know a corpus is accumulating")
			}
		}
	}
	if !found {
		t.Fatal("the recapture signal is not in the registry at all, so its " +
			"absence from the gate is invisible")
	}
}
