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
</style>
<main>
  <h1>Review request</h1>
  <div id="app"><p class="muted">Loading&hellip;</p></div>
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

  function render(brief) {
    var imgs = (brief.evidence || []).map(function (sha) {
      return '<img alt="evidence" data-sha="' + esc(sha) + '">';
    }).join("");
    app.innerHTML =
      '<p class="q">' + esc(brief.question) + '</p>' +
      (brief.context ? '<p class="ctx">' + esc(brief.context) + '</p>' : '') +
      '<dl class="pay">' +
        '<div><dt>To review</dt><dd>' + money(brief.fee_minor, brief.currency) + '</dd></div>' +
        '<div><dt>If you agree with the panel</dt><dd>+' +
          money(brief.bonus_minor, brief.currency) + '</dd></div>' +
      '</dl>' +
      imgs +
      '<textarea id="reason" placeholder="What do you see? A sentence is enough."></textarea>' +
      '<div class="row">' +
        '<button class="yes" id="yes">Yes</button>' +
        '<button class="no" id="no">No</button>' +
      '</div>' +
      '<button class="unsure" id="unsure">I cannot tell from this</button>' +
      '<p class="err" id="err"></p>' +
      '<p class="note">You are paid for looking, whichever way you answer. ' +
        'Saying you cannot tell is a real answer.</p>';

    // Images are fetched with the capability, so they cannot be hotlinked.
    Array.prototype.forEach.call(app.querySelectorAll("img[data-sha]"), async function (img) {
      var path = "/v1/claims/" + job + "/evidence/" + img.dataset.sha;
      var ts = stamp();
      var proof = mac("GET", path, ts, "");
      var res = await fetch(path, {
        headers: { "X-Lamdis-Timestamp": ts, "X-Lamdis-Capability": job + "." + proof }
      });
      if (res.ok) img.src = URL.createObjectURL(await res.blob());
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
        app.innerHTML = '<div class="done"><p><strong>Thank you.</strong></p>' +
          '<p class="muted">Your review is recorded. ' + esc(out.data.received) +
          ' of ' + esc(brief.reviewers) + ' received.</p>' +
          '<div class="row"><button id="next">Verify another</button></div>' +
          '<p class="note"><a href="/board">Back to open work</a></p>' +
          '<div class="err" id="nexterr"></div></div>';

        document.getElementById("next").onclick = function () {
          var b = this, e = document.getElementById("nexterr");
          b.disabled = true; b.textContent = "Finding one…"; e.textContent = "";
          // The next panel is assigned, exactly as this one was. There is no
          // path here that lets a reviewer pick.
          enrol()
            .then(function () { return workerHeaders("POST", "/v1/workers/assign"); })
            .then(function (h) { return fetch("/v1/workers/assign", {method:"POST", headers:h}); })
            .then(function (r) { return r.json().then(function (j) { return {ok:r.ok, body:j}; }); })
            .then(function (res) {
              if (!res.ok) { throw new Error("none"); }
              window.location.href = res.body.url;
            })
            .catch(function () {
              // Whatever the exchange called it internally, what the person
              // needs to know is that there is nothing for them right now.
              e.textContent = "Nothing more to verify right now. Check back shortly.";
              b.disabled = true; b.textContent = "Verify another";
            });
        };
      };
    };
    document.getElementById("yes").onclick = answer(true, true);
    document.getElementById("no").onclick = answer(false, true);
    document.getElementById("unsure").onclick = answer(false, false);
  }

  (async function () {
    try {
      if (!secret) {
        app.innerHTML = '<p class="muted">This link is missing its access code. ' +
          'Open the full link you were sent, including everything after the # sign.</p>';
        return;
      }
      var out = await call("GET", "/v1/claims/" + job, null);
      if (!out.ok) {
        app.innerHTML = '<p class="muted">This link is no longer valid. ' +
          'It may have expired or already been used.</p>';
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
