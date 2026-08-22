package vision

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// Calling Bedrock without the AWS CLI.
//
// The original client shelled out to `aws bedrock-runtime invoke-model`, which
// was a deliberate choice: resolving the credential chain — SSO, profiles,
// assumed roles — is the genuinely hard part, and the CLI already does it.
//
// It is also why verification could never have worked in production. The
// container is distroless: no shell, no CLI, nothing to exec. The service
// reported "verifier: vision model" and every call would have failed with
// executable file not found.
//
// So the request is signed here. In ECS the credentials come from the task
// role through a link-local endpoint, which is a plain HTTP GET, and the
// signing is a page of well-specified hashing. The CLI stays as the fallback
// for a laptop, where the credential chain really is the hard part.

// Credentials are what SigV4 needs.
type Credentials struct {
	AccessKeyID     string
	SecretAccessKey string
	SessionToken    string
	Expires         time.Time
}

func (c *Credentials) valid(now time.Time) bool {
	return c != nil && c.AccessKeyID != "" &&
		(c.Expires.IsZero() || now.Add(2*time.Minute).Before(c.Expires))
}

// CredentialSource resolves credentials, preferring whatever the runtime has
// already arranged.
type CredentialSource struct {
	HTTP *http.Client
	Now  func() time.Time

	mu     sync.Mutex
	cached *Credentials
}

func (s *CredentialSource) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *CredentialSource) client() *http.Client {
	if s.HTTP != nil {
		return s.HTTP
	}
	return &http.Client{Timeout: 5 * time.Second}
}

// Get returns usable credentials.
//
// The container endpoint first, because that is what a task role looks like
// and it is the case that has to work; then the environment, which is what a
// local run or a CI job usually has.
func (s *CredentialSource) Get(ctx context.Context) (*Credentials, error) {
	s.mu.Lock()
	if s.cached.valid(s.now()) {
		defer s.mu.Unlock()
		return s.cached, nil
	}
	s.mu.Unlock()

	if uri := os.Getenv("AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"); uri != "" {
		c, err := s.fromContainer(ctx, "http://169.254.170.2"+uri)
		if err == nil {
			s.mu.Lock()
			s.cached = c
			s.mu.Unlock()
			return c, nil
		}
	}
	if full := os.Getenv("AWS_CONTAINER_CREDENTIALS_FULL_URI"); full != "" {
		if c, err := s.fromContainer(ctx, full); err == nil {
			s.mu.Lock()
			s.cached = c
			s.mu.Unlock()
			return c, nil
		}
	}
	if id := os.Getenv("AWS_ACCESS_KEY_ID"); id != "" {
		return &Credentials{
			AccessKeyID:     id,
			SecretAccessKey: os.Getenv("AWS_SECRET_ACCESS_KEY"),
			SessionToken:    os.Getenv("AWS_SESSION_TOKEN"),
		}, nil
	}
	return nil, fmt.Errorf("vision: no AWS credentials available to this process")
}

