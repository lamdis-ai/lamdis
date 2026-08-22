package api

import "testing"

// Removing the address from the board is undone if the agent also wrote it
// into the title, which the board must publish.
func TestAddressRepeatedInTheTitleIsCaught(t *testing.T) {
	cases := []struct {
		title, where string
		want         bool
		why          string
	}{
		{"A FOR LEASE sign is displayed at 742 Evergreen Rd",
			"742 Evergreen Rd, Springfield", true,
			"the same address in both fields is the mistake agents make"},
		{"The bins are back behind the side gate", "812 Marlow Street", false,
			"a title that describes the outcome gives nothing away"},
		{"Clear the gutter at 812 Marlow Street", "812 Marlow Street", true,
			"street number and name together identify the property"},
		{"The loading dock on the north side is unobstructed", "1400 Industrial Way",
			false, "no address in the title"},
		{"Check the sign", "", false, "no address to leak"},
		{"", "812 Marlow Street", false, "no title"},
		// A street name alone does not identify a property, and refusing on it
		// would flag half the legitimate titles in a small town.
		{"Something on Marlow Street", "812 Marlow Street", false,
			"a street name without a number is not an address"},
	}
	for _, c := range cases {
		if got := AddressInTitle(c.title, c.where); got != c.want {
			t.Errorf("AddressInTitle(%q, %q) = %v, wanted %v — %s",
				c.title, c.where, got, c.want, c.why)
		}
	}
}
