package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// The supply side, for agents.
//
// Every tool on the buyer surface sends work out. There was nothing at all
// pointing the other way, which meant the half of this exchange that is
// actually novel — your agent goes and finds you work — could only be reached
// by hand-signing HTTP requests. A person with a van and an assistant had no
// way in.
//
// These are the same routes the board's own pages call, so an operator's agent
// and an operator's browser see exactly the same exchange. Nothing here can be
// done by an agent that a person could not do themselves, which is the line
// that keeps this from becoming a way to farm the board.

// Operator calls the worker-facing routes as one signed-in operator.
type Operator struct {
	BaseURL string
	// Token is the operator's own session token. Per request, never shared:
	// two agents on the same endpoint are two different people.
	Token string
	HTTP  *http.Client
}

// NewOperator builds a client bound to one operator's credential.
func NewOperator(baseURL, token string) *Operator {
	return &Operator{BaseURL: strings.TrimRight(baseURL, "/"), Token: token,
		HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func (o *Operator) call(ctx context.Context, method, path string, in any) (map[string]any, error) {
	var body *strings.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return nil, err
		}
		body = strings.NewReader(string(b))
	} else {
		body = strings.NewReader("")
	}
	req, err := http.NewRequestWithContext(ctx, method, o.BaseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.Token)
	resp, err := o.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("the exchange returned something unreadable")
	}
	if resp.StatusCode >= 400 {
		msg, _ := out["error"].(string)
		if msg == "" {
			msg = resp.Status
		}
		return out, fmt.Errorf("%s", msg)
	}
	return out, nil
}

func opResult(out map[string]any, err error) (*sdk.CallToolResult, any, error) {
	if err != nil {
		return &sdk.CallToolResult{IsError: true, Content: []sdk.Content{
			&sdk.TextContent{Text: err.Error()},
		}}, nil, nil
	}
	b, _ := json.Marshal(out)
	return &sdk.CallToolResult{Content: []sdk.Content{
		&sdk.TextContent{Text: string(b)},
	}}, nil, nil
}

