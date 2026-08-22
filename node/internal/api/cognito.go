package api

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Cognito verifies the identity tokens a hosted user pool issues.
//
// This replaces what was here before, which was an unauthenticated endpoint
// that minted a bearer secret to anyone who asked. That is a UUID generator,
// not an identity: it gave no assurance that two workers were two people, and
// every rule that bounds abuse — one seat per panel, do not judge your own
// work, how much may be in flight — is only as good as the thing it keys on.
//
// A verified email is not proof of a person either. It is proof that somebody
// controls an address, which costs something to obtain at scale and can be
// revoked, and that is the honest bar: enough to make farming seats tedious
// rather than free. The thing that actually gates money is further along, at
// the payment rail, where an account has to pass KYC.
//
// Verification is local. Tokens are RS256-signed by keys published at a fixed
// URL, so checking one needs no call to AWS on the request path and the
// exchange keeps working through a Cognito outage for anyone already holding a
// token.
type Cognito struct {
	Region   string
	PoolID   string
	ClientID string

	HTTP *http.Client
	Now  func() time.Time

	// issuerOverride points verification at a stand-in during tests. It is
	// unexported, so a deployment cannot be pointed at an untrusted issuer.
	issuerOverride string

	mu      sync.RWMutex
	keys    map[string]*rsa.PublicKey
	fetched time.Time
}

// NewCognito builds a verifier. An empty pool id disables it, which is what
// makes local development possible without an AWS account.
func NewCognito(region, poolID, clientID string) *Cognito {
	return &Cognito{
		Region: region, PoolID: poolID, ClientID: clientID,
		HTTP: &http.Client{Timeout: 10 * time.Second},
		Now:  time.Now, keys: map[string]*rsa.PublicKey{},
	}
}

// Enabled reports whether tokens can be verified at all.
func (c *Cognito) Enabled() bool {
	return c != nil && c.PoolID != "" && c.Region != ""
}

func (c *Cognito) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}

func (c *Cognito) issuer() string {
	if c.issuerOverride != "" {
		return c.issuerOverride
	}
	return fmt.Sprintf("https://cognito-idp.%s.amazonaws.com/%s", c.Region, c.PoolID)
}

// Claims is the part of an identity token this exchange acts on.
type Claims struct {
	Subject       string
	Email         string
	EmailVerified bool
	Expires       time.Time
}

// ErrToken is the single answer to every token failure: expired, forged, for
// another pool, for another client. A caller learning which one it was learns
// something about what exists.
var ErrToken = fmt.Errorf("cognito: token rejected")

// Verify checks a Cognito identity token and returns what it asserts.
func (c *Cognito) Verify(token string) (*Claims, error) {
	if !c.Enabled() {
		return nil, ErrToken
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrToken
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, ErrToken
	}
	var header struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrToken
	}
	// Only RS256. Accepting the algorithm the token names is the classic JWT
	// hole: "none" and HMAC-with-the-public-key both live there.
	if header.Alg != "RS256" || header.Kid == "" {
		return nil, ErrToken
	}

	key, err := c.keyFor(header.Kid)
	if err != nil {
		return nil, ErrToken
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, ErrToken
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig); err != nil {
		return nil, ErrToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrToken
	}
	var body struct {
		Sub           string `json:"sub"`
		Iss           string `json:"iss"`
		Aud           string `json:"aud"`
		TokenUse      string `json:"token_use"`
		Exp           int64  `json:"exp"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return nil, ErrToken
	}
	// Every one of these has been a real vulnerability in somebody's code.
	if body.Iss != c.issuer() {
		return nil, ErrToken // a token from a pool we do not trust
	}
	if body.TokenUse != "id" {
		return nil, ErrToken // an access token is not an identity
	}
	if c.ClientID != "" && body.Aud != c.ClientID {
		return nil, ErrToken // issued for a different application
	}
	if body.Sub == "" || c.now().After(time.Unix(body.Exp, 0)) {
		return nil, ErrToken
	}
	return &Claims{
		Subject: body.Sub, Email: body.Email,
		EmailVerified: body.EmailVerified,
		Expires:       time.Unix(body.Exp, 0),
	}, nil
}

// keyFor returns the signing key, fetching the published set when it must.
func (c *Cognito) keyFor(kid string) (*rsa.PublicKey, error) {
	c.mu.RLock()
	k, ok := c.keys[kid]
	fresh := c.now().Sub(c.fetched) < time.Hour
	c.mu.RUnlock()
	if ok {
		return k, nil
	}
	if fresh {
		// An unknown kid with a recently fetched set means a forged header,
		// not a rotation. Refetching on every such token would let anyone make
		// the exchange hammer Cognito.
		return nil, ErrToken
	}
	if err := c.refresh(); err != nil {
		return nil, err
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	if k, ok := c.keys[kid]; ok {
		return k, nil
	}
	return nil, ErrToken
}

func (c *Cognito) refresh() error {
	resp, err := c.HTTP.Get(c.issuer() + "/.well-known/jwks.json")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("cognito: jwks returned %d", resp.StatusCode)
	}
	var set struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" {
			continue
		}
		nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil {
			continue
		}
		padded := make([]byte, 8)
		copy(padded[8-len(eBytes):], eBytes)
		keys[k.Kid] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(nBytes),
			E: int(binary.BigEndian.Uint64(padded)),
		}
	}
	if len(keys) == 0 {
		return fmt.Errorf("cognito: no usable keys published")
	}
	c.mu.Lock()
	c.keys = keys
	c.fetched = c.now()
	c.mu.Unlock()
	return nil
}
