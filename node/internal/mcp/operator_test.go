package mcp

import (
	"context"
	"sort"
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

func operatorToolNames(t *testing.T) []string {
	t.Helper()
	ctx := context.Background()
	serverT, clientT := sdk.NewInMemoryTransports()
	srv := sdk.NewServer(&sdk.Implementation{Name: "op-test", Version: "0"}, nil)
	RegisterOperator(srv, NewOperator("http://127.0.0.1:0", "tok"))
	go srv.Run(ctx, serverT) //nolint:errcheck

	client := sdk.NewClient(&sdk.Implementation{Name: "test-client", Version: "0"}, nil)
	sess, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer sess.Close()
	res, err := sess.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, tool := range res.Tools {
		names = append(names, tool.Name)
	}
	sort.Strings(names)
	return names
}

// The half of the exchange that had no agent surface at all.
func TestOperatorToolSurface(t *testing.T) {
	want := []string{
		"bid_whole_scope",
		"find_work",
		"give_back",
		"my_earnings",
		"my_work",
		"place_bid",
		"propose_stages",
		"read_job",
		"read_scope",
		"set_capacity",
		"take_job",
	}
	got := operatorToolNames(t)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("operator surface changed.\n got: %v\nwant: %v", got, want)
	}
}

// An operator's agent must not be able to do things only the operator can.
//
// The line: nothing here that a person could not do themselves on the board.
// An agent that could enrol its own identity, redirect where money lands, or
// submit the evidence it is judged by would be a way to farm the exchange
// rather than a way to work on it.
func TestOperatorToolsThatMustNotExist(t *testing.T) {
	forbidden := map[string]string{
		"submit_evidence": "an agent would manufacture the proof it is judged by",
		"set_payout":      "an agent would redirect where the money lands",
		"register_worker": "an agent would mint identities to get around the ceiling",
		"verify_licence":  "an agent would attest to its own qualifications",
		"vet_me":          "vetting is a person at the exchange, not a request",
		"raise_my_limit":  "the ceiling is earned by finishing work, not asked for",
		"accept_bid":      "an operator does not award their own bid",
	}
	have := map[string]bool{}
	for _, n := range operatorToolNames(t) {
		have[n] = true
	}
	for name, why := range forbidden {
		if have[name] {
			t.Errorf("%q is on the operator surface: %s", name, why)
		}
	}
}

// Anything that commits this operator's business should say so.
func TestCommittingToolsTellTheAgentToAsk(t *testing.T) {
	ctx := context.Background()
	serverT, clientT := sdk.NewInMemoryTransports()
	srv := sdk.NewServer(&sdk.Implementation{Name: "op-test", Version: "0"}, nil)
	RegisterOperator(srv, NewOperator("http://127.0.0.1:0", "tok"))
	go srv.Run(ctx, serverT) //nolint:errcheck
	client := sdk.NewClient(&sdk.Implementation{Name: "c", Version: "0"}, nil)
	sess, _ := client.Connect(ctx, clientT, nil)
	defer sess.Close()
	res, _ := sess.ListTools(ctx, nil)

	commits := map[string]bool{"place_bid": true, "take_job": true, "bid_whole_scope": true}
	for _, tool := range res.Tools {
		if !commits[tool.Name] {
			continue
		}
		d := strings.ToLower(tool.Description)
		if !strings.Contains(d, "them") && !strings.Contains(d, "ask") {
			t.Errorf("%s commits the operator's business without telling the agent "+
				"to check with them: %q", tool.Name, tool.Description)
		}
	}
}