func (s *CredentialSource) fromContainer(ctx context.Context, url string) (*Credentials, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if tok := os.Getenv("AWS_CONTAINER_AUTHORIZATION_TOKEN"); tok != "" {
		req.Header.Set("Authorization", tok)
	}
	resp, err := s.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("vision: credential endpoint returned %d", resp.StatusCode)
	}
	var body struct {
		AccessKeyID     string `json:"AccessKeyId"`
		SecretAccessKey string `json:"SecretAccessKey"`
		Token           string `json:"Token"`
		Expiration      string `json:"Expiration"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	c := &Credentials{
		AccessKeyID: body.AccessKeyID, SecretAccessKey: body.SecretAccessKey,
		SessionToken: body.Token,
	}
	if t, err := time.Parse(time.RFC3339, body.Expiration); err == nil {
		c.Expires = t
	}
	if c.AccessKeyID == "" {
		return nil, fmt.Errorf("vision: credential endpoint returned nothing usable")
	}
	return c, nil
}

// signV4 signs a request in place, per AWS Signature Version 4.
// SignV4 signs an AWS request.
//
// Exported because the exchange needs to reach a second AWS service — mail —
// and a second hand-rolled copy of this is how the two drift apart until one
// of them is subtly wrong.
func SignV4(req *http.Request, body []byte, c *Credentials, region, service string, now time.Time) {
	signV4(req, body, c, region, service, now)
}

func signV4(req *http.Request, body []byte, c *Credentials, region, service string, now time.Time) {
	amzDate := now.UTC().Format("20060102T150405Z")
	dateStamp := now.UTC().Format("20060102")

	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("Host", req.URL.Host)
	if c.SessionToken != "" {
		req.Header.Set("X-Amz-Security-Token", c.SessionToken)
	}
	payloadHash := sha256.Sum256(body)
	hashHex := hex.EncodeToString(payloadHash[:])
	req.Header.Set("X-Amz-Content-Sha256", hashHex)

	// Canonical headers, sorted and lowercased.
	var names []string
	for k := range req.Header {
		names = append(names, strings.ToLower(k))
	}
	names = append(names, "host")
	sort.Strings(names)
	seen := map[string]bool{}
	var canonHeaders, signedHeaders strings.Builder
	for _, n := range names {
		if seen[n] {
			continue
		}
		seen[n] = true
		v := req.Header.Get(n)
		if n == "host" {
			v = req.URL.Host
		}
		canonHeaders.WriteString(n + ":" + strings.TrimSpace(v) + "\n")
		if signedHeaders.Len() > 0 {
			signedHeaders.WriteString(";")
		}
		signedHeaders.WriteString(n)
	}

	canonicalRequest := strings.Join([]string{
		req.Method,
		escapePath(req.URL.Path),
		req.URL.RawQuery,
		canonHeaders.String(),
		signedHeaders.String(),
		hashHex,
	}, "\n")

	scope := dateStamp + "/" + region + "/" + service + "/aws4_request"
	crHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256", amzDate, scope, hex.EncodeToString(crHash[:]),
	}, "\n")

	mac := func(key, data []byte) []byte {
		h := hmac.New(sha256.New, key)
		h.Write(data)
		return h.Sum(nil)
	}
	kDate := mac([]byte("AWS4"+c.SecretAccessKey), []byte(dateStamp))
	kRegion := mac(kDate, []byte(region))
	kService := mac(kRegion, []byte(service))
	kSigning := mac(kService, []byte("aws4_request"))
	signature := hex.EncodeToString(mac(kSigning, []byte(stringToSign)))

	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		c.AccessKeyID, scope, signedHeaders.String(), signature))
}

// escapePath encodes a path the way SigV4 expects: each segment escaped, but
// the separators left alone. Bedrock model ids contain dots and colons, and
// getting this wrong produces a signature mismatch that reads like a
// credentials problem.
func escapePath(p string) string {
	if p == "" {
		return "/"
	}
	segments := strings.Split(p, "/")
	for i, s := range segments {
		segments[i] = escapeSegment(s)
	}
	return strings.Join(segments, "/")
}

func escapeSegment(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case ch >= 'A' && ch <= 'Z', ch >= 'a' && ch <= 'z',
			ch >= '0' && ch <= '9', ch == '-', ch == '.', ch == '_', ch == '~':
			b.WriteByte(ch)
		default:
			fmt.Fprintf(&b, "%%%02X", ch)
		}
	}
	return b.String()
}

// invokeSigned posts a signed InvokeModel request and returns the body.
func (b *Bedrock) invokeSigned(ctx context.Context, payload []byte) ([]byte, error) {
	creds, err := b.Creds.Get(ctx)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("https://bedrock-runtime.%s.amazonaws.com/model/%s/invoke",
		b.Region, b.ModelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	signV4(req, payload, creds, b.Region, "bedrock", time.Now())

	client := b.HTTP
	if client == nil {
		client = &http.Client{Timeout: 120 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("bedrock %d: %s", resp.StatusCode, truncate(string(out), 300))
	}
	return out, nil
}