// RegisterOperator adds the supply-side tools.
func RegisterOperator(s *sdk.Server, o *Operator) {
	type none struct{}

	sdk.AddTool(s, &sdk.Tool{Name: "find_work",
		Description: "What is open right now that this operator could actually take, " +
			"already filtered to their range, their qualifications and what they " +
			"said they will do.\n\n" +
			"Read the whole entry before telling them about it. A job carries " +
			"photographs of the site, what would count as proof, and what the " +
			"buyer could not specify. A job with open questions cannot be bid " +
			"without answering them.\n\n" +
			"Jobs marked practice pay nothing and exist so somebody can learn the " +
			"flow. Do not present those as earnings."},
		func(ctx context.Context, req *sdk.CallToolRequest, _ none) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "GET", "/v1/board", nil))
		})

	type jobArg struct {
		Job string `json:"job" jsonschema:"the job id from find_work"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "take_job",
		Description: "Take a fixed-price job. It is theirs from this moment and the " +
			"clock starts.\n\n" +
			"Only take work they can actually get to and actually do. Taking a job " +
			"and letting it lapse costs the buyer a day and costs this operator " +
			"their standing, which is what governs how much work they are allowed " +
			"to hold. Check with them before taking anything, unless they have " +
			"told you what to take without asking."},
		func(ctx context.Context, req *sdk.CallToolRequest, a jobArg) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "POST", "/v1/workers/claim/"+a.Job, nil))
		})

	type assumptionArg struct {
		Name  string `json:"name" jsonschema:"the open question this answers, exactly as the job names it"`
		Value string `json:"value" jsonschema:"what you priced on, e.g. 12 feet"`
		Firm  bool   `json:"firm" jsonschema:"true if the price holds at that figure; false if they would measure and requote"`
		Note  string `json:"note,omitempty"`
	}
	type bidArgs struct {
		Job           string          `json:"job"`
		AmountMinor   int64           `json:"amount_minor" jsonschema:"what they would charge, all in, in minor units"`
		Note          string          `json:"note,omitempty" jsonschema:"how they would do it, in their words. Buyers pick on this as much as on price"`
		Assumptions   []assumptionArg `json:"assumptions,omitempty" jsonschema:"answers to whatever the job said it does not know"`
		AvailableFrom string          `json:"available_from,omitempty" jsonschema:"earliest date they could start, YYYY-MM-DD"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "place_bid",
		Description: "Offer a price on an open job.\n\n" +
			"Price it from what this operator has told you about their rates, their " +
			"travel and their equipment. Do not guess at a number they have not " +
			"given you a basis for — <b>show them the bid before you place it</b> " +
			"unless they have told you a range and to get on with it. This is their " +
			"business and their money.\n\n" +
			"Nobody tells you the buyer's budget and nobody shows you the other " +
			"bids. If the job lists open questions you must answer every one, and " +
			"say honestly whether the price holds at that figure: a provisional " +
			"answer is a real answer and is better than a firm number quietly " +
			"padded to survive being wrong."},
		func(ctx context.Context, req *sdk.CallToolRequest, a bidArgs) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "POST", "/v1/workers/bid/"+a.Job, map[string]any{
				"amount_minor": a.AmountMinor, "note": a.Note,
				"assumptions": a.Assumptions, "available_from": a.AvailableFrom,
			}))
		})

	sdk.AddTool(s, &sdk.Tool{Name: "my_work",
		Description: "What this operator is holding: which stage each job is on, what " +
			"the next stage pays, what is blocked waiting on other work, and the " +
			"figures they agreed when they bid.\n\n" +
			"Use it to tell them what is next and what it is worth. If a figure is " +
			"marked provisional they said they would measure and requote — remind " +
			"them to do that before the stage, not after."},
		func(ctx context.Context, req *sdk.CallToolRequest, _ none) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "GET", "/v1/workers/holdings", nil))
		})

	sdk.AddTool(s, &sdk.Tool{Name: "my_earnings",
		Description: "What this operator is owed, what is clear to send, what a buyer " +
			"has objected to, and how much more work they are allowed to hold.\n\n" +
			"That last figure rises as they finish jobs. If they are near it, the " +
			"answer to wanting bigger work is to finish what they have."},
		func(ctx context.Context, req *sdk.CallToolRequest, _ none) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "GET", "/v1/me", nil))
		})

	type capacityArgs struct {
		MaxConcurrent int      `json:"max_concurrent,omitempty" jsonschema:"how many jobs at once"`
		RangeMiles    int      `json:"range_miles,omitempty" jsonschema:"how far they will travel"`
		Accepting     *bool    `json:"accepting,omitempty" jsonschema:"false to finish what they hold and stop"`
		Kinds         []string `json:"kinds,omitempty" jsonschema:"observe, do, or both"`
		Skills        []string `json:"skills,omitempty" jsonschema:"what they are qualified for"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "set_capacity",
		Description: "Record what this operator will take, how much at once, and how " +
			"far they will go. The exchange only ever offers them work inside these " +
			"limits.\n\n" +
			"Set it from what they told you in their own words — \"I'm in Detroit, " +
			"I have a truck and a ladder, I'll go twenty miles\" is enough. Claiming " +
			"a qualification they do not hold is not a preference, it is a lie that " +
			"carries their name onto the job."},
		func(ctx context.Context, req *sdk.CallToolRequest, a capacityArgs) (*sdk.CallToolResult, any, error) {
			body := map[string]any{}
			if a.MaxConcurrent > 0 {
				body["max_concurrent"] = a.MaxConcurrent
			}
			if a.RangeMiles > 0 {
				body["range_miles"] = a.RangeMiles
			}
			if a.Accepting != nil {
				body["accepting"] = *a.Accepting
			}
			if len(a.Kinds) > 0 {
				body["kinds"] = a.Kinds
			}
			if len(a.Skills) > 0 {
				body["skills"] = a.Skills
			}
			return opResult(o.call(ctx, "PUT", "/v1/capacity", body))
		})

	type scopeArg struct {
		Project string `json:"project" jsonschema:"the project id carried on any job that is part of one"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "read_scope",
		Description: "A multi-part job in full: every piece, in the order it has to " +
			"happen, and what is waiting on what.\n\n" +
			"Worth reading before pricing any single piece. Several jobs at one " +
			"address is one trip, and arriving once is most of the cost of a small " +
			"job — pricing them as if they were strangers is how an operator either " +
			"loses the work or wins it at a loss."},
		func(ctx context.Context, req *sdk.CallToolRequest, a scopeArg) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "GET", "/v1/scope/"+a.Project, nil))
		})

	type lineArg struct {
		Job         string `json:"job"`
		AmountMinor int64  `json:"amount_minor"`
		Note        string `json:"note,omitempty" jsonschema:"why this piece costs what it does, e.g. carries the mobilisation for all three"`
	}
	type scopeBidArgs struct {
		Project      string          `json:"project"`
		Lines        []lineArg       `json:"lines" jsonschema:"a price for each piece of the scope"`
		Note         string          `json:"note,omitempty" jsonschema:"how they would sequence it"`
		Assumptions  []assumptionArg `json:"assumptions,omitempty"`
		AllOrNothing *bool           `json:"all_or_nothing,omitempty" jsonschema:"defaults true. Leave it true unless they say otherwise: winning two pieces of three they priced as one trip is worse than winning none"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "bid_whole_scope",
		Description: "One offer covering every piece of a multi-part job, priced per " +
			"piece and awarded together or not at all.\n\n" +
			"Usually the right way to bid when the pieces share a site. Show them " +
			"the total before you send it."},
		func(ctx context.Context, req *sdk.CallToolRequest, a scopeBidArgs) (*sdk.CallToolResult, any, error) {
			body := map[string]any{"lines": a.Lines, "note": a.Note,
				"assumptions": a.Assumptions}
			if a.AllOrNothing != nil {
				body["all_or_nothing"] = *a.AllOrNothing
			}
			return opResult(o.call(ctx, "POST", "/v1/scope/"+a.Project+"/bid", body))
		})

	type stageArg struct {
		Name        string `json:"name"`
		Deliverable string `json:"deliverable" jsonschema:"what would prove this piece specifically is done"`
		PayMinor    int64  `json:"pay_minor"`
		Materials   bool   `json:"materials,omitempty" jsonschema:"true when this is reimbursement for supplies, paid against a receipt"`
	}
	type planArgs struct {
		Job    string     `json:"job"`
		Stages []stageArg `json:"stages" jsonschema:"the breakdown; the amounts must add up to the price they were awarded"`
	}
	sdk.AddTool(s, &sdk.Tool{Name: "propose_stages",
		Description: "On a job whose winner writes the schedule, propose how it breaks " +
			"down and what each piece is worth. The buyer accepts it before work " +
			"starts, and each stage is paid as its own evidence is accepted.\n\n" +
			"This is the operator's expertise, not the buyer's — write it from what " +
			"they tell you about how the trade actually sequences. The total cannot " +
			"change: that was settled when their bid was accepted."},
		func(ctx context.Context, req *sdk.CallToolRequest, a planArgs) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "POST", "/v1/workers/plan/"+a.Job,
				map[string]any{"stages": a.Stages}))
		})

	sdk.AddTool(s, &sdk.Tool{Name: "give_back",
		Description: "Hand a job back that this operator cannot do after all.\n\n" +
			"Better than letting it lapse. A job given back goes to somebody else " +
			"the same day; a job abandoned silently leaves a buyer waiting and " +
			"lowers how much this operator is allowed to hold."},
		func(ctx context.Context, req *sdk.CallToolRequest, a jobArg) (*sdk.CallToolResult, any, error) {
			return opResult(o.call(ctx, "POST", "/v1/workers/giveback/"+a.Job, nil))
		})
}
