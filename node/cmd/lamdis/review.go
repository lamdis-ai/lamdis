package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/lamdis-ai/lamdis-protocol/node/internal/api"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/evidence"
	"github.com/lamdis-ai/lamdis-protocol/node/internal/outcome"
)

// cmdReview serves a human-review panel over HTTP and waits for people to
// answer it.
//
// This is the surface that was missing: the escalation machinery could model a
// panel and settle against its finding, but nobody could actually look at
// anything. Here a link goes to a phone, a person sees the photograph and the
// question, and their answer becomes the finding the parent outcome settles on.
func cmdReview(args []string) error {
	fs := flag.NewFlagSet("review", flag.ContinueOnError)
	image := fs.String("image", "", "the photograph reviewers must look at (required)")
	question := fs.String("question", "", "what reviewers are being asked (required)")
	context_ := fs.String("context", "Automated verification could not decide either way.",
		"what reviewers should know")
	reviewers := fs.Int("reviewers", 3, "how many people must answer")
	agreement := fs.Int("agreement", 2, "how many must agree for the answer to stand")
	fee := fs.Int64("fee", 150, "minor units paid per admissible review")
	bonus := fs.Int64("bonus", 100, "minor units paid additionally to the agreeing majority")
	addr := fs.String("addr", ":8421", "address to serve on")
	ttl := fs.Duration("ttl", 2*time.Hour, "how long the links stay valid")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *image == "" || *question == "" {
		return fmt.Errorf("review: -image and -question are both required")
	}

	data, art, err := evidence.LoadJPEG(*image)
	if err != nil {
		return fmt.Errorf("reading %s: %w", *image, err)
	}
	ex, _ := evidence.ParseEXIF(data)

	// The panel is a child outcome in its own right, so it gets a thread-ish
	// id of its own even in this standalone form.
	job := fmt.Sprintf("panel-%d", time.Now().UnixNano())

	spec := outcome.Escalation{
		Parent: "(standalone)", Question: *question,
		Reviewers: *reviewers, Agreement: *agreement,
		FeeMinor: *fee, BonusMinor: *bonus, Currency: "USD",
	}
	if err := spec.Validate(); err != nil {
		return err
	}
	terms, err := spec.Terms(
		"ed25519:"+repeat("A", 52), "ed25519:"+repeat("B", 52),
		"ed25519:"+repeat("C", 52), "ed25519:"+repeat("D", 52), 500)
	if err != nil {
		return fmt.Errorf("building panel terms: %w", err)
	}
	escrow, err := outcome.MaxPayout(terms)
	if err != nil {
		return err
	}

	caps := api.NewCapabilities()
	reviews := api.NewReviewStore()
	reviews.Add(&api.ReviewPanel{
		Job: job, Parent: "(standalone)",
		Question: *question, Context: *context_,
		EvidenceSHA: []string{art.SHA256},
		Reviewers:   *reviewers, Agreement: *agreement,
		FeeMinor: *fee, BonusMinor: *bonus, Currency: "USD",
		Expires: time.Now().Add(*ttl),
	})

	// One link per reviewer. Each is a separate secret, so one reviewer cannot
	// answer twice by reusing another's link.
	secrets := make([]string, 0, *reviewers)
	for i := 0; i < *reviewers; i++ {
		secret, _, err := caps.Issue(job, *question,
			[]string{api.ActionView, api.ActionReview}, *ttl)
		if err != nil {
			return err
		}
		secrets = append(secrets, secret)
	}

	srv := &api.ReviewServer{
		Caps: caps, Reviews: reviews, Replay: api.NewReplayGuard(10 * time.Minute),
		Secrets: func(j string) []string {
			if j == job {
				return secrets
			}
			return nil
		},
		Blob: func(sha string) ([]byte, string, bool) {
			if sha != art.SHA256 {
				return nil, "", false
			}
			return data, "image/jpeg", true
		},
	}
	mux := http.NewServeMux()
	srv.Register(mux)

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		return fmt.Errorf("listening on %s: %w", *addr, err)
	}
	defer ln.Close()
	go http.Serve(ln, mux)

	host := lanAddress()
	port := ln.Addr().(*net.TCPAddr).Port

	fmt.Println()
	title("Human review panel")
	fmt.Printf("  %-14s %s\n", "question", *question)
	fmt.Printf("  %-14s %s (%d×%d)\n", "evidence", filepath.Base(*image), art.Width, art.Height)
	fmt.Printf("  %-14s %s\n", "provenance", ex.Summary())
	fmt.Printf("  %-14s %d reviewers, %d must agree\n", "panel", *reviewers, *agreement)
	fmt.Printf("  %-14s %s per review, +%s to the agreeing majority\n", "pay",
		money(*fee), money(*bonus))
	fmt.Printf("  %-14s %s held to cover a full panel\n", "escrow", money(escrow))
	fmt.Println()
	fmt.Printf("  %s\n", dim("Open one link per reviewer. The code after # never reaches the server."))
	for i, secret := range secrets {
		fmt.Printf("  reviewer %d     http://%s:%d/r/%s#%s\n", i+1, host, port, job, secret)
	}
	fmt.Println()
	fmt.Printf("  %s\n", dim("Waiting for reviews. Ctrl-C to stop."))
	fmt.Println()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	seen := 0
	for {
		select {
		case <-ctx.Done():
			fmt.Println()
			return reportPanel(reviews.Tally(job), spec, terms, escrow)
		case <-time.After(time.Second):
			t := reviews.Tally(job)
			for _, r := range t.Reviews[seen:] {
				answer := "cannot tell"
				if r.Confident {
					answer = map[bool]string{true: "YES", false: "NO"}[r.Finding]
				}
				fmt.Printf("  %-14s %-11s %s\n", "review in", answer, truncateStr(r.Reason, 52))
			}
			seen = len(t.Reviews)
			if t.Complete {
				fmt.Println()
				return reportPanel(t, spec, terms, escrow)
			}
		}
	}
}

