package log

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base32"
	"fmt"
	"strings"
)

// Principal ids are "ed25519:" + Crockford base32 (no padding, uppercase) of
// the 32-byte public key: 52 characters of encoding.
const principalPrefix = "ed25519:"

var crockford = base32.NewEncoding("0123456789ABCDEFGHJKMNPQRSTVWXYZ").WithPadding(base32.NoPadding)

// GenerateKeypair creates a new principal keypair.
func GenerateKeypair() (string, ed25519.PrivateKey, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", nil, err
	}
	pid, err := PrincipalID(pub)
	if err != nil {
		return "", nil, err
	}
	return pid, priv, nil
}

// PrincipalID encodes a public key as a principal id.
func PrincipalID(pub ed25519.PublicKey) (string, error) {
	if len(pub) != ed25519.PublicKeySize {
		return "", fmt.Errorf("invalid public key length %d", len(pub))
	}
	return principalPrefix + crockford.EncodeToString(pub), nil
}

// PublicKey decodes a principal id back to its public key. Case-insensitive
// in the encoded portion, per Crockford base32.
func PublicKey(pid string) (ed25519.PublicKey, error) {
	enc, ok := strings.CutPrefix(pid, principalPrefix)
	if !ok {
		return nil, fmt.Errorf("principal id %q: missing %q prefix", pid, principalPrefix)
	}
	raw, err := crockford.DecodeString(strings.ToUpper(enc))
	if err != nil {
		return nil, fmt.Errorf("principal id %q: %w", pid, err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("principal id %q: decoded to %d bytes, want %d", pid, len(raw), ed25519.PublicKeySize)
	}
	return ed25519.PublicKey(raw), nil
}
