package api

// workPageHTML is what a person sees after claiming a task.
//
// It has to work on a phone standing in a street, so it does the minimum: what
// to look at, the code to get in frame, and one button that opens the camera.
// The file input is a plain multipart upload rather than anything clever,
// because the original bytes are the evidence — a canvas re-encode would strip
// the EXIF that lets the verifier tell a photograph taken here today from one
// taken somewhere else last year.
const workPageHTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lamdis — your task</title>
<style>` + themeCSS + `
.job { max-width: 34rem; margin: 0 auto; }
main { padding: 1.1rem 1rem 3rem; }
@media (min-width: 40rem) { main { padding: 1.6rem 1.25rem 4rem; } }
.top .back { font-size: .84rem; color: var(--ink-2); text-decoration: none; }
.top .back:hover { color: var(--ink); }
.code-card {
  margin: 1.1rem 0; padding: 1.2rem 1rem; text-align: center;
  border: 1px dashed var(--rule-2); border-radius: 3px; background: var(--panel);
}
.code-card .big {
  display: block; margin: .45rem 0 .4rem;
  font: 700 2.3rem/1 var(--mono); letter-spacing: .26em; text-indent: .26em;
  color: var(--gold);
}
.code-card p { margin: 0; font-size: .83rem; color: var(--ink-3); }
.drop {
  display: grid; place-items: center; gap: .35rem;
  min-height: 7rem; padding: 1.1rem; cursor: pointer; text-align: center;
  border: 1px dashed var(--rule-2); border-radius: 3px; background: var(--panel);
  color: var(--ink-2);
}
.drop:hover { border-color: var(--ink-3); color: var(--ink); }
.drop .big { font-weight: 600; color: var(--ink); }
.drop .sm { font-size: .8rem; color: var(--ink-3); }
input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; }
img#preview { width: 100%; border-radius: 3px; border: 1px solid var(--rule);
  display: none; margin-bottom: .8rem; }
