package api

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// signedToken mints an RS256 identity token the way Cognito would.
func signedToken(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]any, alg string) string {
	t.Helper()
	enc := func(v any) string {
		b, _ := json.Marshal(v)
		return base64.RawURLEncoding.EncodeToString(b)
	}
	head := enc(map[string]any{"alg": alg, "kid": kid, "typ": "JWT"})
	body := enc(claims)
	sum := sha256.Sum256([]byte(head + "." + body))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	return head + "." + body + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func newCognito(t *testing.T) (*Cognito, *rsa.PrivateKey, map[string]any) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	c := NewCognito("us-east-1", "us-east-1_TESTPOOL", "test-client")
	c.HTTP = srv.Client()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{
			{"kid": "k1", "kty": "RSA", "n": n, "e": e},
		}})
	})
	// Point the verifier at the test server rather than AWS.
	c.issuerOverride = srv.URL

	claims := map[string]any{
		"sub": "abc-123", "iss": srv.URL, "aud": "test-client",
		"token_use": "id", "exp": time.Now().Add(time.Hour).Unix(),
		"email": "worker@example.com", "email_verified": true,
	}
	return c, key, claims
}

func TestValidTokenIsAccepted(t *testing.T) {
	c, key, claims := newCognito(t)
	got, err := c.Verify(signedToken(t, key, "k1", claims, "RS256"))
	if err != nil {
		t.Fatalf("a valid token was rejected: %v", err)
	}
	if got.Subject != "abc-123" || !got.EmailVerified {
		t.Fatalf("claims came back as %+v", got)
	}
}

// Every one of these has been somebody's production vulnerability.
func TestForgedTokensAreRejected(t *testing.T) {
	c, key, base := newCognito(t)

	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	copyOf := func(edit func(m map[string]any)) map[string]any {
		m := map[string]any{}
		for k, v := range base {
			m[k] = v
		}
		edit(m)
		return m
	}

	cases := map[string]string{
		"signed by another key": signedToken(t, other, "k1", base, "RS256"),
		"alg none":              signedToken(t, key, "k1", base, "none"),
		"alg HS256":             signedToken(t, key, "k1", base, "HS256"),
		"unknown kid":           signedToken(t, key, "k-forged", base, "RS256"),
		"expired":               signedToken(t, key, "k1", copyOf(func(m map[string]any) { m["exp"] = time.Now().Add(-time.Hour).Unix() }), "RS256"),
		"another pool":          signedToken(t, key, "k1", copyOf(func(m map[string]any) { m["iss"] = "https://evil.example" }), "RS256"),
		"another client":        signedToken(t, key, "k1", copyOf(func(m map[string]any) { m["aud"] = "someone-else" }), "RS256"),
		"an access token":       signedToken(t, key, "k1", copyOf(func(m map[string]any) { m["token_use"] = "access" }), "RS256"),
		"no subject":            signedToken(t, key, "k1", copyOf(func(m map[string]any) { m["sub"] = "" }), "RS256"),
		"not a token at all":    "garbage",
		"two segments":          "aaa.bbb",
	}
	for name, tok := range cases {
		if _, err := c.Verify(tok); err == nil {
			t.Fatalf("accepted a token that was %s", name)
		}
	}
}

// A tampered payload must not survive, even with a valid-looking signature.
func TestTamperedPayloadIsRejected(t *testing.T) {
	c, key, claims := newCognito(t)
	tok := signedToken(t, key, "k1", claims, "RS256")
	// Swap the payload for one claiming a different subject.
	forged := map[string]any{}
	for k, v := range claims {
		forged[k] = v
	}
	forged["sub"] = "somebody-else"
	b, _ := json.Marshal(forged)
	parts := []byte(tok)
	_ = parts
	swapped := tok[:len(tok)] // keep signature, replace body below
	head := swapped[:len(swapped)]
	_ = head

	// Rebuild header.newpayload.oldsignature
	origHead, origSig := "", ""
	seg := 0
	start := 0
	for i := 0; i <= len(tok); i++ {
		if i == len(tok) || tok[i] == '.' {
			switch seg {
			case 0:
				origHead = tok[start:i]
			case 2:
				origSig = tok[start:i]
			}
			seg++
			start = i + 1
		}
	}
	bad := origHead + "." + base64.RawURLEncoding.EncodeToString(b) + "." + origSig
	if _, err := c.Verify(bad); err == nil {
		t.Fatal("a token whose payload was swapped after signing was accepted")
	}
}

// With no pool configured nothing verifies, so local development cannot
// accidentally accept anything.
func TestDisabledCognitoAcceptsNothing(t *testing.T) {
	c := NewCognito("", "", "")
	if c.Enabled() {
		t.Fatal("an unconfigured verifier reported itself enabled")
	}
	if _, err := c.Verify("anything"); err == nil {
		t.Fatal("an unconfigured verifier accepted a token")
	}
}

// newTestIssuer stands in for Cognito: it publishes a key set and hands back a
// minter for tokens that verify against it.
func newTestIssuer(t *testing.T) (*Cognito, func(subject string) string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{
			{"kid": "k1", "kty": "RSA", "n": n, "e": e},
		}})
	})
	c := NewCognito("us-east-1", "us-east-1_TESTPOOL", "test-client")
	c.HTTP = srv.Client()
	c.issuerOverride = srv.URL
	return c, func(subject string) string {
		return signedToken(t, key, "k1", map[string]any{
			"sub": subject, "iss": srv.URL, "aud": "test-client",
			"token_use": "id", "exp": time.Now().Add(time.Hour).Unix(),
			"email": subject + "@example.com", "email_verified": true,
		}, "RS256")
	}
}
