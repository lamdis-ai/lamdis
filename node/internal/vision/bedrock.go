package vision

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	nethttp "net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Bedrock calls Claude on Amazon Bedrock.
//
// It shells out to the AWS CLI rather than linking the AWS SDK. That is a
// deliberate trade for this milestone: the CLI already resolves the whole
// credential chain (SSO, profiles, assumed roles, IMDS) that is the genuinely
// hard part, and it keeps the node at three direct dependencies. The seam is
// the Model interface, so replacing this with the SDK later touches one file
// and nothing above it.
type Bedrock struct {
	Profile string
	Region  string
	ModelID string
	// MaxTokens bounds thinking plus response together, so it needs headroom
	// beyond the answer itself.
	MaxTokens int
	Timeout   time.Duration
	// Retries bounds attempts against transient service errors.
	Retries int

	// Creds resolves AWS credentials for signing. When set, requests are
	// signed and sent directly, which is the only path that works in a
	// container with no shell and no CLI.
	Creds *CredentialSource
	HTTP  *nethttp.Client
}

// Signed reports whether this client can call Bedrock without the CLI.
//
// It asks the credential source rather than checking that one exists: a source
// that resolves nothing is exactly as useless as none at all, and answering
// yes would route every call down a path that cannot work.
func (b *Bedrock) Signed() bool {
	if b.Creds == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := b.Creds.Get(ctx)
	return err == nil
}

// NewBedrock builds a client that signs its own requests where it can.
//
// The credential source is always attached: in a container it finds the task
// role, on a laptop it finds the environment, and only when it finds neither
// does the client fall back to shelling out to the CLI — which is exactly the
// case a laptop is in and a container never is.
func NewBedrock(profile, region, modelID string) *Bedrock {
	if region == "" {
		region = "us-east-1"
	}
	if modelID == "" {
		// An inference profile id, not a bare model id: on-demand throughput
		// for this model is only offered through one.
		modelID = "us.anthropic.claude-opus-5"
	}
	return &Bedrock{
		Creds:   &CredentialSource{},
		Profile: profile, Region: region, ModelID: modelID,
		MaxTokens: 4096, Timeout: 180 * time.Second, Retries: 4,
	}
}

func (b *Bedrock) ID() string { return b.ModelID }

// bedrockRequest is the Anthropic messages shape Bedrock accepts.
//
// Note what is absent: temperature, top_p, and top_k. They are removed on this
// model generation and sending any of them is a 400. Behaviour is steered by
// the prompt instead.
type bedrockRequest struct {
	AnthropicVersion string          `json:"anthropic_version"`
	MaxTokens        int             `json:"max_tokens"`
	System           string          `json:"system,omitempty"`
	Messages         []bedrockMsg    `json:"messages"`
	Thinking         *thinkingConfig `json:"thinking,omitempty"`
}

type thinkingConfig struct {
	Type string `json:"type"`
}

type bedrockMsg struct {
	Role    string         `json:"role"`
	Content []bedrockBlock `json:"content"`
}

type bedrockBlock struct {
	Type   string        `json:"type"`
	Text   string        `json:"text,omitempty"`
	Source *bedrockImage `json:"source,omitempty"`
}

