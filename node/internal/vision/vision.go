// Package vision reads images with a model.
//
// The contract here is two calls, and the first one is blind. The describer
// sees the image but is never told the predicate, the challenge code, or
// anything about the job — it only transcribes what is literally visible. Two
// things fall out of that for free:
//
//   - The challenge code becomes trustworthy. The describer reads out whatever
//     text it sees without knowing what code is expected, and Go does the
//     comparison. A provider cannot talk it into a match.
//   - Injection detection becomes trustworthy, because the flag is raised by a
//     model that has no verdict to flip.
//
// Only then does the adjudicator see the predicate, alongside the describer's
// output inside a delimited untrusted block — and at the standard tier it never
// sees the raw pixels at all, so text painted into a photo cannot reach it.
package vision

import (
	"context"
	"encoding/json"
)

// Observation is the blind describer's structured reading.
type Observation struct {
	Scene       string   `json:"scene"`
	Objects     []string `json:"objects"`
	TextVisible []struct {
		Text       string  `json:"text"`
		Location   string  `json:"location"`
		Legibility float64 `json:"legibility"`
	} `json:"text_visible"`
	Signage []struct {
		Text      string `json:"text"`
		Color     string `json:"color"`
		Mount     string `json:"mount"`
		Condition string `json:"condition"`
	} `json:"signage"`
	TimeOfDayEstimate string   `json:"time_of_day_estimate"`
	WeatherVisible    string   `json:"weather_visible"`
	Occlusions        []string `json:"occlusions"`
	Anomalies         []string `json:"anomalies"`

	ImageQuality struct {
		Blur               float64 `json:"blur"`
		Exposure           string  `json:"exposure"`
		ResolutionAdequate bool    `json:"resolution_adequate"`
	} `json:"image_quality"`

	SyntheticSuspicion  float64  `json:"synthetic_suspicion"`
	SyntheticReasons    []string `json:"synthetic_reasons"`
	RecaptureSuspicion  float64  `json:"screen_or_print_recapture_suspicion"`
	InstructionLikeText bool     `json:"instruction_like_text_present"`
}

// Adjudication is the second call's verdict on the predicate.
type Adjudication struct {
	Verdict                   string   `json:"verdict"` // satisfied | not_satisfied | indeterminate
	SelfConfidence            float64  `json:"self_confidence"`
	SupportingObservations    []string `json:"supporting_observations"`
	ContradictingObservations []string `json:"contradicting_observations"`
	MissingInformation        []string `json:"missing_information"`
	WouldSecondCaptureHelp    bool     `json:"would_a_second_capture_help"`
	InjectionAttemptDetected  bool     `json:"injection_attempt_detected"`
}

// Usage is what a call cost.
type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Model is one provider of vision and adjudication. Mirrors the shape of the
// node's existing embedder: one narrow interface, several implementations.
type Model interface {
	// Describe reads an image without being told what the job is.
	Describe(ctx context.Context, imageJPEG []byte) (*Observation, Usage, error)
	// Adjudicate judges a predicate against a description. obs is passed as
	// untrusted data, never as instructions.
	Adjudicate(ctx context.Context, predicate string, obs *Observation) (*Adjudication, Usage, error)
	// ID identifies the model for the verdict's provenance.
	ID() string
}

// PromptVersion is the hash of the prompt contract. Calibration tables are
// keyed by it, so changing a prompt invalidates learned weights rather than
// silently corrupting them — the detail everyone forgets.
var PromptVersion = hashPrompts()

// Transcribed flattens every piece of text the describer read out of the
// image. The challenge-code comparison runs over this in Go, which is the
// whole reason the describer is kept blind.
func (o *Observation) Transcribed() []string {
	var out []string
	if o == nil {
		return out
	}
	for _, t := range o.TextVisible {
		out = append(out, t.Text)
	}
	for _, s := range o.Signage {
		out = append(out, s.Text)
	}
	return out
}

// JSON renders the observation for the adjudicator's untrusted block.
func (o *Observation) JSON() string {
	b, err := json.Marshal(o)
	if err != nil {
		return "{}"
	}
	return string(b)
}
