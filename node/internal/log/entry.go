// Package log implements the Lamdis Protocol entry envelope and the
// hash-chained, per-(thread, author, lane) append-only logs that every
// other component builds on. See spec/schemas/entry.schema.json for the
// normative shape; this package must stay in lockstep with it.
package log

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// EnvelopeVersion is the protocol envelope version, fixed at 0 until spec v0.1 freezes.
const EnvelopeVersion = 0

// GenesisPrev is the prev value for the first entry in a (thread, author, lane) chain.
const GenesisPrev = "0000000000000000000000000000000000000000000000000000000000000000"

// Lane is the replication/permission class of an entry.
type Lane string

const (
	LaneControl Lane = "control"
	LaneSummary Lane = "summary"
	LaneContent Lane = "content"
)

func (l Lane) Valid() bool {
	return l == LaneControl || l == LaneSummary || l == LaneContent
}

// Core entry kinds. The core.* namespace is reserved; anything else is an
// extension kind that nodes replicate opaquely.
const (
	KindThread        = "core.thread"
	KindMessage       = "core.message"
	KindMembership    = "core.membership"
	KindDelegation    = "core.delegation"
	KindAccessRequest = "core.access_request"
	KindGrant         = "core.grant"
	KindDeny          = "core.deny"
	KindRevoke        = "core.revoke"
	KindSummary       = "core.summary"
	KindThreadCard    = "core.thread_card"
	KindRedaction     = "core.redaction"
)

// Covers is the contiguous range of content a summary covers.
type Covers struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Refs are typed references to other entries.
type Refs struct {
	DerivedFrom []string `json:"derived_from,omitempty"`
	RepliesTo   string   `json:"replies_to,omitempty"`
	Supersedes  string   `json:"supersedes,omitempty"`
	Covers      *Covers  `json:"covers,omitempty"`
}

func (r *Refs) empty() bool {
	return r == nil || (len(r.DerivedFrom) == 0 && r.RepliesTo == "" && r.Supersedes == "" && r.Covers == nil)
}

// Entry is the only unit of data in the protocol. Field order here defines
// the canonical encoding order and must match the schema.
type Entry struct {
	V          int             `json:"v"`
	ID         string          `json:"id"`
	Thread     string          `json:"thread"`
	Kind       string          `json:"kind"`
	Lane       Lane            `json:"lane"`
	Author     string          `json:"author"`
	OnBehalfOf string          `json:"on_behalf_of,omitempty"`
	Seq        uint64          `json:"seq"`
	Lamport    uint64          `json:"lamport"`
	Prev       string          `json:"prev"`
	TS         string          `json:"ts"`
	Refs       *Refs           `json:"refs,omitempty"`
	Body       json.RawMessage `json:"body"`
	Sig        string          `json:"sig,omitempty"`
}

var (
	ulidRe = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)
	kindRe = regexp.MustCompile(`^[a-z0-9]+(\.[a-z0-9_]+)+$`)
	hashRe = regexp.MustCompile(`^[0-9a-f]{64}$`)
	sigRe  = regexp.MustCompile(`^[0-9a-f]{128}$`)
)

