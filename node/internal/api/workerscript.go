package api

// workerJS is the browser half of worker identity, shared by every page that
// needs one.
//
// This file is deliberately not named worker_js.go: Go reads a _js suffix as a
// GOOS constraint and would build it only for js/wasm, silently excluding it
// everywhere else.
//
// It tries to give the person a real key and degrades honestly when it cannot.
// A generated Ed25519 key makes them a principal: their submissions carry their
// own signature and they can be paid. WebCrypto only offers Ed25519 in a secure
// context, so a page served over plain HTTP on a local network always lands on
// the bearer-secret path — which works, counts as work, and cannot be paid.
// The page says which one happened rather than pretending they are the same.
const workerJS = `
"use strict";

// SHA-256 by hand, because crypto.subtle does not exist on plain HTTP and that
// is exactly where this page runs during a pilot.
function sha256Bytes(bytes) {
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var l=bytes.length, padded=new Uint8Array(Math.ceil((l+9)/64)*64);
  padded.set(bytes); padded[l]=0x80;
  var dv=new DataView(padded.buffer), bits=l*8;
  dv.setUint32(padded.length-4, bits>>>0);
  dv.setUint32(padded.length-8, Math.floor(bits/4294967296));
  var w=new Uint32Array(64);
  function rr(x,n){return (x>>>n)|(x<<(32-n));}
  for (var i=0;i<padded.length;i+=64) {
    for (var t=0;t<16;t++){w[t]=dv.getUint32(i+t*4);}
    for (t=16;t<64;t++){
      var s0=rr(w[t-15],7)^rr(w[t-15],18)^(w[t-15]>>>3);
      var s1=rr(w[t-2],17)^rr(w[t-2],19)^(w[t-2]>>>10);
      w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for (t=0;t<64;t++){
      var S1=rr(e,6)^rr(e,11)^rr(e,25), ch=(e&f)^(~e&g);
      var t1=(h+S1+ch+K[t]+w[t])>>>0;
      var S0=rr(a,2)^rr(a,13)^rr(a,22), mj=(a&b)^(a&c)^(b&c);
      var t2=(S0+mj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  var out=new Uint8Array(32), odv=new DataView(out.buffer);
  for (var j=0;j<8;j++){odv.setUint32(j*4,H[j]);}
  return out;
}
function toHex(b){var s="";for(var i=0;i<b.length;i++){s+=("0"+b[i].toString(16)).slice(-2);}return s;}
function sha256Hex(b){return toHex(sha256Bytes(b));}
function hmacHex(keyStr,msgStr){
  var enc=new TextEncoder(), key=enc.encode(keyStr);
  if (key.length>64){key=sha256Bytes(key);}
  var k=new Uint8Array(64); k.set(key);
  var ipad=new Uint8Array(64), opad=new Uint8Array(64);
  for(var i=0;i<64;i++){ipad[i]=k[i]^0x36;opad[i]=k[i]^0x5c;}
  var msg=enc.encode(msgStr);
  var inner=new Uint8Array(64+msg.length); inner.set(ipad); inner.set(msg,64);
  var ih=sha256Bytes(inner);
  var outer=new Uint8Array(96); outer.set(opad); outer.set(ih,64);
  return sha256Hex(outer);
}

// Crockford base32, matching how the protocol names a principal.
function crockford32(bytes){
  var A="0123456789ABCDEFGHJKMNPQRSTVWXYZ", out="", bits=0, value=0;
  for (var i=0;i<bytes.length;i++){
    value=(value<<8)|bytes[i]; bits+=8;
    while (bits>=5){out+=A[(value>>>(bits-5))&31]; bits-=5;}
  }
  if (bits>0){out+=A[(value<<(5-bits))&31];}
  return out;
}

function stamp(){return new Date().toISOString().replace(/\.\d+Z$/,"Z");}

var WORKER = null; // {id, verified} once signed in
var TOKEN = null;

function loadToken() {
  try { return localStorage.getItem("lamdis.token"); } catch (e) { return null; }
}
function loadWorker() {
  try {
    var raw = localStorage.getItem("lamdis.worker");
    if (raw) { return JSON.parse(raw); }
  } catch (e) {}
  return null;
}

// saveWorker persists who this is, so the /v1/me round trip below happens once
// rather than on every page.
//
// This was called and never defined. The consequence was not a missing cache:
// session() calls it inside a promise chain whose .catch clears the session, so
// the ReferenceError was swallowed and read as "this token is no good". Anybody
// holding a valid token with no cached worker id — a second tab, a fresh
// device, cleared site data, or simply the first navigation after signing in —
// was silently signed out and bounced to /signin. The comment on session()
// describes fixing exactly this. The fix was written; the function it depended
// on never was.
function saveWorker(w) {
  try { localStorage.setItem("lamdis.worker", JSON.stringify(w)); } catch (e) {}
}
function clearSession() {
  try {
    localStorage.removeItem("lamdis.token");
    localStorage.removeItem("lamdis.worker");
  } catch (e) {}
  TOKEN = null; WORKER = null;
}

// signedIn is the only question the pages ask. There is no guest tier: work
// nobody can be paid for is work nobody has a reason to do, and an identity
// anybody can mint for free bounds none of the abuse rules that depend on it.
function signedIn() { return !!(TOKEN && WORKER && WORKER.id); }

function goSignIn() {
  window.location.href = "/signin?next=" + encodeURIComponent(location.pathname);
}

// session restores who this is, if anyone. It never creates an identity.
//
// A token with no worker id attached is recoverable, not fatal: the token is
// the credential, and the id is only a label the server can hand back. Treating
// that state as signed-out was how somebody with a perfectly good session got
// sent to the sign-in page by every button on the site.
function session() {
  TOKEN = loadToken();
  WORKER = loadWorker();
  if (!TOKEN) { clearSession(); return Promise.resolve(null); }
  if (WORKER && WORKER.id) { return Promise.resolve(WORKER); }
  return fetch("/v1/me", {headers: {"Authorization": "Bearer " + TOKEN}})
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me || !me.worker) { clearSession(); return null; }
      WORKER = {id: me.worker, verified: !!me.verified, enrolled: !!me.enrolled};
      saveWorker(WORKER);
      return WORKER;
    })
    .catch(function () { clearSession(); return null; });
}

// workerHeaders authenticates a request as the signed-in account.
function workerHeaders(method, path) {
  if (!TOKEN) { return Promise.reject(new Error("not signed in")); }
  return Promise.resolve({"Authorization": "Bearer " + TOKEN});
}

// An expired token looks exactly like being signed out, because it is. Pages
// call this on a 401 so somebody mid-task is sent to sign in again rather than
// left staring at an error.
function handleAuthFailure(status) {
  if (status === 401) { clearSession(); goSignIn(); return true; }
  return false;
}
`
