package sim

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
)

func sha256Of(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// hashOf stands in for a perceptual hash. A real one is computed from pixels
// so that a re-encode or a small crop lands within a few bits; here the same
// logical photo simply yields the same fingerprint, which is what the reuse
// check needs to be exercised.
func hashOf(s string) uint64 {
	sum := sha256.Sum256([]byte("phash:" + s))
	return binary.BigEndian.Uint64(sum[:8])
}
