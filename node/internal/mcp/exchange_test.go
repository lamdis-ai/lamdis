package mcp

import (
	"context"
	"sort"
	"strings"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// What an agent can and cannot do, as a list somebody has to edit on purpose.
//
// The exchange surface had no test of its own shape. Four tools were added to
// it in one sitting, two of which commit money — accept_project_bid commits an
// entire scope at once — and nothing anywhere would have noticed. A registry
// snapshot makes adding a tool a diff that has to be justified rather than a
// line that slips through with a feature.
func exchangeToolNames(t *testing.T) []string {
	t.Helper()
	ctx := context.Background()
	serverT, clientT := sdk.NewInMemoryTransports()
	srv := sdk.NewServer(&sdk.Implementation{Name: "exchange-test", Version: "0"}, nil)
	RegisterExchange(srv, NewExchange("http://127.0.0.1:0", ""))
	go srv.Run(ctx, serverT) //nolint:errcheck — ends when the client disconnects

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

func TestExchangeToolSurface(t *testing.T) {
	want := []string{
		"accept_bid",
		"accept_project_bid",
		"cancel_job",
		"check_feasible",
		"decide_stage_plan",
		"do_in_world",
		"exchange_balance",
		"find_out",
		"job_evidence",
		"job_receipt",
		"job_status",
		"list_bids",
		"list_project_bids",
		"list_sites",
		"list_vendors",
		"observe_world",
		"open_project",
		"project_status",
		"read_stage_plan",
		"request_quotes",
		"sweep_sites",
	}
	got := exchangeToolNames(t)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("the exchange tool surface changed.\n got: %v\nwant: %v\n\n"+
			"Adding a tool here widens what an agent may do without asking. "+
			"If the change is intended, edit this list and say why in the commit.",
			got, want)
	}
}

// The tools that must never exist, and why each one is dangerous.
//
// Absence is the security property, so it is asserted directly. A tool that
// merely is not registered today is one refactor away from being registered
// tomorrow, and nothing about the codebase would object.
func TestExchangeToolsThatMustNotExist(t *testing.T) {
	forbidden := map[string]string{
		"mandate_create":    "an agent would grant itself permission to spend",
		"mandate_increase":  "an agent would raise its own ceiling",
		"payout_set":        "an agent would redirect where money lands",
		"provider_register": "an agent would enrol itself as the supplier it then pays",
		"submit_evidence":   "an agent would manufacture the proof it is judged by",
		"evidence_submit":   "as above, under the other obvious name",
		"settle_job":        "an agent would declare itself paid",
		"outcome_settle":    "as above, under the other obvious name",
		"resolve_dispute":   "an agent would rule on its own dispute",
		"propose_stages":    "the buyer's agent would write the supplier's schedule, which is the reversal this feature exists to undo",
		"award_to_self":     "self-dealing, named plainly",
	}
	have := map[string]bool{}
	for _, n := range exchangeToolNames(t) {
		have[n] = true
	}
	for name, why := range forbidden {
		if have[name] {
			t.Errorf("%q is registered on the exchange surface: %s", name, why)
		}
	}
}

// Committing money should read like committing money. A tool that awards a
// whole scope and describes itself in the same register as one that reads a
// balance is how an agent talks a person into a decision they did not follow.
func TestMoneyToolsSayTheyCommitMoney(t *testing.T) {
	ctx := context.Background()
	serverT, clientT := sdk.NewInMemoryTransports()
	srv := sdk.NewServer(&sdk.Implementation{Name: "exchange-test", Version: "0"}, nil)
	RegisterExchange(srv, NewExchange("http://127.0.0.1:0", ""))
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
	// These accept an offer and move real money.
	commits := map[string]bool{"accept_bid": true, "accept_project_bid": true}
	for _, tool := range res.Tools {
		if !commits[tool.Name] {
			continue
		}
		d := strings.ToLower(tool.Description)
		if !strings.Contains(d, "human") {
			t.Errorf("%s commits money and its description never mentions "+
				"checking with a person: %q", tool.Name, tool.Description)
		}
	}
}
