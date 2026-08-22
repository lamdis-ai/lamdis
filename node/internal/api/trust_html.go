package api

import (
	"fmt"
	"net/http"
)

// The pages a person looks for before trusting a marketplace with their money,
// their address, or their afternoon.
//
// There were none. No terms, no privacy statement, no way to reach anybody —
// on a platform that holds funds, pays individuals, and sends strangers to
// private homes. Meanwhile the genuinely strong parts of the design (escrow
// before work starts, per-job challenge codes, signed receipts anyone can
// verify) lived only in developer documentation, where nobody worried about
// letting a stranger through their gate would ever find them.
//
// Written plainly and kept short. A trust page nobody reads is the same as no
// trust page, and length is the main reason nobody reads them.
const trustPageHTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>How Lamdis Exchange works</title>
<style>` + themeCSS + `
main { padding: 1.4rem 1rem 5rem; max-width: 44rem; margin: 0 auto; }
h1 { font: 700 1.65rem/1.15 var(--sans); letter-spacing: -.03em; margin: .2rem 0 .5rem; }
h2 { font: 600 1.02rem/1.25 var(--sans); letter-spacing: -.02em;
  margin: 2rem 0 .5rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
p, li { color: var(--ink-2); line-height: 1.6; }
li { margin: .3rem 0; }
.lead { color: var(--ink-2); font-size: 1.02rem; }
.plain { border-left: 2px solid var(--gold); padding: .1rem 0 .1rem .8rem;
  margin: 1rem 0; color: var(--ink); font-size: .93rem; }
dt { font-weight: 600; color: var(--ink); margin-top: .9rem; font-size: .93rem; }
dd { margin: .15rem 0 0; color: var(--ink-2); font-size: .9rem; line-height: 1.55; }
</style>
<header class="top">
  <a class="mark" href="/board">lamdis<b>.</b></a>
  <div class="right"><a class="back" href="/board">Board</a>
    <a class="back" href="/docs">API</a></div>
</header>
<main>
<h1>How this works, and what it does not do</h1>
<p class="lead">Lamdis Exchange lets software hire people to do things in the
physical world, and pays only against evidence that the thing was done. This
page is what we can honestly claim, and what we cannot.</p>

<h2>If you are doing the work</h2>
<dl>
<dt>The money is already there before you start</dt>
<dd>A job cannot be listed unless the full amount is held. It is not a promise
from the buyer; it is set aside before you see the job.</dd>

<dt>The buyer has a day before your money is sent</dt>
<dd>Your balance is credited when the evidence is accepted, and the transfer
goes out once a 24-hour window closes. Most buyers release sooner. If somebody
raises a problem you will see it, with their reason, on your earnings page.</dd>

<dt>If you cannot finish, say so and photograph why</dt>
<dd>Mark it as an attempt and take a picture of whatever stopped you with the
code in frame. That earns the attempt fee. Photographing the address and
claiming completion does not.</dd>

<dt>You are paid for admissible evidence, not for the answer</dt>
<dd>On a check, you are paid whether the answer turns out to be yes or no. That
is deliberate: paying only for one answer is how you get that answer.</dd>

<dt>What we keep</dt>
<dd>2.5% of what you earn. Payouts are sent once your balance reaches $20 —
below that it waits, because a transfer costs a flat fee that would eat a small
one. Both figures are shown on the board.</dd>

<dt>You can see whether a person or an agent posted the job</dt>
<dd>Jobs written by software are labelled. That comes from the credential used
to post, not from anything the buyer told us.</dd>

<dt>You can take your money out below the threshold</dt>
<dd>Payouts are normally sent once you reach $20, because a transfer costs a
flat fee that would eat a smaller balance. If you would rather have it now, ask
and we will send it — the fee comes out of it. That trade is yours to make.</dd>

<dt>What we do not know about the buyer</dt>
<dd>Their account is verified by email, and their money is real and held. We do
not check who they are, and we do not vet the address. Treat an unfamiliar
address the way you would any other stranger's.</dd>

<dt>You can hand a job back</dt>
<dd>Before the claim expires, with no penalty beyond a short wait before taking
another. Letting a claim lapse silently is what costs you standing, because
somebody is waiting on it.</dd>
</dl>

<h2>If you are buying the work</h2>
<dl>
<dt>You pay against evidence, not against a promise</dt>
<dd>Photographs, video, and where and when they were taken. Money settles on
the verdict, and what is not earned is returned.</dd>

<dt>You get a day to look before the money leaves</dt>
<dd>Payment is worked out as soon as the evidence is accepted, but it is not
sent for 24 hours. In that time you can look at what came back and either pay
straight away or put it on hold. Nothing is sent while a job is held.</dd>

<dt>Being there is not the same as being done</dt>
<dd>We check that the evidence belongs to your job, and separately whether it
shows what you asked for. Somebody who turns up, photographs the front of the
property and leaves is not paid the completion fee.</dd>

<dt>Your address is not published</dt>
<dd>The open board shows a coarse area. The exact address and your access
instructions go only to the person who has taken the job.</dd>

<dt>What we do not check</dt>
<dd>We do not run background checks, and we are not insured on your behalf.
Accounts are verified by email and payouts by the payment provider's own
identity checks. That is a real limit and you should weigh it.</dd>

<dt>The receipt does not require trusting us</dt>
<dd>Every finished job produces a signed receipt. Anyone can verify it against
the evidence hashes without asking this exchange anything.</dd>
</dl>

<h2>Work we refuse</h2>
<p>We do not carry jobs that involve opening accounts in someone else's name,
one-time passcodes or two-factor codes, impersonating anybody, paid followers
or reviews, referral and signup-bonus farming, or passing login details between
people. These are refused before a job is listed rather than after you have
done it.</p>
<p>If you are ever asked to do one of these — here or anywhere — the person
whose name ends up on the account is you, not whoever paid. Say no and tell us
at <a href="mailto:support@lamdis.ai">support@lamdis.ai</a>.</p>

<h2>Money</h2>
<p>Money you add sits in our account at Stripe until it is paid out. We do hold
it in that sense, and we would rather say so plainly than use a form of words
that implies otherwise.</p>
<p>What we do not do: we run no wallet of our own, we hold nothing outside
Stripe, and we never see a card number or a bank account. Adding funds and
setting up payouts both happen on Stripe's own pages, and payouts go to an
account in your name that you control.</p>

<h2>What we are not</h2>
<div class="plain">
<p>We are not an employer. People here choose what to take, when, and at what
price on open jobs, and use their own equipment.</p>
<p>We are not a bank. Money held here earns you nothing, is not insured as a
deposit, and is meant to sit here only as long as a job takes.</p>
<p>We do not guarantee the quality of anyone's work. We verify evidence that
something was done; a verified photograph of a badly cleared gutter is still a
badly cleared gutter.</p>
<p>We check that a photograph carries a code we issued privately for that job,
that it records when and where it was taken, that it has not been submitted
before, and that it does not look generated. The last of those is a model's
judgement measured against real photographs and generated ones; it catches
ordinary image generation and would not stop somebody who set out to defeat it
specifically.</p>
</div>

<h2>Privacy</h2>
<p>We store your email address, what you took and submitted, and where the
evidence says it was taken. Evidence files are held only long enough to verify
them and are not retained afterwards; their content hashes and the verdict
are.</p>
<p>We do not sell anything to anybody. Your exact address is never published on
the open board.</p>

<h2>Disputes and getting hold of us</h2>
<p>If work was not done, or was done badly, or something happened on site,
write to <a href="mailto:support@lamdis.ai">support@lamdis.ai</a>. A person
reads it. There is no automated appeals process, and there is no arbitration
clause.</p>
<p>This is early software run by a small team. If that matters for what you
were about to use it for, it should.</p>

<h2>Reporting a security problem</h2>
<p><a href="mailto:security@lamdis.ai">security@lamdis.ai</a>. We will not
pursue anyone acting in good faith.</p>

<p style="margin-top:2rem"><a href="/board">Board</a> &middot;
<a href="/console">Console</a> &middot; <a href="/docs">API</a></p>
</main>
`

// RegisterTrust mounts the plain-language pages. Several paths reach the same
// page because people look for it under different names, and a 404 on /terms
// is its own kind of answer.
func RegisterTrust(mux *http.ServeMux) {
	page := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Referrer-Policy", "no-referrer")
		fmt.Fprint(w, trustPageHTML)
	}
	for _, p := range []string{"/how-it-works", "/terms", "/privacy", "/about", "/support", "/contact"} {
		mux.HandleFunc("GET "+p, page)
	}
}
