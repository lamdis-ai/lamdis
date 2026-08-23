package exchange

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
)

// The landing page says we cap how sure any answer claims to be "and say so on
// the receipt". The cap was real; the receipt said nothing about it, and the
// one thing it did say — a tier field carrying the tier the buyer asked for —
// read as a stronger claim than anything the evidence could support.
//
// This test exists so that sentence stays true.
func TestReceiptStatesItsOwnCeiling(t *testing.T) {
	l := &api.Listing{
		Job: "do-1", Kind: api.KindDo, Title: "Cut the front lawn",
		Where: "812 Marlow Street", Tier: "V2", RadiusM: 120,
	}
	subs := []api.Submission{{
		Job: "do-1", Verified: true, Tier: "V2",
		SiteMark: &api.SiteMark{Text: "812", Derived: true},
		MarkSeen: true,
		Artifacts: []api.Artifact{{
			SHA256: "abc", HasGeo: true, LatE7: 423314000, LonE7: -830458000,
		}},
	}}
	v := verificationBlock(l, subs)

	ceiling, ok := v["confidence_ceiling"].(float64)
	if !ok {
		t.Fatal("the receipt states no ceiling at all")
	}
	if ceiling <= 0 || ceiling >= 1 {
		t.Fatalf("ceiling %v is not a probability short of certainty", ceiling)
	}
	// The number must reflect that capture is unattested. If somebody restores
	// the tier ladder without restoring hardware attestation, this fails.
	if ceiling > 0.85 {
		t.Errorf("the receipt claims %v, above what unattested capture supports", ceiling)
	}
	if v["ceiling_because"] == "" {
		t.Error("the ceiling is stated without saying why")
	}

	// A receipt that lists only what it proved is an advertisement.
	limits, _ := v["limits"].([]string)
	if len(limits) == 0 {
		t.Fatal("the receipt names no limits")
	}
	joined := strings.ToLower(strings.Join(limits, " "))
	for _, must := range []string{"fabrication", "metadata", "done well"} {
		if !strings.Contains(joined, must) {
			t.Errorf("the receipt does not disclose %q: %v", must, limits)
		}
	}
	if est, _ := v["established"].([]string); len(est) == 0 {
		t.Error("the receipt says nothing about what it did establish")
	}

	// And it has to survive being serialized, since that is how anybody reads it.
	if _, err := json.Marshal(v); err != nil {
		t.Fatalf("the verification block does not serialize: %v", err)
	}
}

// Work at an address with nothing identifying it in frame proves the job was
// done somewhere. The receipt has to say so rather than implying otherwise.
func TestReceiptAdmitsWhenNothingTiesItToThePlace(t *testing.T) {
	l := &api.Listing{
		Job: "do-2", Kind: api.KindDo, Title: "Cut the front lawn",
		Where: "812 Marlow Street", Tier: "V1",
	}
	subs := []api.Submission{{Job: "do-2", Verified: true, Tier: "V1"}}
	v := verificationBlock(l, subs)
	limits, _ := v["limits"].([]string)
	joined := strings.ToLower(strings.Join(limits, " "))
	if !strings.Contains(joined, "somewhere") {
		t.Errorf("a receipt with no site mark does not admit the gap: %v", limits)
	}
	// And it must not be quietly claiming more for having a tier.
	if c, _ := v["confidence_ceiling"].(float64); c > 0.72 {
		t.Errorf("no capture metadata and no mark, yet the ceiling is %v", c)
	}
}
