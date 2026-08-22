package api

import (
	"testing"
	"time"
)

func TestReplayGuardRefusesASecondPresentation(t *testing.T) {
	g := NewReplayGuard(10 * time.Minute)
	if !g.Check("sig-a") {
		t.Fatal("the first presentation should be accepted")
	}
	if g.Check("sig-a") {
		t.Fatal("a captured request was accepted twice inside the window")
	}
	if !g.Check("sig-b") {
		t.Fatal("a different signature should be accepted")
	}
}

func TestReplayGuardForgetsOutsideTheWindow(t *testing.T) {
	now := time.Now()
	g := NewReplayGuard(10 * time.Minute)
	g.Now = func() time.Time { return now }

	if !g.Check("sig") {
		t.Fatal("first presentation refused")
	}
	// Past the window the signature is no longer replayable anyway, because
	// its own timestamp has aged out of the skew check.
	now = now.Add(11 * time.Minute)
	if !g.Check("sig") {
		t.Error("a signature outside the window should not be remembered")
	}
}

func TestReplayGuardDoesNotGrowWithoutBound(t *testing.T) {
	now := time.Now()
	g := NewReplayGuard(time.Minute)
	g.Now = func() time.Time { return now }

	for i := 0; i < 500; i++ {
		g.Check(string(rune('a'+i%26)) + time.Duration(i).String())
	}
	before := g.Size()
	now = now.Add(5 * time.Minute)
	g.Check("trigger-a-sweep")
	if g.Size() >= before {
		t.Errorf("expired records were not swept: %d before, %d after", before, g.Size())
	}
}

func TestReplayGuardRefusesEmptySignatures(t *testing.T) {
	if NewReplayGuard(time.Minute).Check("") {
		t.Error("an empty signature should never be accepted")
	}
}
