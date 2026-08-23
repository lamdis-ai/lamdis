package api

// boardPageHTML is the operator's queue: work dispatched by agents that this
// person, fleet or business is eligible for.
//
// It opens with what they are already holding, because somebody with a job out
// cannot take another and the first question they have is "where is the thing
// I already took". Everything else is secondary to that.
var boardPageHTML = boardTop + themeCSS + boardMid + boardBody + workerJS + boardScript

const boardTop = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Queue — Lamdis</title>
<style>`

const boardMid = `
.terms { margin: 0 0 .9rem; font-size: .82rem; line-height: 1.5; color: var(--ink-3); }
.amt .net { display: block; margin-top: .1rem; font: 500 .74rem/1 var(--mono);
  color: var(--ink-3); font-variant-numeric: tabular-nums; }
.holding {
  border: 1px solid #1C4530; border-radius: 3px; margin-bottom: 1.4rem;
  background: linear-gradient(180deg, #0A1711, var(--bg));
  padding: 1.05rem 1.1rem;
}
.holding h3 { margin: .5rem 0 .25rem; font: 600 1.05rem/1.25 var(--sans); letter-spacing: -.02em; }
.holding .clock { margin: 0 0 .9rem; color: var(--ink-2); font: 400 .82rem/1.4 var(--mono); }
.holding .acts { display: flex; gap: .5rem; }

.bid { display: grid; gap: .5rem; margin-top: .2rem; }
.bid-row { display: flex; gap: .45rem; align-items: stretch; }
.bid-row .cur {
  display: grid; place-items: center; width: 2.1rem; flex: none;
  border: 1px solid var(--rule-2); border-radius: 3px;
  background: var(--panel); color: var(--ink-3); font: 500 .9rem var(--mono);
}
.bid-row input { flex: 1; min-width: 0; font-family: var(--mono); }
.hint { margin: 0; font-size: .78rem; color: var(--ink-3); }
</style>`

const boardBody = `
<header class="top">
  <a class="mark" href="/board">lamdis<b>.</b></a>
  <div class="right">
    <span class="health"><span class="beacon off"></span><span id="h-text">&hellip;</span></span>
  </div>
</header>
<div class="shell">
  <nav class="rail">
    <span class="label grp">Work</span>
    <a href="/board" aria-current="page">Queue <span class="n hot" id="n-queue"></span></a>
    <a href="#holding">In flight <span class="n" id="n-flight"></span></a>
    <span class="label grp">Operation</span>
    <a href="/console">Earnings</a>
    <a href="/console#capacity">Capacity</a>
    <a href="/console#integration">Integration</a>
  </nav>
  <main class="main">
    <h1>Queue</h1>
    <p class="lead">Work dispatched by agents that you are eligible for.</p>
    <div class="strip" id="strip"></div>
    <div id="holding"></div>
    <h2>Available now</h2>
    <div id="terms-line"></div>
    <div class="rows" id="rows"><div class="empty">Loading&hellip;</div></div>
    <div id="verify"></div>
    <div class="err" id="verify-err"></div>
  </main>
</div>
<script>
"use strict";
`

const boardScript = `
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
function toMinor(t) {
  var c = String(t || "").replace(/[^0-9.]/g, "");
  if (!c) { return 0; }
  var n = Math.round(parseFloat(c) * 100);
  return isFinite(n) ? n : 0;
}
function left(iso) {
  var ms = new Date(iso) - new Date();
  if (isNaN(ms) || ms <= 0) { return "closed"; }
  var m = Math.round(ms / 60000);
  if (m < 60) { return m + "m"; }
  var h = Math.round(m / 60);
  return h < 48 ? h + "h" : Math.round(h / 24) + "d";
}
function kindLabel(k) {
  return k === "do" ? "Act" : (k === "review" ? "Verify" : "Check");
}

var WORK = [], WAITING = 0, HOLDING = [];

function renderHealth() {
  var el = document.getElementById("h-text");
  var b = document.querySelector(".beacon");
  if (signedIn()) {
    el.textContent = "Taking work";
    b.classList.remove("off");
  } else {
    el.textContent = "Not signed in";
    b.classList.add("off");
  }
}

function renderStrip() {
  var el = document.getElementById("strip");
  if (!signedIn()) {
    el.className = "strip warn";
    el.innerHTML = '<span class="d"></span><span><b>You are not signed in.</b> ' +
      'Sign in to take work and get paid &mdash; one email and a code. ' +
      '<a href="/signin?next=/board">Sign in</a></span>';
    return;
  }
  el.className = "strip";
  el.innerHTML = '<span class="d"></span><span>Taking work. ' +
    '<a href="/console">Your earnings</a> &middot; ' +
    '<a href="#" id="signout">Sign out</a></span>';
  var so = document.getElementById("signout");
  if (so) {
    so.addEventListener("click", function (e) {
      e.preventDefault(); clearSession(); renderHealth(); renderStrip(); load();
    });
  }
}

function renderHolding() {
  var host = document.getElementById("holding");
  document.getElementById("n-flight").textContent = HOLDING.length || "";
  if (!HOLDING.length) { host.innerHTML = ""; return; }
  host.innerHTML = '<h2 id="holding">In flight</h2>' + HOLDING.map(function (h) {
    var mins = Math.max(0, Math.round((new Date(h.expires) - new Date()) / 60000));
    return '<div class="holding">' +
      '<span class="chip ok">Yours</span>' +
      '<h3>' + esc(h.title) + '</h3>' +
      '<p class="clock">held for another ' + mins + ' min' +
        (h.where ? ' &middot; ' + esc(h.where) : '') + '</p>' +
      '<div class="acts">' +
        '<a class="btn go" href="' + esc(h.resume) + '">Carry on</a>' +
        '<button class="btn" data-give="' + esc(h.job) + '">Give it back</button>' +
      '</div>' +
      '<div class="err" id="g-' + esc(h.job) + '"></div>' +
    '</div>';
  }).join("");

  host.querySelectorAll("button[data-give]").forEach(function (b) {
    b.addEventListener("click", function () { giveBack(b, b.getAttribute("data-give")); });
  });
}

var PERSONAL = false, HIDDEN = 0, TERMS = null;

// What a listed figure actually becomes in your account.
//
// The board advertised a number and settlement paid a smaller one, with the
// difference explained nowhere. Showing the take-home next to the headline is
// the least a marketplace can do before somebody spends an afternoon earning
// it.
function takeHome(minor) {
  if (!TERMS || !TERMS.fee_bp || !minor) { return null; }
  return minor - Math.floor(minor * TERMS.fee_bp / 10000);
}

function termsLine() {
  if (!TERMS) { return ""; }
  var pct = (TERMS.fee_bp / 100);
  return '<p class="terms">The exchange keeps ' + pct + '% of what you earn. ' +
    'Earnings are paid out once they reach ' +
    money(TERMS.payout_threshold_minor, "usd") + ' \u2014 below that they stay ' +
    'in your account, because a transfer costs a flat fee either way.</p>';
}

function renderQueue() {
  var host = document.getElementById("rows");
  document.getElementById("n-queue").textContent = WORK.length || "";
  var ready = signedIn();

  document.getElementById("terms-line").innerHTML = termsLine();

  if (!WORK.length) {
    host.innerHTML = '<div class="empty">' + (HIDDEN
      ? HIDDEN + ' job' + (HIDDEN === 1 ? ' is' : 's are') + ' open, but ' +
        (HIDDEN === 1 ? 'it is' : 'none are') + ' within your range or ' +
        'qualifications. <a href="/console">Widen them</a>.'
      : 'No work in range right now. Jobs appear here as agents dispatch them.' +
        (signedIn()
          ? '<div style="margin-top:.8rem"><button class="btn go" id="want-alerts">' +
            'Email me when work appears</button>' +
            '<div class="err" id="alert-err"></div></div>'
          : "")) +
      '</div>';
  var wa = document.getElementById("want-alerts");
  if (wa) {
    wa.addEventListener("click", function () {
      var btn = this, err = document.getElementById("alert-err");
      btn.disabled = true;
      workerHeaders("PUT", "/v1/alerts").then(function (h) {
        return fetch("/v1/alerts?on=true", {method: "PUT", headers: h});
      }).then(function (r) { return r.json(); }).then(function (j) {
        err.className = "err ok";
        err.textContent = j.available
          ? "We will email you when work appears that you could take."
          : "Noted \u2014 email is not switched on yet, so this is recorded " +
            "rather than working.";
      }).catch(function () {
        btn.disabled = false;
        err.textContent = "Could not save that.";
      });
    });
  }
    return;
  }
  host.innerHTML = WORK.map(function (w) {
    var bidding = w.pricing === "bids";
    var facts = [];
    if (w.distance_miles) { facts.push('<b>' + w.distance_miles + ' mi</b>'); }
    // The exact address is released only once the job is taken.
    if (w.area) { facts.push(esc(w.area)); }
    if (w.skills && w.skills.length) { facts.push("needs " + w.skills.map(esc).join(", ")); }
    // A multi-day job has to look like one on the board, or somebody takes it
    // expecting an errand.
    // Say who is asking. A worker on the first marketplace of this shape had
    // no way to know whether an employer was a person or a pipeline.
    if (w.posted_by_agent) { facts.push("posted by an agent"); }
    if (w.stages && w.stages.length) {
      facts.push("<b>" + w.stages.length + " stages</b>, paid as you go");
    }
    if (w.work_hours >= 24) {
      facts.push(Math.round(w.work_hours / 24) + " day job");
    } else if (w.work_hours) {
      facts.push(w.work_hours + "h job");
    }
    if (bidding) { facts.push("you name the price"); }
    if (w.bonus_minor) { facts.push("+" + money(w.bonus_minor, w.currency) + " if the answer is yes"); }
    if (w.attempt_minor) { facts.push(money(w.attempt_minor, w.currency) + " if it is impossible"); }
    if (w.expense_cap_minor) { facts.push("expenses to " + money(w.expense_cap_minor, w.currency)); }

    if (w.practice) {
      facts.unshift('<b>practice run \u2014 not real work, pays nothing</b>');
    }
    var net = takeHome(w.pay_minor);
    var right = bidding
      ? '<span class="amt none">Your bid</span>'
      : '<span class="amt">' + money(w.pay_minor, w.currency) +
        (net !== null && net !== w.pay_minor
          ? '<span class="net">' + money(net, w.currency) + ' to you</span>'
          : "") + '</span>';

    var action = bidding
      ? '<button class="btn sm" data-open="' + esc(w.job) + '">Bid</button>'
      : '<button class="btn sm" data-job="' + esc(w.job) + '"' + (ready ? "" : " disabled") + '>Take</button>';

    return '<div class="r">' +
      '<div class="grow">' +
        '<div class="t"><span class="chip hot">' + kindLabel(w.kind) + '</span>' +
          esc(w.kind === "do" && w.instructions ? w.instructions : w.title) + '</div>' +
        '<div class="m">' + facts.join(" &middot; ") + '</div>' +
        // What the work is and what would prove it. Both used to be withheld
        // from the board, which meant nobody could price the job they were
        // being asked to bid on.
        (w.deliverable ? '<div class="dv">Proof: ' + esc(w.deliverable) + '</div>' : "") +
        (w.brief ? '<div class="bf">' + esc(w.brief) + '</div>' : "") +
        (w.withheld ? '<div class="wh">' + esc(w.withheld) + '</div>' : "") +
        '<div class="bid" id="bid-' + esc(w.job) + '" hidden>' +
          '<div class="bid-row">' +
            '<span class="cur">$</span>' +
            '<input type="text" inputmode="decimal" placeholder="45.00" data-bid="' + esc(w.job) + '">' +
            '<button class="btn go sm" data-place="' + esc(w.job) + '">Place bid</button>' +
          '</div>' +
          '<input type="text" maxlength="140" placeholder="How you would do it (optional)" data-note="' + esc(w.job) + '">' +
          askUnknowns(w) +
          '<p class="hint">You are naming your own price. Nobody has told you a budget, ' +
            'and other bids are not shown.</p>' +
        '</div>' +
      '</div>' +
      right +
      '<span class="when">' + left(w.expires) + '</span>' +
      action +
      '<div class="err" id="e-' + esc(w.job) + '"></div>' +
    '</div>';
  }).join("");

  host.querySelectorAll("button[data-job]").forEach(function (b) {
    b.addEventListener("click", function () { takeJob(b, b.getAttribute("data-job")); });
  });
  host.querySelectorAll("button[data-open]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!signedIn()) { goSignIn(); return; }
      var box = document.getElementById("bid-" + b.getAttribute("data-open"));
      box.hidden = !box.hidden;
      if (!box.hidden) { box.querySelector("input").focus(); }
    });
  });
  host.querySelectorAll("button[data-place]").forEach(function (b) {
    b.addEventListener("click", function () { placeBid(b, b.getAttribute("data-place")); });
  });
}

