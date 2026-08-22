package exchange

import "fmt"

// Thresholds that gate money or verification, and where their numbers came
// from.
//
// This file exists because of a specific mistake. Asked whether a fabricated
// image would be caught, the honest answer was "grep says the signal is
// discarded" — true — and the wrong conclusion drawn from it was that the
// question could be settled without measuring anything. It could not. When the
// measurement was finally taken, the constant in the tree was 0.60 and real
// photographs topped out at 0.30 while generated ones started at 0.45: the
// guessed number sat on the wrong side of the gap and would have passed the
// fabrication it existed to stop.
//
// A threshold nobody measured is a guess wearing a constant's clothes. The
// registry below makes that visible: every gating number is either backed by a
// recorded observation, or explicitly marked as unmeasured — and an unmeasured
// one is not allowed to gate anything.

// Calibration records where a threshold's value came from.
type Calibration struct {
	// Name is the constant this describes.
	Name string
	// Value is what it is set to.
	Value float64
	// Measured is false when nobody has taken the measurement yet. An
	// unmeasured threshold may be recorded and reported, never enforced.
	Measured bool
	// On is when the measurement was taken, and Method how.
	On     string
	Method string
	// Negative and Positive are the two distributions the threshold separates,
	// in the words of whoever measured them.
	Negative string
	Positive string
	// Limits is what the sample does not cover. The most useful field here,
	// because it is what the next person needs in order to distrust the number
	// correctly.
	Limits string
}

// Enforceable reports whether this threshold may be used to refuse somebody's
// work.
func (c Calibration) Enforceable() bool { return c.Measured }

// Calibrations is every threshold in the verification path.
var Calibrations = []Calibration{
	{
		Name:     "SyntheticThreshold",
		Value:    SyntheticThreshold,
		Measured: true,
		On:       "2026-08-21",
		Method: "scored with the live describer; generated images produced by " +
			"Qwen image on the project's own GPU box, real images straight from " +
			"a phone camera roll",
		Negative: "18 genuine phone photographs: max 0.30, median 0.05",
		Positive: "Qwen diffusion, plain scenes 0.45 and 0.60; odd framing 0.75; " +
			"flat vector illustrations 0.97-0.98",
		Limits: "one generator, one phone, no adversarial tuning against the " +
			"detector. Generated output that has been post-processed — grain, " +
			"recompression, a transplanted EXIF block — is not represented and " +
			"may score below the threshold.",
	},
	{
		Name:     "RecaptureThreshold",
		Value:    RecaptureThreshold,
		Measured: false,
		Method: "not taken. Would need photographs of screens and of printed " +
			"images, which nothing in this project can currently produce.",
		Limits: "unmeasured, so it gates nothing. The signal is recorded on " +
			"every submission so a corpus accumulates for whoever measures it.",
	},
}

// CheckCalibrations refuses to start with an unmeasured threshold wired to
// refuse work.
//
// Called at construction. The failure mode it prevents is the one that
// happened: a plausible-looking number, never measured, quietly deciding
// whether somebody gets paid.
func CheckCalibrations(enforcing map[string]bool) error {
	for _, c := range Calibrations {
		if enforcing[c.Name] && !c.Enforceable() {
			return fmt.Errorf(
				"calibration: %s is enforced but never measured (%s)",
				c.Name, c.Method)
		}
	}
	return nil
}