.done-card { padding: 1.6rem 1.2rem; text-align: center;
  border: 1px solid #1C4530; border-radius: 3px; background: linear-gradient(180deg,#0A1711,var(--bg)); }
.next { color: var(--gold); font-weight: 600; }
.ask { display: block; margin: .1rem 0 .35rem; font: 600 .82rem/1.3 var(--sans); }
textarea { width: 100%; box-sizing: border-box; padding: .55rem .6rem;
  border: 1px solid var(--rule-2); border-radius: 4px; background: var(--bg);
  color: var(--ink); font: inherit; font-size: .9rem; resize: vertical; }
textarea:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
.ask-acts { display: flex; gap: .5rem; margin-top: .5rem; }
.stage { margin: 1rem 0; padding: .9rem 1rem; border-left: 2px solid var(--gold);
  background: var(--panel); border-radius: 0 3px 3px 0; }
.stage-of { font: 600 .72rem/1 var(--sans); letter-spacing: .09em;
  text-transform: uppercase; color: var(--ink-3); }
.attempt { margin: 1rem 0; padding: .85rem .9rem; border: 1px dashed var(--rule-2);
  border-radius: 3px; background: var(--panel); }
.sha { margin-top: .6rem; font: 400 .72rem/1.4 var(--mono); color: var(--ink-3); word-break: break-all; }
</style>
<header class="top">
  <a class="mark" href="/board">lamdis<b>.</b></a>
  <div class="right"><a class="back" href="/how-it-works">How this works</a>
    <a class="back" href="/board">&larr; Board</a></div>
</header>
<main id="app"><p style="color:var(--ink-3)">Loading&hellip;</p></main>
<script>
"use strict";

// The secret arrived in the fragment, which browsers never send to a server.
// Read it, then remove it from the address bar so a screenshot or a shared URL
// does not carry it.
var JOB = location.pathname.split("/").filter(Boolean).pop();
var SECRET = location.hash.slice(1);

// Stripping the code from the address bar keeps it out of screenshots and
// shared URLs. On its own it also made a reload or a back-button press into a
// dead end: the code was gone, and the page told the worker to open a link
// they no longer had.
//
// Holding it in sessionStorage survives both, and dies with the tab. It is a
// real widening — anything running in this origin can read it — accepted
// because the alternative was losing a job halfway through, standing outside,
// with no way back in.
var STASH = "lamdis.work." + JOB;
try {
  if (SECRET) { sessionStorage.setItem(STASH, SECRET); }
  else { SECRET = sessionStorage.getItem(STASH) || ""; }
} catch (e) { /* private mode: the link still works, a reload will not */ }
if (location.hash) { history.replaceState(null, "", location.pathname); }

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function showOutcome(b, sha) {
  try { sessionStorage.removeItem(STASH); } catch (e) {}
  var paid = b.amount_minor ? money(b.amount_minor, b.currency || "usd") : null;
  var accepted = b.status === "accepted" || b.status === "attempt recorded";
  var pending = !accepted && !b.why;
  document.getElementById("app").innerHTML =
    '<div class="done-card">' +
      '<span class="chip ' + (accepted ? "ok" : (pending ? "" : "bad")) + '">' +
        (accepted ? "Accepted" : (pending ? "Submitted" : "Not accepted")) + '</span>' +
      '<h1 style="margin:.7rem 0 .3rem">' +
        (accepted ? (paid ? paid + " earned" : "Accepted")
                  : (pending ? "Sent for checking" : "This one did not pass")) + '</h1>' +
      '<p class="lead" style="margin-bottom:1.1rem">' +
        (accepted
          ? "It is in your account. Payouts follow your payout setting."
          : (pending
              ? "You will be paid once the evidence is accepted. Your account shows the outcome."
              : esc(b.why) +
                " You are still here \u2014 you can take the job again and reshoot.")) +
      '</p>' +
      '<a class="btn go" href="/board">' +
        (accepted ? "Take another job" : "Back to the board") + '</a>' +
      '<div class="sha">' + esc(sha || "") + '</div>' +
    '</div>';
}

function money(m, cur) {
  var sign = m < 0 ? "-" : "", v = Math.abs(m || 0);
  var sym = (cur || "USD") === "USD" ? "$" : cur + " ";
  return sign + sym + Math.floor(v / 100) + "." + String(v % 100).padStart(2, "0");
}

// SHA-256 by hand: crypto.subtle is unavailable on plain HTTP, which is
// exactly how this page gets served on a local network.
function sha256Hex(bytes) {
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var l = bytes.length, withOne = l + 1;
  var padded = new Uint8Array(Math.ceil((withOne + 8) / 64) * 64);
  padded.set(bytes); padded[l] = 0x80;
  var bits = l * 8;
  var dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bits >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bits / 4294967296));
  var w = new Uint32Array(64);
  function rr(x, n) { return (x >>> n) | (x << (32 - n)); }
  for (var i = 0; i < padded.length; i += 64) {
    for (var t = 0; t < 16; t++) { w[t] = dv.getUint32(i + t * 4); }
    for (t = 16; t < 64; t++) {
      var s0 = rr(w[t-15],7) ^ rr(w[t-15],18) ^ (w[t-15] >>> 3);
      var s1 = rr(w[t-2],17) ^ rr(w[t-2],19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (t = 0; t < 64; t++) {
      var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
      var mj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + mj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  return H.map(function (x) { return ("00000000" + x.toString(16)).slice(-8); }).join("");
}

function hmacHex(keyStr, msgStr) {
  var enc = new TextEncoder();
  var key = enc.encode(keyStr);
  if (key.length > 64) { key = hexToBytes(sha256Hex(key)); }
  var k = new Uint8Array(64); k.set(key);
  var ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (var i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
  var msg = enc.encode(msgStr);
  var inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  var innerHash = hexToBytes(sha256Hex(inner));
  var outer = new Uint8Array(64 + 32);
  outer.set(opad); outer.set(innerHash, 64);
  return sha256Hex(outer);
}
function hexToBytes(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) { out[i] = parseInt(hex.substr(i * 2, 2), 16); }
  return out;
}

// The same signing input the Ed25519 scheme uses, so this path inherits its
// replay and tamper properties rather than inventing weaker ones. The headers
// match the reviewer surface exactly.
function authHeaders(method, path, bodyBytes) {
  var ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  var bodyHash = sha256Hex(bodyBytes || new Uint8Array(0));
  var mac = hmacHex(SECRET, method + "\n" + path + "\n" + ts + "\n" + bodyHash);
  return { "X-Lamdis-Timestamp": ts, "X-Lamdis-Capability": JOB + "." + mac };
}

var BRIEF = null;

function load() {
  if (!SECRET) {
    fail("This page is missing its access code \u2014 that happens if the link was " +
      "retyped or opened in a new tab. The job is still yours: open it again from " +
      "the board.");
    return;
  }
  var path = "/v1/work/" + encodeURIComponent(JOB);
  fetch(path, { headers: authHeaders("GET", path, null) })
    .then(function (r) { if (!r.ok) { throw new Error("This link is not valid any more."); } return r.json(); })
    .then(function (b) { BRIEF = b; render(); })
    .catch(function (e) { fail(e.message); });
}

function fail(msg) {
  document.getElementById("app").innerHTML =
    '<div class="done-card" style="border-color:var(--rule-2);background:var(--panel)">' +
      '<p class="lead" style="margin:0 0 1rem">' + esc(msg) + '</p>' +
      '<a class="btn" href="/board">Back to the queue</a></div>';
}

function render() {
  var b = BRIEF;
  document.getElementById("app").innerHTML = '' +
    '<span class="chip hot">' + (b.kind === "do" ? "Act" : "Check") + '</span>' +
    '<h1 style="margin-top:.6rem">' + esc(b.title) + '</h1>' +
    (b.where ? '<p class="lead">' + esc(b.where) + '</p>' : '') +
    '<dl class="metrics" style="grid-template-columns:1fr 1fr">' +
      '<div class="metric money"><dt>You get paid</dt><dd>' + money(b.pay_minor, b.currency) + '</dd></div>' +
      (b.bonus_minor
        ? '<div class="metric"><dt>Bonus if the answer is yes</dt><dd>+' + money(b.bonus_minor, b.currency) + '</dd></div>'
        : '<div class="metric"><dt>Bring back</dt><dd style="font-size:.95rem">' +
            esc(b.deliverable || "a clear photo") + '</dd></div>') +
    '</dl>' +
    '<div class="code-card">' +
      '<span class="label">Write this where the camera can see it</span>' +
      '<span class="big">' + esc(b.challenge) + '</span>' +
      '<p>Paper, a phone screen, anything. It proves the photo was taken now, for ' +
        'this job.</p>' +
    '</div>' +
    '<img id="preview" alt="">' +
    '<label class="drop" for="f">' +
      '<span class="big">Take a photo</span>' +
      '<span class="sm">Or choose one from your camera roll</span>' +
    '</label>' +
    '<input id="f" type="file" accept="image/*,video/mp4" capture="environment">' +
    '<p style="margin-top:.8rem"><button class="btn go wide" id="send" disabled>Submit</button></p>' +
    '<div class="err" id="err"></div>' +
    (BRIEF.stage
      ? '<div class="stage">' +
          '<div class="stage-of">Stage ' + esc(BRIEF.stage_of) + '</div>' +
          '<h2 style="margin:.15rem 0 .3rem">' + esc(BRIEF.stage) + '</h2>' +
          '<p class="note" style="margin:0">Photograph ' + esc(BRIEF.stage_proves) +
            '. This stage pays ' + money(BRIEF.stage_pay_minor, BRIEF.currency) +
            ' on its own \u2014 you do not wait for the whole job.</p>' +
        '</div>'
      : "") +
    '<div class="attempt">' +
      '<button type="button" class="btn" id="cant">I went, but this cannot be done</button>' +
      '<div id="cant-box" hidden>' +
        '<label class="ask" for="cant-why">What stopped you?</label>' +
        '<textarea id="cant-why" rows="2" placeholder="The gate was padlocked and nobody answered."></textarea>' +
        '<div class="ask-acts">' +
          '<button type="button" class="btn go" id="cant-ok">Mark as an attempt</button>' +
          '<button type="button" class="btn" id="cant-no">Cancel</button>' +
        '</div>' +
      '</div>' +
      '<p class="note" style="margin:.5rem 0 0">Photograph what stopped you, with the ' +
        'code in frame. You are paid the attempt fee rather than the full amount.</p>' +
      '<p class="note next" id="cant-next" hidden></p>' +
    '</div>' +
    (BRIEF.tier === "V2" || BRIEF.tier === "V3"
      ? '<p class="note"><b>Location must be on.</b> This job needs photographs ' +
        'that record where and when they were taken. Take them in the camera app ' +
        'with location enabled \u2014 a picture sent through a messaging app has ' +
        'that stripped and will be refused.</p>'
      : "") +
    '<p class="note">Your photo uploads exactly as your camera saved it. You are paid ' +
      'for a usable submission &mdash; the answer does not have to be the one anyone ' +
      'hoped for.</p>';

  var cant = document.getElementById("cant");
  var cantBox = document.getElementById("cant-box");
  if (cant && cantBox) {
    cant.addEventListener("click", function () {
      cantBox.hidden = false;
      cant.hidden = true;
      document.getElementById("cant-why").focus();
    });
    document.getElementById("cant-no").addEventListener("click", function () {
      cantBox.hidden = true;
      cant.hidden = false;
    });
    document.getElementById("cant-ok").addEventListener("click", function () {
      var why = document.getElementById("cant-why").value.trim();
      if (!why) { document.getElementById("cant-why").focus(); return; }
      window.__lamdisAttempt = true;
      window.__lamdisAttemptWhy = why;
      cantBox.hidden = true;
      cant.hidden = false;
      cant.textContent = "Attempt: " + (why.length > 40 ? why.slice(0, 40) + "\u2026" : why);
      cant.disabled = true;

      // Marking an attempt is not submitting one. It still needs a photograph
      // of whatever stopped you, and saying so here is the difference between
      // a flow that continues and a page that appears to have done nothing.
      var send = document.getElementById("send");
      if (send) { send.textContent = "Submit attempt"; }
      var note = document.getElementById("cant-next");
      if (note) {
        note.hidden = false;
        note.textContent = "Now photograph what stopped you, with the code in " +
          "frame, and send it. Without a photo nothing is submitted.";
      }
      var input = document.getElementById("f");
      if (input) { input.click(); }
    });
  }
  var input = document.getElementById("f");
  var send = document.getElementById("send");
  var chosen = null;

  input.addEventListener("change", function () {
    chosen = input.files && input.files[0];
    if (!chosen) { return; }
    var img = document.getElementById("preview");
    img.src = URL.createObjectURL(chosen);
    img.style.display = "block";
    send.disabled = false;
    document.querySelector("label.file").textContent = "Choose a different photo";
  });

  send.addEventListener("click", function () {
    if (!chosen) { return; }
    send.disabled = true;
    send.textContent = "Uploading…";
    document.getElementById("err").textContent = "";

    // Read the file into memory so the exact bytes can be hashed into the
    // signature and sent unchanged. No canvas, no re-encode: the EXIF is
    // evidence.
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      var attempted = !!window.__lamdisAttempt;
      var path = "/v1/work/" + encodeURIComponent(JOB) + "/evidence";
      var h = authHeaders("POST", path, bytes);
      h["Content-Type"] = "application/octet-stream";
      fetch(path, { method: "POST", headers: h, body: bytes })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) { throw new Error(res.body && res.body.error || "upload failed"); }
          // Uploading is not submitting. Without this second call the file sat
          // on the server unclaimed forever: the worker saw a success screen,
          // no submission was ever created, nothing was verified, and nobody
          // was ever paid.
          send.textContent = "Checking\u2026";
          var sub = "/v1/work/" + encodeURIComponent(JOB) + "/submit";
          var claim = attempted
            ? JSON.stringify({attempted: true, why: window.__lamdisAttemptWhy || ""})
            : null;
          var payload = claim ? new TextEncoder().encode(claim) : new Uint8Array(0);
          var hs = authHeaders("POST", sub, payload);
          if (claim) { hs["Content-Type"] = "application/json"; }
          return fetch(sub, { method: "POST", headers: hs, body: claim })
            .then(function (r) {
              return r.json().then(function (j) { return { ok: r.ok, body: j, sha: res.body.sha256 }; });
            });
        })
        .then(function (res) {
          if (!res.ok) { throw new Error(res.body && res.body.error || "could not submit"); }
          showOutcome(res.body, res.sha);
        })
        .catch(function (e) {
          document.getElementById("err").textContent = e.message;
          send.disabled = false;
          send.textContent = "Submit";
        });
    };
    reader.onerror = function () {
      document.getElementById("err").textContent = "Could not read that file.";
      send.disabled = false;
      send.textContent = "Submit";
    };
    reader.readAsArrayBuffer(chosen);
  });
}

load();
</script>
`