function renderVerify() {
  var host = document.getElementById("verify");
  if (!WAITING) { host.innerHTML = ""; return; }
  host.innerHTML = '<h2>Verification</h2><div class="rows"><div class="r">' +
    '<div class="grow"><div class="t"><span class="chip hot">' + WAITING + ' waiting</span>' +
      "Check another operator&rsquo;s evidence</div>" +
    '<div class="m">about a minute &middot; assigned, never chosen</div></div>' +
    '<button class="btn" id="verify-next">Verify next</button></div></div>';
  document.getElementById("verify-next").addEventListener("click", function () {
    post(this, document.getElementById("verify-err"), "/v1/workers/assign");
  });
}

function post(button, errEl, path, body) {
  if (!signedIn()) { goSignIn(); return; }
  button.disabled = true;
  var was = button.textContent;
  button.textContent = "Working…";
  if (errEl) { errEl.textContent = ""; errEl.className = "err"; }

  workerHeaders("POST", path).then(function (h) {
    if (body) { h["Content-Type"] = "application/json"; }
    return fetch(path, {method: "POST", headers: h, body: body ? JSON.stringify(body) : undefined});
  }).then(function (r) {
    return r.json().then(function (j) { return {ok: r.ok, status: r.status, body: j}; });
  }).then(function (res) {
    if (handleAuthFailure(res.status)) { return; }
    if (!res.ok) { throw new Error(res.body && res.body.error || "that did not work"); }
    if (res.body.url) { window.location.href = res.body.url; return; }
    button.textContent = "Done";
    load();
  }).catch(function (e) {
    if (errEl) { errEl.textContent = e.message; }
    button.disabled = false;
    button.textContent = was;
  });
}

