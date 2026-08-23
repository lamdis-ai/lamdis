package api

import "io"

func readAllLimited(r io.Reader, n int64) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, n))
}

// reviewPageHTML is the page a reviewer opens on their phone.
//
// The secret arrives in the URL fragment, which the browser never transmits,
// and the page erases it from the address bar immediately so it does not
// survive in history or in a shared screenshot. Everything after that is one
// fetch to read the brief and one to answer.
//
// It asks for a reason before it will accept an answer, because a review with
// no reason is indistinguishable from a click, and the contract pays for
// looking rather than for clicking.
var reviewPageHTML = reviewPageTop + workerJS + reviewPageScript

const reviewPageTop = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review request</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#020617; color:#e2e8f0;
         font:17px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  main { max-width:34rem; margin:0 auto; padding:1.25rem 1.25rem 4rem; }
  h1 { font-size:1.05rem; font-weight:600; color:#94a3b8; letter-spacing:.02em;
       text-transform:uppercase; margin:0 0 1.25rem; }
  .q { font-size:1.35rem; line-height:1.35; font-weight:600; margin:0 0 .75rem; }
  .ctx { color:#94a3b8; margin:0 0 1.25rem; }
  .pay { display:flex; gap:1.5rem; padding:.9rem 1rem; background:#0f172a;
         border:1px solid #1e293b; border-radius:.6rem; margin:0 0 1.25rem; }
  .pay div { flex:1 }
  .pay dt { font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; color:#64748b; }
  .pay dd { margin:.15rem 0 0; font-size:1.15rem; font-variant-numeric:tabular-nums; }
  img { width:100%; border-radius:.6rem; border:1px solid #1e293b; display:block;
        margin-bottom:1rem; background:#0f172a; min-height:8rem; }
  textarea { width:100%; box-sizing:border-box; min-height:5.5rem; padding:.75rem;
             background:#0f172a; color:#e2e8f0; border:1px solid #1e293b;
             border-radius:.6rem; font:inherit; resize:vertical; }
  .row { display:flex; gap:.6rem; margin:1rem 0 .6rem; }
  button { flex:1; min-height:3.1rem; font:600 1rem/1 inherit; color:#e2e8f0;
           background:#1e293b; border:1px solid #334155; border-radius:.6rem;
           cursor:pointer; transition:filter .15s; }
  button:hover:not(:disabled) { filter:brightness(1.25) }
  button:disabled { opacity:.45; cursor:not-allowed }
  button.yes { background:#14532d; border-color:#166534 }
  button.no  { background:#4c1d1d; border-color:#7f1d1d }
  .unsure { width:100%; min-height:2.6rem; background:transparent; border-style:dashed }
  .note { color:#64748b; font-size:.85rem; margin-top:.75rem }
  .done { padding:1.25rem; background:#0f172a; border:1px solid #1e293b;
          border-radius:.6rem; text-align:center }
  .err { color:#fca5a5; margin-top:.75rem; min-height:1.2rem }
  .muted { color:#64748b }

  /* A page that never says what it is, is a page nobody trusts with a
     photograph of somebody's property. The header does that in two lines. */
  .hd { display:flex; gap:.7rem; align-items:center; margin:0 0 1.5rem;
        padding-bottom:1rem; border-bottom:1px solid #1e293b }
  .mark { width:2rem; height:2rem; flex:none; border-radius:.45rem;
          background:linear-gradient(140deg,#38bdf8,#6366f1); color:#020617;
          font:700 1.1rem/2rem ui-sans-serif,sans-serif; text-align:center }
  .brand { margin:0; font-weight:650; letter-spacing:-.01em }
  .kicker { margin:.1rem 0 0; font-size:.8rem; color:#64748b; line-height:1.35 }

  /* Loading was the word "Loading". A shape that resembles the answer reads
     as a page that is working rather than one that has stopped. */
  .sk { background:#0f172a; border-radius:.5rem; margin-bottom:.8rem;
        animation:pulse 1.4s ease-in-out infinite }
  .sk-q { height:2.6rem } .sk-c { height:1.2rem; width:70% } .sk-img { height:11rem }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }

  .demo { display:flex; gap:.6rem; padding:.7rem .85rem; margin:0 0 1.1rem;
          background:#1c1917; border:1px solid #44403c; border-left:3px solid #f59e0b;
          border-radius:.5rem; font-size:.86rem; color:#d6d3d1 }
  .steps { list-style:none; margin:0 0 1.25rem; padding:0; counter-reset:s }
  .steps li { position:relative; padding:0 0 .55rem 1.7rem; font-size:.86rem;
              color:#94a3b8; counter-increment:s }
  .steps li::before { content:counter(s); position:absolute; left:0; top:.05rem;
        width:1.15rem; height:1.15rem; border-radius:50%; background:#1e293b;
        color:#94a3b8; font-size:.68rem; font-weight:700; text-align:center;
        line-height:1.15rem }
  .steps li.now { color:#e2e8f0 }
  .steps li.now::before { background:#38bdf8; color:#020617 }

  .prog { display:flex; gap:.3rem; margin:0 0 1.25rem }
  .prog span { flex:1; height:.28rem; border-radius:.15rem; background:#1e293b }
  .prog span.in { background:#38bdf8 }
  .prog span.you { background:#facc15 }

  .look { margin:0 0 .6rem; font-size:.82rem; color:#64748b }
  figure { margin:0 0 1rem }
  figcaption { font-size:.78rem; color:#64748b; margin-top:-.6rem }

  details { margin:1.25rem 0 0; border-top:1px solid #1e293b; padding-top:.9rem }
  summary { cursor:pointer; color:#94a3b8; font-size:.86rem; list-style:none }
  summary::-webkit-details-marker { display:none }
  summary::before { content:"›"; display:inline-block; margin-right:.4rem;
                    transition:transform .15s }
  details[open] summary::before { transform:rotate(90deg) }
  details p { font-size:.84rem; color:#64748b; margin:.7rem 0 0 }
  .empty { padding:1.5rem 1.25rem; background:#0f172a; border:1px solid #1e293b;
           border-radius:.6rem }
  .empty h2 { margin:0 0 .5rem; font-size:1.05rem }
  .empty p { margin:0 0 .7rem; color:#94a3b8; font-size:.9rem }
  .empty a { color:#7dd3fc }
</style>
<main>
  <header class="hd">
    <div class="mark" aria-hidden="true">L</div>
    <div>
      <p class="brand">Lamdis</p>
      <p class="kicker">A person is being asked, because software was not sure</p>
    </div>
  </header>
  <div id="app" class="skel" aria-live="polite">
    <div class="sk sk-q"></div><div class="sk sk-c"></div><div class="sk sk-img"></div>
  </div>
</main>
<script>
`

const reviewPageScript = `
(function () {
  // The secret is in the fragment, which never reaches the server. Take it,
  // then erase it from the address bar so it does not linger in history.
  var secret = location.hash.slice(1);
  var job = location.pathname.split("/").pop();
  if (secret) history.replaceState(null, "", location.pathname);

  var app = document.getElementById("app");
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (m, cur) {
    var sign = m < 0 ? "-" : ""; m = Math.abs(m);
    return sign + (cur === "USD" ? "$" : cur + " ") +
      Math.floor(m / 100) + "." + String(m % 100).padStart(2, "0");
  };

  // SHA-256 and HMAC, implemented here rather than taken from the browser.
  //
  // WebCrypto (crypto.subtle) only exists in a secure context: HTTPS, or
  // localhost. A reviewer opening a link on their phone over the local
  // network is on plain HTTP, so it is simply absent — which is the one
  // situation this page exists for. Sixty lines of arithmetic removes the
  // dependency entirely and works the same everywhere.
  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

  function sha256(bytes) {
    var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
             0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var len = bytes.length;
    // Pad: a 1 bit, then zeros, then the length in bits as a 64-bit big-endian.
    var withPad = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    withPad.set(bytes);
    withPad[len] = 0x80;
    var bits = len * 8;
    var dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, bits >>> 0, false);
    dv.setUint32(withPad.length - 8, Math.floor(bits / 4294967296), false);

    var w = new Uint32Array(64);
    var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };

    for (var off = 0; off < withPad.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
        var s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh=g; g=f; f=e; e=(d + t1) >>> 0; d=c; c=b; b=a; a=(t1 + t2) >>> 0;
      }
      h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
      h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (var j = 0; j < 8; j++) odv.setUint32(j * 4, h[j], false);
    return out;
  }

  function hmacSha256(keyBytes, msgBytes) {
    var block = new Uint8Array(64);
    if (keyBytes.length > 64) block.set(sha256(keyBytes));
    else block.set(keyBytes);
    var inner = new Uint8Array(64 + msgBytes.length);
    var outer = new Uint8Array(64 + 32);
    for (var i = 0; i < 64; i++) {
      inner[i] = block[i] ^ 0x36;
      outer[i] = block[i] ^ 0x5c;
    }
    inner.set(msgBytes, 64);
    outer.set(sha256(inner), 64);
    return sha256(outer);
  }

  var enc = new TextEncoder();
  function hex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }

  // The signing input is identical to the one the Ed25519 scheme uses, so the
  // binding to method, path, time and body is the same.
  function mac(method, path, ts, bodyText) {
    var digest = hex(sha256(enc.encode(bodyText || "")));
    var input = method + "\n" + path + "\n" + ts + "\n" + digest;
    return hex(hmacSha256(enc.encode(secret), enc.encode(input)));
  }

  function stamp() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

  async function call(method, path, body) {
    var text = body ? JSON.stringify(body) : "";
    var ts = stamp();
    var proof = mac(method, path, ts, text);
    var res = await fetch(path, {
      method: method,
      headers: {
        "X-Lamdis-Timestamp": ts,
        "X-Lamdis-Capability": job + "." + proof,
        "Content-Type": "application/json"
      },
      body: body ? text : undefined
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, data: data };
  }

  // The panel, drawn so somebody who has never seen this page knows within a
  // few seconds what they are being asked and why it is them being asked.
  //
  // What was here before was a question, a price, a photograph and two buttons.
  // Everything true about the situation — that a machine tried first and was
  // not sure, that two other people are being asked the same thing, that
  // nobody sees anyone else's answer, that saying "I cannot tell" is paid the
  // same — was known to the server and shown to nobody.
  // wireNext arms the "verify another" button, wherever it appears.
  //
  // Two pages need it — the thank-you after an answer, and a link that has
  // already closed — and the second one is exactly where somebody is most
  // likely to leave. Duplicating it was how one copy kept a bug the other
  // had lost.
  function wireNext() {
    var btn = document.getElementById("next");
    if (!btn) { return; }
    btn.onclick = function () {
        var b = this, e = document.getElementById("nexterr");
        b.disabled = true; b.textContent = "Finding one…"; e.textContent = "";
        // A hard ceiling on how long "Finding one…" may sit there. Even if a
        // fetch never settles, the person gets an answer and a working button.
        var wedged = setTimeout(function () {
          if (!b.disabled) { return; }
          e.textContent = "That is taking too long. Try again.";
          b.disabled = false; b.textContent = "Verify another";
        }, 12000);
        var release = function () { clearTimeout(wedged); };
        // The next panel is assigned, exactly as this one was. There is no
        // path here that lets a reviewer pick.
        // session(), not enrol(). There has never been an enrol() in this
        // page's scope, so this line threw a ReferenceError synchronously —
        // before the .catch below was ever attached — and the throw escaped
        // the click handler with the button already disabled. The reviewer
        // was left on "Finding one…" forever, with nothing logged and no way
        // back except reloading. Every promise chain reachable from a click
        // is now started inside a try, so a bad identifier degrades to a
        // message instead of wedging the page.
        Promise.resolve()
          .then(function () { return session(); })
          .then(function (who) {
            if (!who) { throw new Error("signed out"); }
            return workerHeaders("POST", "/v1/workers/assign");
          })
          .then(function (h) { return fetch("/v1/workers/assign", {method:"POST", headers:h}); })
          .then(function (r) { return r.json().then(function (j) { return {ok:r.ok, body:j}; }); })
          .then(function (res) {
            if (!res.ok) { throw new Error("none"); }
            release();
            window.location.href = res.body.url;
          })
          .catch(function (err) {
            release();
            // Two different failures used to read identically, and both left
            // the button dead. Somebody signed out was told there was no work
            // — which is false, and sends them away instead of to sign-in.
            if (err && err.message === "signed out") {
              e.innerHTML = 'Your session ended. ' +
                '<a href="/signin?next=/board">Sign in</a> to keep verifying.';
            } else {
              e.textContent = "Nothing more to verify right now. Check back shortly.";
            }
            // Re-enabled, always. A button that disables itself on a
            // transient failure makes a refresh the only way forward, and
            // most people read that as the site being broken.
            b.disabled = false; b.textContent = "Verify another";
          });
    };
  }

  function render(brief) {
    var total = brief.reviewers || 1;
    var have = brief.received || 0;

    // Where this person sits in the panel. Somebody deciding how much care to
    // take is entitled to know they are not the only one looking, and equally
    // that their answer is not a formality.
    var pips = "";
    for (var i = 0; i < total; i++) {
      pips += '<span class="' + (i < have ? "in" : i === have ? "you" : "") + '"></span>';
    }

    var imgs = (brief.evidence || []).map(function (sha) {
      return '<figure><img alt="The photograph submitted for this job" ' +
        'data-sha="' + esc(sha) + '">' +
        '<figcaption>Submitted by whoever did the work. ' +
        'Tap to open it full size.</figcaption></figure>';
    }).join("");

    app.className = "";
    app.innerHTML =
      (brief.practice
        ? '<div class="demo"><div>&#9888;</div><div><b>This is a demonstration.</b> ' +
          'Nothing here is real work, no money moves, and the photograph is a ' +
          'drawing rather than a place. Everything else &mdash; the question, ' +
          'the panel, how an answer is recorded &mdash; is exactly what a real ' +
          'review does.</div></div>'
        : "") +

      '<div class="prog" role="img" aria-label="' +
        esc(have + " of " + total + " reviewers have answered") + '">' + pips + '</div>' +

      '<ol class="steps">' +
        '<li>Automated verification ran and was not confident enough</li>' +
        '<li class="now">' + esc(total) + ' people are asked the same question, separately</li>' +
        '<li>' + esc(brief.agreement || 2) + ' answering the same way settles it, and money moves</li>' +
      '</ol>' +

      '<p class="q">' + esc(brief.question) + '</p>' +
      (brief.context ? '<p class="ctx">' + esc(brief.context) + '</p>' : '') +

      '<dl class="pay">' +
        '<div><dt>To look</dt><dd>' + money(brief.fee_minor, brief.currency) + '</dd></div>' +
        '<div><dt>If the panel agrees with you</dt><dd>+' +
          money(brief.bonus_minor, brief.currency) + '</dd></div>' +
      '</dl>' +

      '<p class="look">Answer only from what is in the photograph. ' +
        'If it does not show enough to tell, say so &mdash; that is the answer, ' +
        'and it pays the same.</p>' +
      imgs +

      '<textarea id="reason" placeholder="What do you see? A sentence is enough."></textarea>' +
      '<div class="row">' +
        '<button class="yes" id="yes">Yes</button>' +
        '<button class="no" id="no">No</button>' +
      '</div>' +
      '<button class="unsure" id="unsure">I cannot tell from this</button>' +
      '<p class="err" id="err"></p>' +

      '<details><summary>How this works, and why you</summary>' +
        '<p>Somebody paid for a job to be done and the money is held until ' +
          'there is proof it was. Software judged the photograph first and ' +
          'landed short of the certainty the buyer asked for, so the question ' +
          'comes to people instead.</p>' +
        '<p>You are one of ' + esc(total) + '. You cannot see the others&rsquo; ' +
          'answers and they cannot see yours, which is the point &mdash; a ' +
          'panel that can see itself is one answer, not ' + esc(total) + '.</p>' +
        '<p>You are paid for looking, whichever way you answer, and you are ' +
          'not paid more for agreeing. Withholding pay from the minority ' +
          'would buy agreement rather than judgement, which is worth nothing.</p>' +
        '<p>You were assigned this. Nobody on the exchange chooses which ' +
          'evidence they judge, because anybody who could choose would ' +
          'eventually choose their own work.</p>' +
      '</details>';

    // Images are fetched with the capability, so they cannot be hotlinked.
    Array.prototype.forEach.call(app.querySelectorAll("img[data-sha]"), async function (img) {
      var path = "/v1/claims/" + job + "/evidence/" + img.dataset.sha;
      var ts = stamp();
      var proof = mac("GET", path, ts, "");
      var res = await fetch(path, {
        headers: { "X-Lamdis-Timestamp": ts, "X-Lamdis-Capability": job + "." + proof }
      });
      if (!res.ok) { return; }
      var url = URL.createObjectURL(await res.blob());
      img.src = url;
      // The caption says the photograph opens full size, so it has to. A
      // reviewer judging whether a sign is legible is doing it on a phone,
      // where the difference between a thumbnail and the full frame is the
      // difference between an answer and a guess.
      img.style.cursor = "zoom-in";
      img.onclick = function () { window.open(url, "_blank", "noopener"); };
    });

    var buttons = ["yes", "no", "unsure"];
    var answer = function (finding, confident) {
      return async function () {
        var reason = document.getElementById("reason").value.trim();
        var err = document.getElementById("err");
        if (reason.length < 8) {
          err.textContent = "Please say briefly why — a review without a reason cannot be paid.";
          document.getElementById("reason").focus();
          return;
        }
        buttons.forEach(function (id) { document.getElementById(id).disabled = true; });
        var out = await call("POST", "/v1/claims/" + job + "/review",
          { finding: finding, confident: confident, reason: reason });
        if (!out.ok) {
          err.textContent = (out.data && out.data.error) || "That did not go through.";
          buttons.forEach(function (id) { document.getElementById(id).disabled = false; });
          return;
        }
        // Finishing must not be a dead end. A reviewer who has just done the
        // work is exactly the person most likely to do another, and leaving
        // them on a page with no way forward wastes that and reads as broken.
        var got = out.data.received, want = brief.reviewers;
        var settled = got >= want;
        app.innerHTML = '<div class="done">' +
          '<p><strong>Thank you &mdash; that is recorded.</strong></p>' +
          '<p class="muted">' + esc(got) + ' of ' + esc(want) + ' answers in. ' +
            (settled
              ? 'The panel is complete, and the money settles on it.'
              : 'It settles once ' + esc(want) + ' people have looked.') +
          '</p>' +
          '<p class="muted">' + money(brief.fee_minor, brief.currency) +
            ' for looking is yours either way' +
            (brief.bonus_minor
              ? ', plus ' + money(brief.bonus_minor, brief.currency) +
                ' if the panel lands where you did'
              : '') +
            '. It reaches your account with your next payout.</p>' +
          '<div class="row"><button id="next">Verify another</button></div>' +
          '<p class="err" id="nexterr"></p>' +
          '<p class="note"><a href="/board">Back to open work</a></p></div>';

        wireNext();
      };
    };
    document.getElementById("yes").onclick = answer(true, true);
    document.getElementById("no").onclick = answer(false, true);
    document.getElementById("unsure").onclick = answer(false, false);
  }

  (async function () {
    try {
      // Somebody arrives here without the code far more often than the old
      // wording assumed: a link copied out of a message, an address bar
      // retyped, a page reopened from history after the fragment was erased.
      // Telling them only that something is missing leaves them stuck on a
      // page that has not said what it is for.
      if (!secret) {
        app.className = "";
        app.innerHTML =
          '<div class="empty">' +
            '<h2>This link needs its access code</h2>' +
            '<p>Review links end in a <b>#</b> followed by a code, and the part ' +
              'after the # is what proves the link is yours. It is never sent ' +
              'to us, which is why it cannot be recovered from this page.</p>' +
            '<p>Open the original link again, in full. If it came in a ' +
              'message, follow it from there rather than copying the address.</p>' +
          '</div>' +
          '<details open><summary>What is this page?</summary>' +
            '<p>Lamdis is an exchange where software agents pay people to do ' +
              'things in the physical world, and payment settles against ' +
              'evidence that the work happened. When automated checks on that ' +
              'evidence are not confident enough, a small panel of people is ' +
              'asked instead. This is that page.</p>' +
            '<p><a href="/board">See work that is open now</a> &middot; ' +
              '<a href="/docs">How the exchange works</a></p>' +
          '</details>';
        return;
      }
      var out = await call("GET", "/v1/claims/" + job, null);
      if (!out.ok) {
        app.className = "";
        app.innerHTML =
          '<div class="empty">' +
            '<h2>This review is closed</h2>' +
            '<p>Either enough people answered and the panel settled, or the ' +
              'link ran out of time. Both end the same way: there is nothing ' +
              'left to look at here.</p>' +
            '<p>If you answered before it closed, your review still counts and ' +
              'is still paid.</p>' +
          '</div>' +
          '<div class="row"><button id="next">Verify something else</button></div>' +
          '<p class="err" id="nexterr"></p>' +
          '<p class="note"><a href="/board">Back to open work</a></p>';
        wireNext();
        return;
      }
      render(out.data);
    } catch (e) {
      // Never leave the reader staring at "Loading". If something broke, say
      // what, so the problem is reportable rather than mysterious.
      app.innerHTML = '<p class="muted">Something went wrong loading this ' +
        'review.</p><p class="err">' + esc(e && e.message ? e.message : e) + '</p>';
    }
  })();
})();
</script>
`