type bedrockImage struct {
	Type      string `json:"type"`
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

type bedrockResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason  string `json:"stop_reason"`
	StopDetails *struct {
		Type        string `json:"type"`
		Category    string `json:"category"`
		Explanation string `json:"explanation"`
	} `json:"stop_details"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

func (b *Bedrock) invoke(ctx context.Context, req bedrockRequest, out any) (Usage, error) {
	var usage Usage
	body, err := json.Marshal(req)
	if err != nil {
		return usage, err
	}

	ctx, cancel := context.WithTimeout(ctx, b.Timeout)
	defer cancel()

	// The body goes in a file, not in argv.
	//
	// A base64 image is hundreds of kilobytes and the kernel caps the whole
	// argument list — so a large photograph failed with "argument list too
	// long", surfaced to the worker as "that image could not be checked right
	// now". The failure scaled with resolution, which meant it quietly
	// favoured small, re-encoded pictures: exactly the ones that have had
	// their capture metadata stripped.
	// fileb:// base64-encodes the file's contents itself, so the raw body goes
	// in — encoding it first would send it double-encoded.
	bodyFile, cleanupBody, err := writeTemp(body)
	if err != nil {
		return usage, fmt.Errorf("bedrock invoke: %w", err)
	}
	defer cleanupBody()

	args := []string{
		"bedrock-runtime", "invoke-model",
		"--region", b.Region,
		"--model-id", b.ModelID,
		"--body", "fileb://" + bodyFile,
		"/dev/stdout",
	}
	// Retry only what is genuinely transient. A refusal or a validation error
	// is the model's answer, not a blip, and retrying it would spend money to
	// be told the same thing again.
	var stdout, stderr bytes.Buffer
	attempts := b.Retries
	if attempts < 1 {
		attempts = 3
	}

	// The signed path when credentials can be resolved. The CLI path stays for
	// a laptop, where working out which profile or SSO session applies really
	// is the hard part — but it cannot run in the container, so it must never
	// be the only path.
	if b.Signed() {
		for attempt := 1; ; attempt++ {
			raw, err := b.invokeSigned(ctx, body)
			if err == nil {
				stdout.Write(raw)
				break
			}
			if attempt >= attempts || !transient(err.Error()) {
				return usage, fmt.Errorf("bedrock invoke: %w", err)
			}
			wait := time.Duration(1<<uint(attempt-1)) * 2 * time.Second
			select {
			case <-ctx.Done():
				return usage, fmt.Errorf("bedrock invoke: %w", ctx.Err())
			case <-time.After(wait):
			}
		}
		// Falls through to the shared parsing below: the signed response and
		// the CLI's output are the same object, so only the transport differs.
		goto parse
	}

	for attempt := 1; ; attempt++ {
		stdout.Reset()
		stderr.Reset()
		cmd := exec.CommandContext(ctx, "aws", args...)
		if b.Profile != "" {
			cmd.Env = append(cmd.Environ(), "AWS_PROFILE="+b.Profile)
		}
		cmd.Stdout, cmd.Stderr = &stdout, &stderr
		err := cmd.Run()
		if err == nil {
			break
		}
		msg := strings.TrimSpace(stderr.String())
		if attempt >= attempts || !transient(msg) {
			return usage, fmt.Errorf("bedrock invoke: %w: %s", err, msg)
		}
		// Exponential backoff, bounded. The context deadline still governs.
		wait := time.Duration(1<<uint(attempt-1)) * 2 * time.Second
		select {
		case <-ctx.Done():
			return usage, fmt.Errorf("bedrock invoke: %w", ctx.Err())
		case <-time.After(wait):
		}
	}

parse:
	// The CLI writes the model's response to the output path and a small
	// metadata object to its own stdout; both land in the same buffer here, so
	// take the first JSON object that parses as a response. A signed call puts
	// the response there directly.
	raw := stdout.Bytes()
	var resp bedrockResponse
	if err := firstJSONObject(raw, &resp); err != nil {
		return usage, fmt.Errorf("bedrock: parsing response: %w", err)
	}
	usage = Usage{InputTokens: resp.Usage.InputTokens, OutputTokens: resp.Usage.OutputTokens}

	// A refusal is a successful HTTP response with an empty body, not an
	// error. Reading content[0] without checking would panic on it.
	if resp.StopReason == "refusal" {
		cat := ""
		if resp.StopDetails != nil {
			cat = resp.StopDetails.Category
		}
		return usage, fmt.Errorf("bedrock: the model declined this request (category %q)", cat)
	}
	if len(resp.Content) == 0 {
		return usage, fmt.Errorf("bedrock: empty response (stop_reason %q)", resp.StopReason)
	}

	text := ""
	for _, c := range resp.Content {
		if c.Type == "text" {
			text += c.Text
		}
	}
	payload, err := extractJSONObject(text)
	if err != nil {
		return usage, fmt.Errorf("bedrock: %w\n%s", err, truncate(text, 400))
	}
	if err := json.Unmarshal(payload, out); err != nil {
		return usage, fmt.Errorf("bedrock: model returned unparseable JSON: %w\n%s", err, truncate(text, 400))
	}
	return usage, nil
}

func (b *Bedrock) Describe(ctx context.Context, imageJPEG []byte) (*Observation, Usage, error) {
	req := bedrockRequest{
		AnthropicVersion: "bedrock-2023-05-31",
		MaxTokens:        b.MaxTokens,
		System:           describeSystem + schemaInstruction(observationSchema),
		// Thinking stays on at low effort. Disabling it is the cheaper-looking
		// option and the wrong one: with thinking off this model can emit a
		// tool call as plain text, which for a verifier means a call that
		// silently never runs.
		Thinking: &thinkingConfig{Type: "adaptive"},
		Messages: []bedrockMsg{{
			Role: "user",
			Content: []bedrockBlock{
				{Type: "image", Source: &bedrockImage{
					Type: "base64", MediaType: "image/jpeg",
					Data: base64.StdEncoding.EncodeToString(imageJPEG),
				}},
				{Type: "text", Text: "Describe this image."},
			},
		}},
	}
	var obs Observation
	usage, err := b.invoke(ctx, req, &obs)
	if err != nil {
		return nil, usage, err
	}
	return &obs, usage, nil
}

func (b *Bedrock) Adjudicate(ctx context.Context, predicate string, obs *Observation) (*Adjudication, Usage, error) {
	// The observation is wrapped in tags and framed as untrusted. At this tier
	// the raw image is deliberately not re-sent, so text painted into the
	// photo cannot reach the model that decides the verdict.
	user := fmt.Sprintf(
		"Predicate to judge:\n%s\n\n<observation>\n%s\n</observation>",
		predicate, obs.JSON())

	req := bedrockRequest{
		AnthropicVersion: "bedrock-2023-05-31",
		MaxTokens:        b.MaxTokens,
		System:           adjudicateSystem + schemaInstruction(adjudicationSchema),
		Thinking:         &thinkingConfig{Type: "adaptive"},
		Messages: []bedrockMsg{{
			Role:    "user",
			Content: []bedrockBlock{{Type: "text", Text: user}},
		}},
	}
	var adj Adjudication
	usage, err := b.invoke(ctx, req, &adj)
	if err != nil {
		return nil, usage, err
	}
	return &adj, usage, nil
}

// firstJSONObject scans for the first top-level JSON object in b that decodes
// into out with the fields we need.
func firstJSONObject(b []byte, out *bedrockResponse) error {
	dec := json.NewDecoder(bytes.NewReader(b))
	for {
		var probe json.RawMessage
		if err := dec.Decode(&probe); err != nil {
			return fmt.Errorf("no model response found in output")
		}
		var candidate bedrockResponse
		if err := json.Unmarshal(probe, &candidate); err != nil {
			continue
		}
		if len(candidate.Content) > 0 || candidate.StopReason != "" {
			*out = candidate
			return nil
		}
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// schemaInstruction pins the response shape in the prompt. Bedrock's legacy
// InvokeModel body has no output_config field, so the schema is stated rather
// than enforced by the API — which is why the caller still validates the
// result by decoding it into a typed struct and errors if it does not fit.
func schemaInstruction(schema string) string {
	return "\n\nRespond with a single JSON object and nothing else. No prose, no " +
		"markdown fence, no explanation before or after. It must validate against " +
		"this JSON Schema:\n" + schema
}

// extractJSONObject pulls the outermost balanced JSON object out of a response
// that may carry a fence or stray prose around it.
func extractJSONObject(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "```"); i >= 0 {
		rest := s[i+3:]
		if j := strings.Index(rest, "\n"); j >= 0 {
			rest = rest[j+1:]
		}
		if k := strings.Index(rest, "```"); k >= 0 {
			rest = rest[:k]
		}
		s = strings.TrimSpace(rest)
	}
	start := strings.Index(s, "{")
	if start < 0 {
		return nil, fmt.Errorf("no JSON object in the response")
	}
	depth, inStr, esc := 0, false, false
	for i := start; i < len(s); i++ {
		c := s[i]
		switch {
		case esc:
			esc = false
		case c == '\\' && inStr:
			esc = true
		case c == '"':
			inStr = !inStr
		case inStr:
		case c == '{':
			depth++
		case c == '}':
			depth--
			if depth == 0 {
				return []byte(s[start : i+1]), nil
			}
		}
	}
	return nil, fmt.Errorf("unterminated JSON object in the response")
}

// transient reports whether an invoke failure is worth retrying. Throttling and
// capacity errors are; anything about the request itself is not.
func transient(msg string) bool {
	for _, marker := range []string{
		"ServiceUnavailable",
		"ThrottlingException",
		"TooManyRequests",
		"ModelNotReady",
		"InternalServerException",
		"Unable to connect",
		"timed out",
	} {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return false
}

// writeTemp puts a payload somewhere the CLI can read it, and returns a
// cleanup that removes it.
//
// Only the laptop path needs this; the signed transport posts the body
// directly and never touches the filesystem.
func writeTemp(payload []byte) (path string, cleanup func(), err error) {
	f, err := os.CreateTemp("", "lamdis-vision-*.b64")
	if err != nil {
		return "", func() {}, err
	}
	name := f.Name()
	if _, err := f.Write(payload); err != nil {
		f.Close()
		os.Remove(name)
		return "", func() {}, err
	}
	if err := f.Close(); err != nil {
		os.Remove(name)
		return "", func() {}, err
	}
	return name, func() { os.Remove(name) }, nil
}
