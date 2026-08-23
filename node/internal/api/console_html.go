package api

// consolePageHTML is where an operator finds out where they stand: what they
// have earned, what is holding it up, what they have agreed to take, and the
// credentials a fleet or business uses to take work over the API.
//
// Everything here is wired to a real endpoint. A settings page whose controls
// do not reach the dispatcher is worse than no settings page, because the
// operator believes they are protected and finds work in their queue anyway.
var consolePageHTML = consoleTop + themeCSS + consoleBody + workerJS + consoleScript

const consoleTop = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Account — Lamdis</title>
<style>`

const consoleBody = `
.panes { display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule);
         border-radius: 3px; overflow: hidden; }
@media (min-width: 50rem) { .panes { grid-template-columns: 1fr 1fr; } }
.pane { background: var(--bg); padding: 1.05rem 1rem; }
.pane h3 { margin: 0 0 .2rem; font: 600 .95rem/1.3 var(--sans); }
.pane p.why { margin: 0 0 .85rem; color: var(--ink-3); font-size: .82rem; }

.ctl { display: flex; align-items: center; gap: .7rem; margin-bottom: .5rem; }
.ctl input[type=range] { flex: 1; accent-color: var(--gold); }
.ctl .v { font: 600 .92rem/1 var(--mono); min-width: 3.6rem; text-align: right; }

.toggle { display: flex; align-items: center; justify-content: space-between;
          gap: 1rem; padding: .6rem 0; border-top: 1px solid var(--rule); }
.toggle .tx { font-size: .87rem; }
.toggle .sx { margin-top: .12rem; font-size: .78rem; color: var(--ink-3); }
.sw { position: relative; width: 2.3rem; height: 1.3rem; flex: none; cursor: pointer;
      border-radius: 999px; border: 1px solid var(--rule-2); background: var(--panel-2); }
.sw::after { content: ""; position: absolute; top: 2px; left: 2px;
  width: .95rem; height: .95rem; border-radius: 50%; background: var(--ink-3);
  transition: transform .16s, background .16s; }
.sw[aria-pressed="true"] { background: #133020; border-color: #1C4530; }
.sw[aria-pressed="true"]::after { transform: translateX(.98rem); background: var(--green); }
.sw:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.kinds { display: flex; flex-wrap: wrap; gap: .4rem; }
.kind { padding: .3rem .6rem; border-radius: 2px; cursor: pointer; font-size: .8rem;
        border: 1px solid var(--rule-2); background: none; color: var(--ink-3); }
.kind[aria-pressed="true"] { color: var(--ink); border-color: var(--gold); background: #1A1408; }

.keyline { display: flex; align-items: center; gap: .6rem; padding: .6rem .8rem;
  border: 1px solid var(--rule); border-radius: 3px; background: var(--panel);
  font: 500 .82rem/1 var(--mono); color: var(--ink-2); }
.setup { margin: .7rem 0 0; padding: .85rem .9rem; border: 1px solid var(--rule);
  border-radius: 4px; background: var(--panel); }
.setup .bar { height: 2px; background: var(--rule); border-radius: 2px;
  overflow: hidden; margin-bottom: .7rem; }
.setup .bar span { display: block; height: 100%; width: 35%; background: var(--gold);
  animation: slide 1.4s ease-in-out infinite; }
@keyframes slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(340%); }
}
@media (prefers-reduced-motion: reduce) {
  .setup .bar span { animation: none; width: 100%; opacity: .5; }
}
.setup-step { font: 600 .9rem/1.35 var(--sans); color: var(--ink); }
.setup-note { margin-top: .2rem; font-size: .82rem; color: var(--ink-3); }
.setup-clock { margin-top: .45rem; font: 500 .74rem/1 var(--mono); color: var(--ink-3);
  font-variant-numeric: tabular-nums; }
.ask { display: block; margin: .1rem 0 .35rem; font: 600 .82rem/1.3 var(--sans); }
textarea { width: 100%; box-sizing: border-box; padding: .55rem .6rem;
  border: 1px solid var(--rule-2); border-radius: 4px; background: var(--bg);
  color: var(--ink); font: inherit; font-size: .9rem; resize: vertical; }
textarea:focus-visible, .amt-in:focus-visible { outline: 2px solid var(--gold);
  outline-offset: 1px; }
.ask-acts { display: flex; gap: .5rem; margin-top: .5rem; }
.cur { color: var(--ink-3); font: 600 .95rem/1 var(--mono); }
.amt-in { width: 6rem; padding: .4rem .5rem; border: 1px solid var(--rule-2);
  border-radius: 4px; background: var(--bg); color: var(--ink); font: inherit;
  font-variant-numeric: tabular-nums; }
.secret { display: block; margin: .4rem 0 0; padding: .5rem .6rem;
  border: 1px solid var(--rule-2); border-radius: 6px; background: var(--panel-2);
  font: 600 .8rem/1.4 var(--mono); word-break: break-all; }