function takeJob(button, job) {
  post(button, document.getElementById("e-" + job), "/v1/workers/claim/" + encodeURIComponent(job));
}

// askUnknowns renders a field per thing the buyer said they do not know.
//
// A price on a job whose dimensions nobody has established is a guess, and the
// argument about it happens on site. Asking here costs one line each and makes
// the offer mean something.
function askUnknowns(w) {
  var us = w.unknowns || [];
  if (!us.length) { return ""; }
  return '<div class="unk">' +
    '<p class="unk-h">The buyer does not know these. Say what you priced on.</p>' +
    us.map(function (u, i) {
      return '<label class="unk-r">' +
        '<span>' + esc(u.name) + (u.unit ? ' <i>(' + esc(u.unit) + ')</i>' : "") + '</span>' +
        (u.note ? '<span class="unk-n">' + esc(u.note) + '</span>' : "") +
        '<input type="text" maxlength="60" placeholder="what you assumed" ' +
          'data-unk="' + esc(w.job) + '" data-unk-i="' + i + '" ' +
          'data-unk-name="' + esc(u.name) + '">' +
        '<label class="unk-f"><input type="checkbox" data-unkfirm="' + esc(w.job) +
          '" data-unk-i="' + i + '" checked> price holds at this figure</label>' +
      '</label>';
    }).join("") +
    '</div>';
}

