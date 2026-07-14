package api

// The Portal is deliberately one dependency-free page: it ships inside the
// binary and works offline. Aesthetic matches lamdis.ai.
const portalHTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lamdis Portal</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background:#020617; color:#cbd5e1; font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { color:#fff; font-size:20px; letter-spacing:.01em; display:flex; align-items:center; gap:10px; }
  h1 .dot { width:10px; height:10px; border-radius:99px; background:#8b5cf6; box-shadow:0 0 12px #8b5cf6aa; }
  .sub { color:#64748b; font-size:13px; margin-top:4px; }
  h2 { color:#a78bfa; font-size:11px; text-transform:uppercase; letter-spacing:.14em; margin:34px 0 12px; }
  .card { background:#0f172aB3; border:1px solid #1e293b; border-radius:14px; padding:16px 18px; margin-bottom:10px; }
  .card.req { border-color:#8b5cf655; background:linear-gradient(180deg,#1e1b4b22,#0f172aB3); }
  .who { color:#fff; font-weight:600; }
  .scopes { color:#a78bfa; font-family:ui-monospace,monospace; font-size:13px; }
  .reason { color:#94a3b8; font-style:italic; margin-top:4px; }
  .title { color:#e2e8f0; font-weight:600; }
  .meta { color:#64748b; font-size:12.5px; margin-top:2px; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .btns { display:flex; gap:8px; margin-top:12px; }
  button { border:0; border-radius:9px; padding:9px 18px; font-size:13.5px; font-weight:600; cursor:pointer; transition:filter .15s; }
  button:hover { filter:brightness(1.15); }
  .approve { background:#7c3aed; color:#fff; }
  .deny { background:#1e293b; color:#e2e8f0; border:1px solid #334155; }
  .revoke { background:transparent; color:#f87171; border:1px solid #7f1d1d; padding:5px 12px; font-size:12px; }
  .pill { display:inline-block; border:1px solid #334155; border-radius:99px; padding:1px 9px; font-size:11px; color:#94a3b8; margin-left:8px; vertical-align:1px; }
  .empty { color:#475569; padding:22px; text-align:center; border:1px dashed #1e293b; border-radius:14px; }
  .grant-line { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-top:1px solid #1e293b55; }
  .grant-line:first-of-type { border-top:0; }
  .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#065f46; color:#d1fae5; padding:10px 20px; border-radius:10px; font-size:13.5px; opacity:0; transition:opacity .25s; pointer-events:none; }
  .toast.show { opacity:1; }
  #auth { margin-top:40px; }
  input { width:100%; background:#0f172a; border:1px solid #334155; border-radius:9px; color:#e2e8f0; padding:10px 12px; font:inherit; }
</style>
<div class="wrap">
  <h1><span class="dot"></span>Lamdis Portal</h1>
  <p class="sub">You hold the keys. Agents can ask — only you can answer.</p>
  <div id="auth" style="display:none">
    <p class="empty">Paste the portal token printed by <code>lamdis serve</code>:</p>
    <input id="tok" placeholder="token" onkeydown="if(event.key==='Enter'){localStorage.token=this.value;location.reload()}">
  </div>
  <div id="app" style="display:none">
    <h2>Waiting on you</h2><div id="pending"></div>
    <h2>Your threads</h2><div id="threads"></div>
  </div>
  <div class="toast" id="toast"></div>
</div>
<script>
const qs = new URLSearchParams(location.search);
if (qs.get('token')) { localStorage.token = qs.get('token'); history.replaceState(null,'',location.pathname); }
const token = () => localStorage.token || '';
const H = { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' };
const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2200); }

async function decide(thread, principal, decision){
  const r = await fetch('/portal/api/decide', {method:'POST', headers:H, body:JSON.stringify({thread, principal, decision})});
  if (r.ok) { toast(decision==='approve' ? '✓ approved — they receive it on their next sync' : '✓ ' + decision); load(); }
  else toast('failed: ' + await r.text());
}

async function load(){
  const r = await fetch('/portal/api/state', {headers:H});
  if (r.status === 401) { document.getElementById('auth').style.display='block'; document.getElementById('app').style.display='none'; return; }
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='block';
  const s = await r.json();
  const pend = [], rows = [];
  for (const t of (s.threads||[])) {
    if (!t.mine) continue;
    for (const p of (t.pending||[])) {
      pend.push('<div class="card req"><div><span class="who">'+esc(p.name)+'</span> wants ' +
        '<span class="scopes">'+esc((p.scopes||[]).join(', '))+'</span> on <span class="title">'+esc(t.title)+'</span></div>' +
        (p.reason ? '<div class="reason">&ldquo;'+esc(p.reason)+'&rdquo;</div>' : '') +
        '<div class="btns"><button class="approve" onclick="decide(\''+t.id+'\',\''+p.principal+'\',\'approve\')">Approve</button>' +
        '<button class="deny" onclick="decide(\''+t.id+'\',\''+p.principal+'\',\'deny\')">Deny</button></div></div>');
    }
    const grants = (t.grants||[]).map(g =>
      '<div class="grant-line"><span><span class="who">'+esc(g.name)+'</span> <span class="scopes">'+esc((g.scopes||[]).sort().join(', '))+'</span></span>' +
      '<button class="revoke" onclick="decide(\''+t.id+'\',\''+g.principal+'\',\'revoke\')">revoke</button></div>').join('');
    rows.push('<div class="card"><div class="row"><span class="title">'+esc(t.title)+'</span>' +
      (t.discoverable ? '<span class="pill">discoverable</span>' : '<span class="pill">hidden</span>') + '</div>' +
      (grants ? grants : '<div class="meta">shared with no one</div>') + '</div>');
  }
  document.getElementById('pending').innerHTML = pend.join('') || '<div class="empty">No pending requests — you are all caught up.</div>';
  document.getElementById('threads').innerHTML = rows.join('') || '<div class="empty">No threads yet.</div>';
}
load(); setInterval(load, 4000);
</script>`
