package api

import "testing"

// The listings researchers actually found being bought, and ordinary work that
// must keep going through.
//
// Taken from the published analysis of the first marketplace of this shape:
// fake accounts at $12-15, impersonation at $60/hour, a two-factor bypass
// request that drew 79 applicants, engagement farming across 500 workers, and
// referral fraud paired with real identity checks.
func TestTheAbuseThatKilledTheFirstMarketplaceIsRefused(t *testing.T) {
	abusive := []struct{ what, text string }{
		{"fake account creation",
			"Create a Gmail account and send me the login details"},
		{"account opening at a bank",
			"Open a bank account in your name and share the credentials"},
		{"one-time passcode",
			"I will send a verification code to your phone, read it back to me"},
		{"two-factor bypass",
			"Help me get past the 2FA on an account I own"},
		{"interview impersonation",
			"Pose as me for a 45 minute technical interview over video"},
		{"acting as an employee",
			"Act as my employee on a call with a supplier"},
		{"engagement farming",
			"Follow this account and like the top three posts"},
		{"paid reviews",
			"Leave a five star review on this product listing"},
		{"referral fraud",
			"Sign up with my referral link and complete the identity check"},
		{"credential sharing",
			"Log in with my password and download the file"},
	}
	for _, c := range abusive {
		if r := Screen(c.text); r == nil {
			t.Errorf("%s was accepted: %q", c.what, c.text)
		} else if r.Review {
			t.Errorf("%s was only held for review, not refused: %q", c.what, c.text)
		}
	}
}

// False positives are the whole cost of this mechanism. Ordinary physical work
// has to keep listing.
func TestOrdinaryWorkIsNotRefused(t *testing.T) {
	fine := []string{
		"Photograph the loading dock on the north side and confirm it is clear",
		"Wheel both bins from the kerb through the side gate and latch it",
		"Clear the gutter run along the north face and bag what comes out",
		"Collect the parcel held for Marsh at the trade counter and leave it " +
			"with the front desk",
		"Replace the condenser fan motor on the rooftop unit and photograph " +
			"the nameplate",
		"Check whether the FOR LEASE sign is still displayed at the address",
		"Take a photo of the water meter reading in the basement",
		"Confirm the skip has been collected from the driveway",
		"Count how many parking spaces are free in the visitor lot",
		"Read the gas meter and photograph the dials",
	}
	for _, s := range fine {
		if r := Screen(s); r != nil {
			t.Errorf("ordinary work refused as %s: %q", r.Class, s)
		}
	}
}

// Where an honest reading exists, hold it for a person rather than refusing.
func TestAmbiguousWorkIsHeldNotRefused(t *testing.T) {
	r := Screen("Message me on WhatsApp when you arrive")
	if r == nil {
		t.Fatal("moving contact off the exchange was not noticed at all")
	}
	if !r.Review {
		t.Error("off-platform contact was refused outright; there are honest " +
			"reasons to want a phone number on the day")
	}
}

// The shape, not the wording: many people, very little each.
func TestMassLowValueIsHeld(t *testing.T) {
	if r := MassLowValue(500, 100); r == nil {
		t.Error("500 people at one dollar each listed without review")
	} else if !r.Review {
		t.Error("a shape that has honest instances was refused outright")
	}
	// Real work at ordinary shapes is untouched.
	if r := MassLowValue(1, 24000); r != nil {
		t.Errorf("a single well-paid job was flagged: %s", r.Why)
	}
	if r := MassLowValue(3, 1200); r != nil {
		t.Errorf("three people at twelve dollars each was flagged: %s", r.Why)
	}
}

// Screening reads everything, because the interesting part is rarely in the
// title.
func TestScreeningReadsTheInstructionsNotJustTheTitle(t *testing.T) {
	r := Screen(
		"Quick errand near the station",
		"about ten minutes",
		"Create a Gmail account for me and send over the password")
	if r == nil {
		t.Fatal("an innocuous title hid the instructions from screening")
	}
	if r.Class != "account-creation" {
		t.Errorf("matched %s", r.Class)
	}
}