// canonicalBody re-encodes arbitrary JSON deterministically: object keys
// sorted, number literals preserved verbatim, no HTML escaping.
func canonicalBody(raw json.RawMessage) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, fmt.Errorf("body is required")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("body is not valid JSON: %w", err)
	}
	if dec.More() {
		return nil, fmt.Errorf("body has trailing data")
	}
	if _, ok := v.(map[string]any); !ok {
		return nil, fmt.Errorf("body must be a JSON object")
	}
	var buf bytes.Buffer
	if err := writeCanonical(&buf, v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeCanonical(buf *bytes.Buffer, v any) error {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSONString(buf, k); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := writeCanonical(buf, t[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	case []any:
		buf.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeCanonical(buf, e); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case json.Number:
		buf.WriteString(t.String())
	case string:
		return writeJSONString(buf, t)
	case bool:
		if t {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case nil:
		buf.WriteString("null")
	default:
		return fmt.Errorf("unsupported JSON value %T", v)
	}
	return nil
}

func writeJSONString(buf *bytes.Buffer, s string) error {
	enc := json.NewEncoder(buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(s); err != nil {
		return err
	}
	// json.Encoder appends a newline; drop it.
	buf.Truncate(buf.Len() - 1)
	return nil
}

// canonicalBytes returns the deterministic encoding of e. When forSigning is
// true the sig field is omitted (that is the signature input); otherwise sig
// is included (that is the hash preimage for prev chains).
func (e *Entry) canonicalBytes(forSigning bool) ([]byte, error) {
	body, err := canonicalBody(e.Body)
	if err != nil {
		return nil, err
	}
	c := *e
	c.Body = body
	if c.Refs.empty() {
		c.Refs = nil
	}
	if forSigning {
		c.Sig = ""
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(&c); err != nil {
		return nil, err
	}
	out := buf.Bytes()
	return out[:len(out)-1], nil // drop encoder newline
}

// Hash returns the lowercase hex SHA-256 of the finalized (signed) entry.
// This is the value the next entry in the chain carries as prev.
func (e *Entry) Hash() (string, error) {
	if e.Sig == "" {
		return "", fmt.Errorf("cannot hash unsigned entry %s", e.ID)
	}
	b, err := e.canonicalBytes(false)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}

// Sign computes and attaches the author signature. The entry must already
// carry the author principal id matching priv's public key.
func (e *Entry) Sign(priv ed25519.PrivateKey) error {
	pid, err := PrincipalID(priv.Public().(ed25519.PublicKey))
	if err != nil {
		return err
	}
	if e.Author != pid {
		return fmt.Errorf("author %s does not match signing key %s", e.Author, pid)
	}
	msg, err := e.canonicalBytes(true)
	if err != nil {
		return err
	}
	e.Sig = hex.EncodeToString(ed25519.Sign(priv, msg))
	return nil
}

// Validate checks structural validity and the author signature. It does not
// check chain position (seq/prev) — that is Chain.Append's job.
func (e *Entry) Validate() error {
	switch {
	case e.V != EnvelopeVersion:
		return fmt.Errorf("entry %s: unsupported envelope version %d", e.ID, e.V)
	case !ulidRe.MatchString(e.ID):
		return fmt.Errorf("entry %s: invalid id", e.ID)
	case !ulidRe.MatchString(e.Thread):
		return fmt.Errorf("entry %s: invalid thread id", e.ID)
	case !kindRe.MatchString(e.Kind):
		return fmt.Errorf("entry %s: invalid kind %q", e.ID, e.Kind)
	case !e.Lane.Valid():
		return fmt.Errorf("entry %s: invalid lane %q", e.ID, e.Lane)
	case e.Seq < 1:
		return fmt.Errorf("entry %s: seq must be >= 1", e.ID)
	case e.Lamport < 1:
		return fmt.Errorf("entry %s: lamport must be >= 1", e.ID)
	case !hashRe.MatchString(e.Prev):
		return fmt.Errorf("entry %s: invalid prev", e.ID)
	case e.Sig == "" || !sigRe.MatchString(e.Sig):
		return fmt.Errorf("entry %s: missing or malformed sig", e.ID)
	}
	if strings.HasPrefix(e.Kind, "core.") && !coreKind(e.Kind) {
		return fmt.Errorf("entry %s: unknown reserved kind %q", e.ID, e.Kind)
	}
	pub, err := PublicKey(e.Author)
	if err != nil {
		return fmt.Errorf("entry %s: %w", e.ID, err)
	}
	if e.OnBehalfOf != "" {
		if _, err := PublicKey(e.OnBehalfOf); err != nil {
			return fmt.Errorf("entry %s: on_behalf_of: %w", e.ID, err)
		}
	}
	msg, err := e.canonicalBytes(true)
	if err != nil {
		return fmt.Errorf("entry %s: %w", e.ID, err)
	}
	sig, err := hex.DecodeString(e.Sig)
	if err != nil || !ed25519.Verify(pub, msg, sig) {
		return fmt.Errorf("entry %s: signature verification failed", e.ID)
	}
	return nil
}

func coreKind(k string) bool {
	switch k {
	case KindThread, KindMessage, KindMembership, KindDelegation, KindAccessRequest,
		KindGrant, KindDeny, KindRevoke, KindSummary, KindThreadCard, KindRedaction:
		return true
	}
	return false
}

// Less reports whether a orders before b in the protocol's total order:
// (lamport, author, id). Every conforming node sorts identically.
func Less(a, b *Entry) bool {
	if a.Lamport != b.Lamport {
		return a.Lamport < b.Lamport
	}
	if a.Author != b.Author {
		return a.Author < b.Author
	}
	return a.ID < b.ID
}
