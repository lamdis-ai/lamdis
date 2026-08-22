package api

import (
	"net/http"
	"strings"
	"testing"
)

// The page must call every route the flow depends on.
//
// This is a blunt test for a blunt failure. The work page uploaded a file,
// showed the worker a success screen, and never called /submit — so the file
// sat unclaimed on the server, no submission was ever created, nothing was
// verified, and nobody was ever paid. Every Go test passed throughout, because
// every Go test called the routes directly. The only broken part was the one
// thing no unit test looked at: whether the page asks for them.
//
// Checking a string in a template is crude. It is also the difference between
// shipping a marketplace and shipping a screen that says "Sent for checking".
func TestWorkPageCallsEveryRouteTheFlowNeeds(t *testing.T) {
	needed := []struct{ path, why string }{
		{"/evidence", "uploading the file"},
		{"/submit", "closing the submission — without it nobody is ever paid"},
	}
	for _, n := range needed {
		if !strings.Contains(workPageHTML, n.path) {
			t.Errorf("the work page never calls %s, which is what does %s", n.path, n.why)
		}
	}

	// A worker who is refused must be told why, standing where they can still
	// reshoot. A page that discards the reason turns a fixable rejection into
	// a wasted trip.
	if !strings.Contains(workPageHTML, "b.why") {
		t.Error("the page throws away the refusal reason the server sends")
	}
	if !strings.Contains(workPageHTML, "amount_minor") {
		t.Error("the page never shows what the worker earned")
	}
}

// Routes the page calls must exist on the server.
func TestWorkRoutesExist(t *testing.T) {
	mux := http.NewServeMux()
	(&WorkServer{}).Register(mux)
	for _, path := range []string{
		"/v1/work/job-1",
		"/v1/work/job-1/evidence",
		"/v1/work/job-1/submit",
	} {
		method := "POST"
		if !strings.Contains(path, "evidence") && !strings.Contains(path, "submit") {
			method = "GET"
		}
		req, _ := http.NewRequest(method, "https://exchange.test"+path, nil)
		if _, pattern := mux.Handler(req); pattern == "" {
			t.Errorf("%s %s is not mounted; the page calls it", method, path)
		}
	}
}