function readAssumptions(job) {
  var out = [];
  document.querySelectorAll('[data-unk="' + job + '"]').forEach(function (el) {
    var i = el.getAttribute("data-unk-i");
    var firm = document.querySelector(
      '[data-unkfirm="' + job + '"][data-unk-i="' + i + '"]');
    out.push({
      name: el.getAttribute("data-unk-name"),
      value: el.value.trim(),
      firm: !!(firm && firm.checked)
    });
  });
  return out;
}

function placeBid(button, job) {
  var amount = toMinor(document.querySelector('[data-bid="' + job + '"]').value);
  var note = (document.querySelector('[data-note="' + job + '"]') || {}).value || "";
  var err = document.getElementById("e-" + job);
  if (amount <= 0) { err.textContent = "Enter what you would charge."; return; }
  var assumptions = readAssumptions(job);
  // Caught here as well as on the server, because being told what is missing
  // while the form is still in front of you is the difference between a fix
  // and a re-entry.
  var blank = assumptions.filter(function (a) { return !a.value; });
  if (blank.length) {
    err.textContent = "Say what you priced on for: " +
      blank.map(function (a) { return a.name; }).join(", ") + ".";
    return;
  }
  post(button, err, "/v1/workers/bid/" + encodeURIComponent(job),
       {amount_minor: amount, note: note, assumptions: assumptions});
}

function giveBack(button, job) {
  post(button, document.getElementById("g-" + job),
       "/v1/workers/giveback/" + encodeURIComponent(job));
}

function load() {
  if (signedIn()) {
    workerHeaders("GET", "/v1/workers/holdings")
      .then(function (h) { return fetch("/v1/workers/holdings", {headers: h}); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) { HOLDING = (b && b.holding) || []; renderHolding(); })
      .catch(function () { HOLDING = []; renderHolding(); });
  } else {
    HOLDING = []; renderHolding();
  }

  (signedIn()
    ? workerHeaders("GET", "/v1/board").then(function (h) { return fetch("/v1/board", {headers: h}); })
    : fetch("/v1/board"))
    .then(function (r) { return r.json(); })
    .then(function (b) {
      WORK = (b && b.work) || [];
      WAITING = (b && b.reviews_waiting) || 0;
      PERSONAL = !!(b && b.personalized);
      TERMS = (b && b.terms) || null;
      HIDDEN = (b && b.filtered_out) || 0;
      renderQueue();
      renderVerify();
    })
    .catch(function () {
      document.getElementById("rows").innerHTML =
        '<div class="empty">Could not reach the exchange.</div>';
    });
}

session().then(function () {
  renderHealth();
  renderStrip();
  load();
});
setInterval(load, 20000);
</script>
`