.keyline .k { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.reveal { margin-top: .6rem; padding: .75rem .85rem; border-radius: 3px;
  border: 1px solid #4A3410; background: #17110603; }
.reveal .k { display: block; margin: .35rem 0; font: 600 .9rem/1.4 var(--mono);
  color: var(--gold); word-break: break-all; }
.reveal p { margin: 0; font-size: .78rem; color: var(--ink-3); }
</style>

<header class="top">
  <a class="mark" href="/board">lamdis<b>.</b></a>
  <div class="right">
    <span class="health"><span class="beacon off"></span><span id="h-text">&hellip;</span></span>
  </div>
</header>
<div class="shell">
  <nav class="rail">
    <span class="label grp">Work</span>
    <a href="/board">Queue</a>
    <a href="/board#holding">In flight</a>
    <span class="label grp">Operation</span>
    <a href="/console" aria-current="page">Earnings</a>
    <a href="#capacity">Capacity</a>
    <a href="#larger">Larger jobs</a>
    <a href="#integration">Integration</a>
  </nav>
  <main class="main">
    <h1>Your account</h1>
    <p class="lead">What you have earned, what you will take, and how your agents
      connect.</p>
    <div id="body"><div class="empty">Loading&hellip;</div></div>
  </main>
</div>
<script>
"use strict";
`

const consoleScript = `
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function money(m, cur) {
  var sign = m < 0 ? "-" : "", v = Math.abs(m || 0);
  var sym = (cur || "USD") === "USD" ? "$" : cur + " ";
  return sign + sym + Math.floor(v / 100) + "." + String(v % 100).padStart(2, "0");
}
function when(iso) {
  var d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, {month: "short", day: "numeric"});
}

var ME = null, CAP = null, KEYS = [];

function metric(label, value, cls, trend) {
  return '<div class="metric ' + (cls || "") + '"><dt>' + label + '</dt><dd>' + value + '</dd>' +
    (trend ? '<div class="trend">' + trend + '</div>' : '') + '</div>';
}

// The most useful sentence on the page is why the money has not arrived.
function blockedStrip() {
  if (!ME.blocked) { return ""; }
  return '<div class="strip warn"><span class="d"></span><span>' +
    esc(ME.blocked) + '</span>' +
    (ME.can_connect_payout
      ? '<button class="btn sm" id="pay-connect" style="margin-left:auto">' +
        (ME.payout && ME.payout.connected ? "Finish setup" : "Set up payouts") +
        '</button>'
      : "") +
    '</div>' +
    '<div class="err" id="pay-err"></div>';
}

// Opening the rail's hosted onboarding.
//
// The link is minted per click rather than rendered into the page: it is
// single-use at the provider, so a stale one in the HTML fails with no
// explanation at the worst possible moment.
function connectPayout(btn) {
  var host = document.getElementById("pay-err");
  btn.disabled = true;
  btn.textContent = "Setting up\u2026";

  // A staged panel rather than a spinner.
  //
  // This waits on the payment provider, which takes seconds rather than
  // milliseconds. A bar that pretends to know how far along it is would be
  // inventing progress it cannot see; naming the step actually in flight, and
  // showing real elapsed time, is true and reads as deliberate rather than
  // stuck.
  host.innerHTML =
    '<div class="setup" role="status" aria-live="polite">' +
      '<div class="bar"><span></span></div>' +
      '<div class="setup-step" id="pay-step">Opening your account with Stripe</div>' +
      '<div class="setup-note" id="pay-note">' +
        'Stripe holds your bank details, not us. You will finish on their pages.' +
      '</div>' +
      '<div class="setup-clock" id="pay-clock">0s</div>' +
    '</div>';

  var t0 = Date.now();
  var tick = setInterval(function () {
    var s = Math.round((Date.now() - t0) / 1000);
    var clock = document.getElementById("pay-clock");
    if (clock) { clock.textContent = s + "s"; }
    var step = document.getElementById("pay-step");
    var note = document.getElementById("pay-note");
    if (!step) { return; }
    // Only claims that stay true however long it takes.
    if (s >= 20) {
      step.textContent = "Still waiting on Stripe";
      note.textContent = "Longer than usual. Nothing is lost \u2014 leaving this " +
        "page and trying again later is safe.";
    } else if (s >= 8) {
      step.textContent = "Preparing your verification link";
      note.textContent = "Almost there.";
    }
  }, 250);
  var stop = function () { clearInterval(tick); };

  workerHeaders("POST", "/v1/payout/connect").then(function (h) {
    return fetch("/v1/payout/connect", {method: "POST", headers: h});
  }).then(function (r) {
    return r.json().then(function (j) { return {ok: r.ok, body: j}; });
  }).then(function (res) {
    if (!res.ok || !res.body.url) {
      throw new Error((res.body && res.body.error) || "could not start setup");
    }
    stop();
    var step = document.getElementById("pay-step");
    if (step) { step.textContent = "Taking you to Stripe\u2026"; }
    location.href = res.body.url;
  }).catch(function (e) {
    stop();
    host.innerHTML = '<div class="err">' + esc(e.message) + '</div>';
    btn.disabled = false;
    btn.textContent = "Set up payouts";
  });
}

// Returning from the provider proves nothing on its own, so the state is
// re-read from them rather than assumed from the redirect.
function afterPayoutReturn() {
  var q = new URLSearchParams(location.search);
  if (q.get("payout") === "returned" || q.get("topup") === "done") {
    var session = q.get("session");
    history.replaceState(null, "", location.pathname);
    if (session) { confirmTopup(session); }
    else { load(); }
  }
}

// A person who lands on the success page has not necessarily paid, so the
// balance is credited only after the provider confirms it.
function confirmTopup(session) {
  workerHeaders("POST", "/v1/balance/confirm").then(function (h) {
    return fetch("/v1/balance/confirm?session=" + encodeURIComponent(session),
      {method: "POST", headers: h});
  }).then(function () { load(); }).catch(function () { load(); });
}

function earnings() {
  var cur = ME.currency;
  var rows = (ME.history || []).map(function (h) {
    var chip = h.status === "accepted" || h.status === "paid" ? "ok"
             : (h.status === "rejected" ? "bad" : "");
    return '<div class="r"><div class="grow">' +
      '<div class="t"><span class="chip ' + chip + '">' + esc(h.status) + '</span>' +
        esc(h.title || h.job) + '</div>' +
      '<div class="m">' + esc(when(h.at)) + (h.why ? ' &middot; ' + esc(h.why) : '') + '</div>' +
      '</div><span class="amt' + (h.amount_minor ? '' : ' none') + '">' +
      (h.amount_minor ? money(h.amount_minor, cur) : "&mdash;") + '</span></div>';
  }).join("");

  var bids = (ME.bids || []).map(function (b) {
    return '<div class="r"><div class="grow">' +
      '<div class="t"><span class="chip ' + (b.won ? "ok" : "hot") + '">' +
        (b.won ? "Won" : "Bid") + '</span>' + esc(b.title) + '</div>' +
      '<div class="m">' + esc(b.status) + '</div></div>' +
      '<span class="amt">' + money(b.amount_minor, b.currency) + '</span></div>';
  }).join("");

  var tax = ME.tax;
  var taxNote = "";
  if (tax && (tax.reportable || tax.approaching)) {
    taxNote = '<div class="strip"><span class="d"></span><span>' +
      (tax.reportable
        ? "You have earned " + money(tax.earned_minor, cur) + " here in " + tax.year +
          ", which is above the " + money(tax.threshold_minor, cur) +
          " US reporting threshold. The payment provider will have collected " +
          "your tax details during setup."
        : "You are approaching the " + money(tax.threshold_minor, cur) +
          " US reporting threshold for " + tax.year + " (" +
          money(tax.earned_minor, cur) + " so far). Finishing payout setup now " +
          "means nothing is held up later.") +
      '</span></div>';
  }

  return blockedStrip() + taxNote +
    '<dl class="metrics">' +
      metric("Waiting to be paid", money(ME.pending_minor, cur), "money") +
      metric("Paid out", money(ME.paid_minor, cur)) +
      metric("Earned in total", money(ME.earned_minor, cur), "money") +
      metric("Payout at", money(ME.payout_threshold, cur), "", "then it is sent") +
    '</dl>' +
    (ME.pending_minor > 0
      ? '<div class="ctl" style="margin:0 0 1rem">' +
          '<button class="btn" id="cash-now">Send what I am owed now</button>' +
          '<span class="why" style="margin:0">Below the threshold the ' +
            'provider\u2019s transfer fee comes out of it \u2014 your call, not ours.' +
          '</span></div><div class="err" id="cash-err"></div>'
      : "") +
    '<dl class="metrics" hidden>' +
    '</dl>' +
    (bids ? '<h2>Offers you have out</h2><div class="rows">' + bids + '</div>' : "") +
    '<h2>What you have done</h2>' +
    (rows ? '<div class="rows">' + rows + '</div>'
          : '<div class="empty">Nothing yet. <a href="/board">Find work</a>.</div>');
}

var KINDS = [["observe", "Checks"], ["do", "Errands & jobs"], ["review", "Verification"]];
var SKILLS = [];
var SPEND = null;
// The demonstration scope, and its id. Named once so the section and the
// example calls it prints can never drift apart.
var SCOPE = null;
var DEMO_PROJECT = "proj-demo-paving";

// Multi-part work, explained where the person who needs it is standing.
//
// A paving contractor's agent that can bid on three separate listings is not
// the same thing as one that can price a scope. The difference is worth real
// money to them and the console said nothing about it at all: three project
// references in the whole page, every one of them a counter in the buyer's
// spending pane.
//
// SCOPE is the demonstration project, fetched alongside everything else. It is
// a real listing on a real board with real rules, marked practice throughout,
// so a business can read exactly how a job too big for one visit behaves
// before deciding whether to wire anything up.
function largerJobs() {
  var sc = SCOPE, pieces = "", n = 0;
  if (sc && sc.jobs && sc.jobs.length) {
    pieces = sc.jobs.map(function (j) {
      n++;
      var blocked = (j.blocked_by || []).length > 0;
      // Generic. An earlier draft explained the paving demo's own reason
      // here — "the mixer crosses this ground" — which would have been
      // asserted over every blocked piece of every project, including ones
      // with nothing to do with concrete.
      var sub = blocked
        ? "Cannot start until piece " + pieceNumber(sc, j.blocked_by[0]) +
          " is finished and accepted"
        : "Can start as soon as it is awarded";
      return '<div class="piece' + (blocked ? " blocked" : "") + '">' +
        '<div class="num">' + n + '</div>' +
        '<div><div class="t">' + esc(j.title) + '</div>' +
        '<div class="s' + (blocked ? " warn" : "") + '">' + sub + '</div></div>' +
        '</div>';
    }).join("");
  }

  return '<h2 id="larger">Larger jobs</h2>' +
  '<p class="lead">Work that takes more than one visit, more than one place, or ' +
    'more than one trade. Everything below is live on the board right now as a ' +
    'demonstration you can read, price and bid against without a cent moving.</p>' +

  (pieces
    ? '<div class="scope">' +
        '<div class="hd"><b>' + esc((sc.project && sc.project.title) || "Demonstration scope") +
          '</b><span>' + esc(sc.jobs.length) + ' pieces &middot; ' +
          ((sc.project && sc.project.one_visit) ? "one address" : (sc.project.sites + " sites")) +
          '</span></div>' + pieces +
      '</div>'
    : '<div class="note-box">The demonstration scope is not on this board.</div>') +

  '<div class="note-box"><b>Why the grouping matters.</b> Getting a crew and a ' +
    'paver to a site is most of the cost of a small job. Three jobs at one ' +
    'address is <b>one</b> mobilisation. Shown as three unrelated listings, you ' +
    'either price three of them and lose, or price one and are ruined if you win ' +
    'two. So the board says what a job is a piece of, and you can make one offer ' +
    'for the whole thing.</div>' +

  '<div class="panes">' +
    '<div class="pane">' +
      '<h3>One offer, all or nothing</h3>' +
      '<p class="why">Price each piece, send it as one bid. It is awarded ' +
        'together or not at all, so the piece carrying your mobilisation cannot ' +
        'be cherry-picked away from the pieces that pay for it.</p>' +
    '</div>' +
    '<div class="pane">' +
      '<h3>Order that is enforced</h3>' +
      '<p class="why">A piece that depends on another cannot be claimed until ' +
        'that one is finished <i>and accepted</i>. Nobody else can book the ' +
        'ground you need on the morning you need it.</p>' +
    '</div>' +
    '<div class="pane">' +
      '<h3>You write the stages</h3>' +
      '<p class="why">On these jobs the buyer says what they want and what they ' +
        'will pay. <b>You</b> say how it breaks down &mdash; prep, base, binder, ' +
        'surface &mdash; and what each is worth, and you are paid per stage as ' +
        'each is accepted. A homeowner does not know what a binder course is, ' +
        'and neither does their agent.</p>' +
    '</div>' +
    '<div class="pane">' +
      '<h3>Many sites, one buyer</h3>' +
      '<p class="why">A project can span locations as easily as trades. Each ' +
        'piece carries the buyer\'s own site reference, so four hundred stores ' +
        'stay distinguishable on the receipts your accounts department reads.</p>' +
    '</div>' +
  '</div>' +

  '<h3 style="margin:1.4rem 0 .6rem;font-size:.92rem">What your agent calls</h3>' +
  '<pre class="api">' +
    '<b>GET</b>  /v1/scope/' + esc(DEMO_PROJECT) + '\n' +
    '     the whole scope, in the order it has to happen, with what blocks what\n\n' +
    '<b>POST</b> /v1/scope/' + esc(DEMO_PROJECT) + '/bid\n' +
    '     { "lines": [ {"job":"...","amount_minor":480000,\n' +
    '                   "note":"carries mobilisation for all three"}, ... ],\n' +
    '       "note": "slab first, cure over the weekend, both drives Mon-Tue",\n' +
    '       "all_or_nothing": true }\n\n' +
    '<b>POST</b> /v1/workers/plan/{job}\n' +
    '     { "stages": [ {"name":"Aggregate base",\n' +
    '                    "deliverable":"Base compacted to depth",\n' +
    '                    "pay_minor":150000}, ... ] }\n' +
    '     your breakdown; the stages must add up to the price you were awarded' +
  '</pre>' +
  '<p class="why" style="margin-bottom:1.4rem">Same signing as every other ' +
    'route. Full reference in <a href="/docs">the docs</a>.</p>';
}

// pieceNumber turns a job id into its position, so a dependency reads as
// "waits on piece 1" rather than as an identifier nobody recognises.
function pieceNumber(sc, job) {
  for (var i = 0; i < sc.jobs.length; i++) {
    if (sc.jobs[i].job === job) { return i + 1; }
  }
  return "?";
}

function capacity() {
  var c = CAP.capacity, st = CAP.standing || {};
  return '<h2 id="capacity">Capacity</h2>' +
  '<p class="lead">What you will take, how much at once, and how far out. The exchange ' +
    'only dispatches inside these limits.</p>' +
  '<div class="panes">' +
    '<div class="pane">' +
      '<h3>Concurrency</h3>' +
      '<p class="why">How many jobs you will hold at the same time. You can hold up to ' +
        '<b>' + CAP.ceiling + '</b> right now &mdash; finishing jobs raises it.</p>' +
      '<div class="ctl">' +
        '<input type="range" min="1" max="' + (CAP.ceiling || 1) +
          '" value="' + Math.min(c.max_concurrent, CAP.ceiling || 1) +
          '" id="c-conc" aria-label="Jobs at once">' +
        '<span class="v" id="c-conc-v">' + Math.min(c.max_concurrent, CAP.ceiling || 1) +
          '</span>' +
      '</div>' +
      '<div class="toggle"><div>' +
        '<div class="tx">Taking work</div>' +
        '<div class="sx">Turn off to finish what you hold and stop.</div>' +
      '</div><button class="sw" id="c-accept" aria-pressed="' + !!c.accepting + '" aria-label="Taking work"></button></div>' +
    '</div>' +

    '<div class="pane">' +
      '<p class="why" style="margin:.5rem 0 0">' +
        (CAP.ceiling >= 12
          ? 'Your ceiling is ' + CAP.ceiling + ', because a reviewer has checked ' +
            'your licences and cover.'
          : 'Your ceiling is ' + (CAP.ceiling || 1) + ' for now. It rises as you ' +
            'finish work, and rises a lot once a reviewer has checked a ' +
            '<a href="/console#supplier">supplier profile</a> \u2014 a business ' +
            'with crews should not be throttled like a stranger.') +
      '</p>' +
    '</div>' +

    '<div class="pane">' +
      '<h3>Range</h3>' +
      '<p class="why">How far from you a job can be.</p>' +
      '<div class="ctl">' +
        '<input type="range" min="1" max="60" value="' + c.range_miles + '" id="c-range" aria-label="Range in miles">' +
        '<span class="v" id="c-range-v">' + c.range_miles + ' mi</span>' +
      '</div>' +
      '<div class="toggle"><div>' +
        '<div class="tx">Where you work from</div>' +
        '<div class="sx" id="c-loc">' +
          (c.lat_e7 ? "Set &mdash; jobs are sorted by distance from here."
                    : "Not set. Until it is, range does nothing and you see every job in the country.") +
        '</div>' +
      '</div><button class="sw2" id="c-locate">' +
        (c.lat_e7 ? "Update" : "Set") + '</button></div>' +
      '<div class="toggle"><div>' +
        '<div class="tx">Auto-accept</div>' +
        '<div class="sx">Take matching work without asking. Needs an endpoint below.</div>' +
      '</div><button class="sw" id="c-auto" aria-pressed="' + !!c.auto_accept + '" aria-label="Auto-accept"></button></div>' +
    '</div>' +

    '<div class="pane">' +
      '<h3>What you take</h3>' +
      '<p class="why">Only these kinds of job reach you.</p>' +
      '<div class="kinds">' + KINDS.map(function (k) {
        var on = !c.kinds || !c.kinds.length || c.kinds.indexOf(k[0]) > -1;
        return '<button class="kind" data-kind="' + k[0] + '" aria-pressed="' + on + '">' + k[1] + '</button>';
      }).join("") + '</div>' +
      '<h3 style="margin-top:1.1rem">What you are qualified for</h3>' +
      '<p class="why">Licensed trades only reach people who claim the credential. ' +
        'Claiming one you do not hold is fraud, and the job carries your name.</p>' +
      '<div class="kinds">' + SKILLS.map(function (k) {
        var on = (c.skills || []).indexOf(k.skill) > -1;
        return '<button class="kind' + (k.licensed ? " lic" : "") + '" data-skill="' + k.skill +
          '" aria-pressed="' + on + '" title="' + esc(k.note || "") + '">' +
          esc(k.label) + '</button>';
      }).join("") + '</div>' +
    '</div>' +

    '<div class="pane">' +
      '<h3>Standing</h3>' +
      '<p class="why">Earned by finishing what you take.</p>' +
      '<div class="r" style="padding:.5rem 0;border:0"><div class="grow">' +
        '<div class="t"><span class="chip ok">' + (st.completed || 0) + ' done</span>Completion</div>' +
        '<div class="m">' + (st.abandoned || 0) + ' abandoned &middot; you can hold ' +
          (st.allowance || 1) + ' at once</div></div></div>' +
    '</div>' +
  '</div>' +
  '<div class="err" id="cap-err"></div>';
}

function integration() {
  var rows = KEYS.length ? KEYS.map(function (k) {
    return '<div class="r"><div class="grow">' +
      '<div class="t"><span class="chip ' + (k.revoked ? "bad" : "ok") + '">' +
        (k.revoked ? "Revoked" : "Active") + '</span>' + esc(k.label || "agent") + '</div>' +
      '<div class="m">&bull;&bull;&bull;&bull;' + esc(k.last4) +
        (k.last_used ? ' &middot; last used ' + esc(when(k.last_used)) : ' &middot; never used') + '</div>' +
      '</div>' +
      (k.revoked ? '' : '<button class="btn sm" data-revoke="' + esc(k.id) + '">Revoke</button>') +
    '</div>';
  }).join("") : '<div class="empty">No keys yet. Issue one so an agent can dispatch on your behalf.</div>';

  return '<h2 id="integration">Integration</h2>' +
  '<p class="lead">Give an agent a key and it can post jobs, or take dispatch, on your ' +
    'behalf &mdash; inside limits you set here, enforced by us.</p>' +
  '<div class="rows">' + rows + '</div>' +
  '<div id="new-key"></div>' +
  '<div class="panes" style="margin-top:1.2rem">' +
    '<div class="pane">' +
      '<h3>Issue a key</h3>' +
      '<p class="why">Shown once. Nothing here can show it to you again.</p>' +
      '<input type="text" id="k-label" placeholder="What is it for? e.g. dispatch bot" maxlength="60">' +
      '<div class="ctl" style="margin-top:.7rem">' +
        '<input type="range" min="10" max="1000" step="10" value="100" id="k-cap" aria-label="Per-job cap">' +
        '<span class="v" id="k-cap-v">$100</span>' +
      '</div>' +
      '<p class="why" style="margin:.2rem 0 .8rem">Most it may commit to any one job.</p>' +
      '<button class="btn go" id="k-make">Issue key</button>' +
      '<div class="err" id="k-err"></div>' +
    '</div>' +
    '<div class="pane">' +
      '<h3>Dispatch endpoint</h3>' +
      '<p class="why">For fleets and businesses that take work over the API. We post ' +
        'offers here; reply 202 to accept.</p>' +
      '<input type="text" id="c-hook" placeholder="https://your.host/lamdis/dispatch" ' +
        'value="' + esc((CAP.capacity && CAP.capacity.webhook) || "") + '">' +
      '<p class="why" style="margin:.6rem 0 0">HTTPS only. Auto-accept stays off until ' +
        'this is set.</p>' +
      ((CAP.capacity && CAP.capacity.webhook_secret)
        ? '<h3 style="margin-top:1rem">Signing secret</h3>' +
          '<p class="why">Every offer carries <code>X-Lamdis-Signature</code>, an ' +
            'HMAC-SHA256 over the timestamp, a newline, and the body. Check it before ' +
            'acting on an offer &mdash; anyone can POST to your endpoint.</p>' +
          '<code class="secret">' + esc(CAP.capacity.webhook_secret) + '</code>'
        : "") +
    '</div>' +
  '</div>';
}

function spending() {
  if (!SPEND) { return ""; }
  var cur = SPEND.currency || "USD";
  var jobs = SPEND.jobs || [];

  var rows = jobs.map(function (j) {
    var review = j.review || {};
    var waiting = review.awaiting_release_minor;
    var chip = waiting ? "hot"
             : (j.status === "done" ? "ok"
             : (j.status.indexOf("refunding") > -1 ? "bad" : ""));
    return '<div class="r"><div class="grow">' +
      '<div class="t"><span class="chip ' + chip + '">' +
        (waiting ? "needs you" : esc(j.status)) + '</span>' +
        esc(j.title) + '</div>' +
      '<div class="m">' + esc(when(j.posted)) +
        (j.where ? ' &middot; ' + esc(j.where) : '') +
        (j.worker ? ' &middot; taken by ' + esc(j.worker) +
          (j.worker_completed ? ' (' + j.worker_completed + ' done here)' : ' (first job here)') : '') +
        (j.stages_total
          ? ' &middot; ' + j.stages_done + '/' + j.stages_total + ' stages'
          : (j.submissions ? ' &middot; ' + j.submissions + ' submitted' : '')) +
        (j.evidence ? ' &middot; <a href="' + esc(j.evidence) + '">see what came back</a>' : '') +
      '</div>' +
      (waiting
        ? '<div class="m" style="margin-top:.35rem">' +
            money(waiting, cur) + ' goes to them ' +
            (review.hours_left > 1
              ? 'in about ' + Math.round(review.hours_left) + ' hours'
              : 'shortly') +
            ' unless you say otherwise.' +
          '</div>' +
          '<div class="acts" style="margin-top:.45rem">' +
            '<button class="btn sm" data-release="' + esc(j.job) + '">Looks good, pay now</button>' +
            '<button class="btn sm" data-hold="' + esc(j.job) + '">Something is wrong</button>' +
          '</div><div class="err" id="rv-' + esc(j.job) + '"></div>'
        : (review.held_minor
            ? '<div class="m" style="margin-top:.35rem">' +
                money(review.held_minor, cur) + ' is on hold while this is looked at.</div>'
            : "")) +
      '</div>' +
      '<span class="amt">' + money(j.committed_minor, cur) + '</span></div>';
  }).join("");

  var need = SPEND.awaiting_review || 0;
  return '<h2 id="spending">Spending</h2>' +
    (need
      ? '<div class="strip warn"><span class="d"></span><span>' + need +
        (need === 1 ? ' job is' : ' jobs are') + ' finished and waiting on you. ' +
        'Payment goes out when the review window closes.</span></div>'
      : "") +
    '<p class="lead">What your agents bought with your balance. Every job here was ' +
      'posted by a key you issued.</p>' +
    '<dl class="metrics">' +
      metric("Balance", money(SPEND.balance_minor || 0, cur), "money") +
      metric("Held for open jobs", money(SPEND.held_minor || 0, cur), "money",
             "returned if nobody takes them") +
      metric("Committed all time", money(SPEND.committed_minor || 0, cur), "money") +
    '</dl>' +
    '<div class="ctl" style="margin:.2rem 0 1rem;gap:.5rem">' +
      '<span class="cur">$</span>' +
      '<input type="number" id="topup-amt" value="50" min="1" step="1" ' +
        'aria-label="Amount to add" class="amt-in">' +
      '<button class="btn go" id="s-topup">Add funds</button></div>' +
    (rows ? '<div class="rows">' + rows + '</div>'
          : '<div class="empty">Your agents have not bought anything yet.</div>');
}

// Adding funds happens on the provider's hosted page: the exchange never sees
// a card number, and the balance moves only once they confirm the payment.
function addFunds(btn) {
  var field = document.getElementById("topup-amt");
  if (!field) { return; }
  var minor = Math.round(parseFloat(field.value) * 100);
  if (!(minor > 0)) { field.focus(); return; }
  btn.disabled = true;
  btn.textContent = "Opening\u2026";
  var slow = setTimeout(function () {
    btn.textContent = "Reaching Stripe\u2026";
  }, 1200);
  workerHeaders("POST", "/v1/balance/topup").then(function (h) {
    h["Content-Type"] = "application/json";
    return fetch("/v1/balance/topup", {method: "POST", headers: h,
      body: JSON.stringify({amount_minor: minor, currency: "USD"})});
  }).then(function (r) {
    return r.json().then(function (j) { return {ok: r.ok, body: j}; });
  }).then(function (res) {
    if (!res.ok || !res.body.pay_at) {
      throw new Error((res.body && res.body.error) || "could not start payment");
    }
    clearTimeout(slow);
    location.href = res.body.pay_at;
  }).catch(function (e) {
    clearTimeout(slow);
    btn.disabled = false;
    btn.textContent = "Add funds";
    // Shown in the page rather than an alert: a modal steals focus and says
    // nothing about where the failure was.
    var host = document.getElementById("pay-err");
    if (host) { host.innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
  });
}

// Accepting the work pays a good worker straight away rather than making them
// wait out a window that exists for the buyer's benefit.
function reviewAction(job, action, reason) {
  var err = document.getElementById("rv-" + job);
  var path = "/v1/jobs/" + encodeURIComponent(job) + "/" + action;
  var body = reason ? JSON.stringify({reason: reason}) : null;
  err.textContent = "";
  workerHeaders("POST", path).then(function (h) {
    if (body) { h["Content-Type"] = "application/json"; }
    return fetch(path, {method: "POST", headers: h, body: body});
  }).then(function (r) {
    return r.json().then(function (j) { return {ok: r.ok, body: j}; });
  }).then(function (res) {
    if (!res.ok) { throw new Error(res.body && res.body.error || "could not do that"); }
    load();
  }).catch(function (e) { err.textContent = e.message; });
}

function render() {
  document.getElementById("body").innerHTML =
    earnings() + spending() + capacity() + largerJobs() + integration();
  wire();
}

function saveCapacity() {
  var kinds = [];
  document.querySelectorAll("[data-kind]").forEach(function (k) {
    if (k.getAttribute("aria-pressed") === "true") { kinds.push(k.dataset.kind); }
  });
  if (kinds.length === KINDS.length) { kinds = []; }   // all of them means no filter
  var skills = [];
  document.querySelectorAll("[data-skill]").forEach(function (k) {
    if (k.getAttribute("aria-pressed") === "true") { skills.push(k.dataset.skill); }
  });

  var body = {
    max_concurrent: parseInt(document.getElementById("c-conc").value, 10),
    range_miles: parseInt(document.getElementById("c-range").value, 10),
    kinds: kinds,
    skills: skills,
    lat_e7: (CAP.capacity && CAP.capacity.lat_e7) || 0,
    lon_e7: (CAP.capacity && CAP.capacity.lon_e7) || 0,
    accepting: document.getElementById("c-accept").getAttribute("aria-pressed") === "true",
    auto_accept: document.getElementById("c-auto").getAttribute("aria-pressed") === "true",
    webhook: (document.getElementById("c-hook") || {}).value || ""
  };
  var err = document.getElementById("cap-err");
  workerHeaders("PUT", "/v1/capacity").then(function (h) {
    h["Content-Type"] = "application/json";
    return fetch("/v1/capacity", {method: "PUT", headers: h, body: JSON.stringify(body)});
  }).then(function (r) {
    if (handleAuthFailure(r.status)) { return null; }
    return r.json();
  }).then(function (j) {
    if (!j) { return; }
    CAP = {capacity: j.capacity, standing: CAP.standing, ceiling: j.ceiling};
    err.className = "err ok";
    err.textContent = j.note || "Saved.";
  }).catch(function () {
    err.className = "err";
    err.textContent = "Could not save that.";
  });
}

function wire() {
  var conc = document.getElementById("c-conc");
  document.querySelectorAll("[data-skill]").forEach(function (b) {
    b.addEventListener("click", function () {
      this.setAttribute("aria-pressed", this.getAttribute("aria-pressed") !== "true");
      saveCapacity();
    });
  });
  document.querySelectorAll("[data-release]").forEach(function (b) {
    b.addEventListener("click", function () {
      reviewAction(this.dataset.release, "release", null);
    });
  });
  document.querySelectorAll("[data-hold]").forEach(function (b) {
    b.addEventListener("click", function () {
      var job = this.dataset.hold;
      var host = document.getElementById("rv-" + job);
      host.innerHTML =
        '<label class="ask" for="hw-' + job + '">What is wrong? A person reads this.</label>' +
        '<textarea id="hw-' + job + '" rows="2" placeholder="The gutter is still full at the north end."></textarea>' +
        '<div class="ask-acts">' +
          '<button class="btn go" id="hs-' + job + '">Hold payment</button>' +
          '<button class="btn" id="hc-' + job + '">Cancel</button>' +
        '</div>';
      document.getElementById("hw-" + job).focus();
      document.getElementById("hc-" + job).onclick = function () { host.innerHTML = ""; };
      document.getElementById("hs-" + job).onclick = function () {
        var why = document.getElementById("hw-" + job).value.trim();
        if (!why) { document.getElementById("hw-" + job).focus(); return; }
        reviewAction(job, "hold", why);
      };
    });
  });
  var cash = document.getElementById("cash-now");
  if (cash) {
    cash.addEventListener("click", function () {
      var btn = this, err = document.getElementById("cash-err");
      btn.disabled = true; btn.textContent = "Sending\u2026"; err.textContent = "";
      workerHeaders("POST", "/v1/payout/now").then(function (h) {
        return fetch("/v1/payout/now", {method: "POST", headers: h});
      }).then(function (r) {
        return r.json().then(function (j) { return {ok: r.ok, body: j}; });
      }).then(function (res) {
        if (!res.ok) { throw new Error(res.body && res.body.error || "could not send"); }
        err.className = "err ok";
        err.textContent = res.body.sent
          ? "Sent " + money(res.body.amount_minor, ME.currency) + "."
          : res.body.status;
        load();
      }).catch(function (e) {
        err.textContent = e.message;
        btn.disabled = false; btn.textContent = "Send what I am owed now";
      });
    });
  }
  var st = document.getElementById("s-topup");
  if (st) { st.addEventListener("click", function () { addFunds(this); }); }
  var pc = document.getElementById("pay-connect");
  if (pc) { pc.addEventListener("click", function () { connectPayout(this); }); }
  var locate = document.getElementById("c-locate");
  if (locate) {
    locate.addEventListener("click", function () {
      var out = document.getElementById("c-loc");
      if (!navigator.geolocation) {
        out.textContent = "This browser will not share a location.";
        return;
      }
      out.textContent = "Asking\u2026";
      navigator.geolocation.getCurrentPosition(function (pos) {
        CAP.capacity = CAP.capacity || {};
        CAP.capacity.lat_e7 = Math.round(pos.coords.latitude * 1e7);
        CAP.capacity.lon_e7 = Math.round(pos.coords.longitude * 1e7);
        out.textContent = "Set \u2014 jobs are sorted by distance from here.";
        saveCapacity();
        load();
      }, function () {
        out.textContent = "Location refused. Range stays off until you allow it.";
      });
    });
  }
  var range = document.getElementById("c-range");
  if (conc) {
    conc.addEventListener("input", function () {
      document.getElementById("c-conc-v").textContent = this.value;
    });
    conc.addEventListener("change", saveCapacity);
  }
  if (range) {
    range.addEventListener("input", function () {
      document.getElementById("c-range-v").textContent = this.value + " mi";
    });
    range.addEventListener("change", saveCapacity);
  }
  document.querySelectorAll(".sw, .kind").forEach(function (el) {
    el.addEventListener("click", function () {
      el.setAttribute("aria-pressed", el.getAttribute("aria-pressed") === "true" ? "false" : "true");
      saveCapacity();
    });
  });
  var hook = document.getElementById("c-hook");
  if (hook) { hook.addEventListener("change", saveCapacity); }

  var cap = document.getElementById("k-cap");
  if (cap) {
    cap.addEventListener("input", function () {
      document.getElementById("k-cap-v").textContent = "$" + this.value;
    });
  }
  var make = document.getElementById("k-make");
  if (make) { make.addEventListener("click", issueKey); }

  document.querySelectorAll("[data-revoke]").forEach(function (b) {
    b.addEventListener("click", function () { revokeKey(b, b.dataset.revoke); });
  });
}

function issueKey() {
  var btn = document.getElementById("k-make");
  var err = document.getElementById("k-err");
  var label = document.getElementById("k-label").value.trim() || "agent";
  var perJob = parseInt(document.getElementById("k-cap").value, 10) * 100;
  btn.disabled = true; btn.textContent = "Issuing…"; err.textContent = "";

  workerHeaders("POST", "/v1/agent-keys").then(function (h) {
    h["Content-Type"] = "application/json";
    return fetch("/v1/agent-keys", {method: "POST", headers: h,
      body: JSON.stringify({label: label, max_per_job_minor: perJob})});
  }).then(function (r) {
    return r.json().then(function (j) { return {ok: r.ok, status: r.status, body: j}; });
  }).then(function (res) {
    if (handleAuthFailure(res.status)) { return; }
    if (!res.ok) { throw new Error(res.body && res.body.error || "could not issue a key"); }
    document.getElementById("new-key").innerHTML =
      '<div class="reveal"><span class="label">Copy this now</span>' +
      '<span class="k">' + esc(res.body.key) + '</span>' +
      '<p>It will not be shown again. Anything using it spends your balance, up to $' +
      (perJob / 100) + ' a job.</p></div>';
    loadKeys();
  }).catch(function (e) {
    err.textContent = e.message;
  }).then(function () {
    btn.disabled = false; btn.textContent = "Issue key";
  });
}

function revokeKey(btn, id) {
  btn.disabled = true; btn.textContent = "Revoking…";
  workerHeaders("DELETE", "/v1/agent-keys/" + encodeURIComponent(id)).then(function (h) {
    return fetch("/v1/agent-keys/" + encodeURIComponent(id), {method: "DELETE", headers: h});
  }).then(function () { loadKeys(); })
    .catch(function () { btn.disabled = false; btn.textContent = "Revoke"; });
}

function loadKeys() {
  workerHeaders("GET", "/v1/agent-keys")
    .then(function (h) { return fetch("/v1/agent-keys", {headers: h}); })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { KEYS = (j && j.keys) || []; render(); })
    .catch(function () { KEYS = []; });
}

function load() {
  if (!signedIn()) { goSignIn(); return; }
  document.querySelector(".beacon").classList.remove("off");
  document.getElementById("h-text").textContent = "Signed in";

  Promise.all([
    workerHeaders("GET", "/v1/me").then(function (h) { return fetch("/v1/me", {headers: h}); }),
    workerHeaders("GET", "/v1/capacity").then(function (h) { return fetch("/v1/capacity", {headers: h}); }),
    workerHeaders("GET", "/v1/agent-keys").then(function (h) { return fetch("/v1/agent-keys", {headers: h}); }),
    fetch("/v1/skills"),
    workerHeaders("GET", "/v1/spend").then(function (h) { return fetch("/v1/spend", {headers: h}); }),
    // The demonstration scope. Failing to load it must not take the console
    // with it, so it resolves to a null-bodied response rather than rejecting.
    workerHeaders("GET", "/v1/scope/" + DEMO_PROJECT)
      .then(function (h) { return fetch("/v1/scope/" + DEMO_PROJECT, {headers: h}); })
      .catch(function () { return {ok: false, status: 0, json: function () { return null; }}; })
  ]).then(function (rs) {
    if (handleAuthFailure(rs[0].status)) { return null; }
    return Promise.all(rs.map(function (r) { return r.ok ? r.json() : null; }));
  }).then(function (out) {
    if (!out) { return; }
    ME = out[0];
    CAP = out[1] || {capacity: {max_concurrent: 1, range_miles: 12, accepting: true}, ceiling: 1};
    KEYS = (out[2] && out[2].keys) || [];
    SKILLS = (out[3] && out[3].skills) || [];
    SPEND = out[4] || null;
    SCOPE = out[5] || null;
    render();
  }).catch(function () {
    document.getElementById("body").innerHTML =
      '<div class="empty">Could not reach the exchange.</div>';
  });
}

session().then(load).then(afterPayoutReturn);
</script>
`