// reportPanel prints the tally and settles the panel's own contract.
func reportPanel(t api.Tally, spec outcome.Escalation, terms *outcome.Terms, escrow int64) error {
	title("Panel result")
	fmt.Printf("  %-14s %d admissible · %d yes · %d no · %d could not tell\n", "reviews",
		t.Admissible, t.Yes, t.No, t.Unsure)
	fmt.Printf("  %-14s %d agreeing, %d required\n", "agreement", t.Agreeing, spec.Agreement)

	got, err := outcome.Evaluate(terms,
		outcome.Reviewed(t.Admissible, t.Agreeing, t.Finding), escrow)
	if err != nil {
		return fmt.Errorf("settling the panel: %w", err)
	}
	fmt.Println()
	fmt.Printf("  %-14s %s escrowed → %s to reviewers · %s fee · %s refunded\n", "panel money",
		money(escrow), money(got.ProviderNet), money(got.FeeMinor), money(got.RefundMinor))
	if sum := got.ProviderNet + got.FeeMinor + got.RefundMinor; sum != escrow {
		return fmt.Errorf("panel settlement does not conserve escrow: %d vs %d", sum, escrow)
	}
	fmt.Printf("  %-14s ✓\n", "conserves")

	fmt.Println()
	switch {
	case !t.Decided:
		fmt.Printf("  %-14s the panel did not reach %d agreements\n", "finding", spec.Agreement)
		fmt.Printf("  %-14s %s\n", "parent", "not certified — the original provider keeps only the base fee")
	case t.Finding:
		fmt.Printf("  %-14s YES, %d of %d agreeing\n", "finding", t.Agreeing, t.Admissible)
		fmt.Printf("  %-14s %s\n", "parent", "certified — the original provider is paid in full")
	default:
		fmt.Printf("  %-14s NO, %d of %d agreeing\n", "finding", t.Agreeing, t.Admissible)
		fmt.Printf("  %-14s %s\n", "parent", "not certified — escrow returns to the buyer")
	}
	fmt.Println()
	return nil
}

// lanAddress finds an address a phone on the same network can reach.
func lanAddress() string {
	conn, err := net.Dial("udp", "192.168.1.1:80")
	if err != nil {
		return "localhost"
	}
	defer conn.Close()
	if a, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return a.IP.String()
	}
	return "localhost"
}

func money(minor int64) string {
	sign := ""
	if minor < 0 {
		sign, minor = "-", -minor
	}
	return fmt.Sprintf("%s$%d.%02d", sign, minor/100, minor%100)
}

func repeat(s string, n int) string {
	out := make([]byte, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, s[0])
	}
	return string(out)
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
