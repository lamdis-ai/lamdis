import { Worker } from 'worker_threads';
import vm from 'vm';
import { isPrivateHost } from './ssrf-guard.js';

export type HostedExecuteOptions = {
  code: string;
  input: any;
  permissions?: { net_allow?: string[]; env?: string[] };
  timeoutMs?: number;
};

export type HostedExecuteResult = {
  ok: boolean;
  status?: number;
  contentType?: string;
  body?: any;
  error?: string;
  logs?: string[];
};

// We run code in a worker with an inline script that uses vm and provides a minimal sandbox.
// The user code must export an async function run(input, ctx) that returns { kind: 'text'|'data', value, contentType? }.
export function executeHostedJS(opts: HostedExecuteOptions): Promise<HostedExecuteResult> {
  return new Promise((resolve) => {
    // Helper: sanitize code like in worker
    function sanitize(code: string): string {
      // Normalize CRLF/CR to LF
      let s = String(code).split('\r\n').join('\n').split('\r').join('\n');
      // Strip BOM/zero-width
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\uFEFF' || ch === '\u200B' || ch === '\u200C' || ch === '\u200D' || ch === '\u2060') continue;
        out += ch;
      }
      out = out
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .replace(/\u00AD/g, '-')
        .replace(/\u2028/g, '\n')
        .replace(/\u2029/g, '\n');
      // Strip bidi/formatting
      let cleaned2 = '';
      for (let j = 0; j < out.length; j++) {
        const c = out[j]; const codePt = c.charCodeAt(0);
        if (codePt === 0x200E || codePt === 0x200F || (codePt >= 0x202A && codePt <= 0x202E) || (codePt >= 0x2066 && codePt <= 0x2069)) continue;
        cleaned2 += c;
      }
      return cleaned2;
    }

    async function runInMainThread(): Promise<HostedExecuteResult> {
      try {
        const logs: string[] = [];
        function safeLog(...args: any[]) { try { logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); } catch {} }
        const allow = (opts.permissions && Array.isArray(opts.permissions.net_allow)) ? (opts.permissions.net_allow as string[]) : [];
        const envAllow = (opts.permissions && Array.isArray(opts.permissions.env)) ? (opts.permissions.env as string[]) : [];
        const allowedEnv: Record<string, string> = {};
        for (const k of envAllow) { const v = (process.env as any)[k]; if (v != null) allowedEnv[k] = String(v); }
        async function lamdisFetch(url: any, init?: any) {
          try {
            const u = new URL(String(url)); const host = u.hostname || '';
            if (isPrivateHost(host)) {
              throw new Error('Network access to private/internal hosts is blocked');
            }
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              throw new Error('Only http/https protocols are allowed');
            }
            if (!allow.length || !allow.some(p => host === p || (p.startsWith('*.') && host.endsWith(p.slice(1))))) {
              throw new Error('Network access to ' + host + ' not allowed');
            }
            const resp = await fetch(url as any, init as any);
            const text = await resp.text(); let parsed: any; try { parsed = JSON.parse(text); } catch {}
            return { ok: (resp as any).ok, status: (resp as any).status, headers: { 'content-type': (resp as any).headers.get('content-type') || '' }, body: (parsed != null ? parsed : text) };
          } catch (e: any) {
            return { ok: false, status: 0, error: e?.message || 'fetch failed' };
          }
        }
        const context = vm.createContext({
          console: { log: safeLog, warn: safeLog, error: safeLog },
          fetch: lamdisFetch,
          URL,
          Buffer,
          btoa: (s: string) => Buffer.from(s).toString('base64'),
          atob: (s: string) => Buffer.from(s, 'base64').toString(),
          setTimeout, clearTimeout,
          setInterval, clearInterval,
          process: { env: allowedEnv },
          exports: {}, module: { exports: {} },
        }, { name: 'lamdis-hosted-main' });
        const cleaned = sanitize(String(opts.code || ''));
        const src = '"use strict";\nreturn (async () => {\n' + cleaned + '\n})();';
        const fn = vm.compileFunction(src, ['input', 'ctx'], { parsingContext: context });
        const ctx = { env: allowedEnv, log: safeLog };
        const result = await fn(opts.input, ctx);
        if (result && (result.kind === 'text' || typeof result === 'string')) {
          const text = typeof result === 'string' ? result : String(result.value ?? result.text ?? '');
          return { ok: true, status: 200, contentType: (result.contentType || 'text/plain'), body: text, logs };
        }
        return { ok: true, status: 200, contentType: ((result && result.contentType) || 'application/json'), body: (result && result.value != null ? result.value : (result && result.data != null ? result.data : result)), logs };
      } catch (e: any) {
        return { ok: false, error: e?.message || 'execution failed', logs: [], ...(e?.name ? { name: e.name } : {}), ...(e?.stack ? { stack: e.stack } : {}) } as any;
      }
    }

    const timeoutMs = Math.max(500, Math.min(30000, opts.timeoutMs || 6000));
    let worker: Worker | undefined;
    try {
      worker = new Worker(`
      const { parentPort } = require('worker_threads');
      const vm = require('vm');
      const { URL } = require('url');
      const logs = [];
      function safeLog(...args) { try { logs.push(args.map(a=> typeof a==='string'?a:JSON.stringify(a)).join(' ')); } catch {} }
      parentPort.on('message', async (msg) => {
        const { code, input, permissions, env } = msg;
        // Sanitize incoming code without using regex literals to avoid nested parsing edge cases
        const cleaned = (typeof code === 'string'
          ? (() => {
              // Normalize CRLF to LF
              // Normalize Windows CRLF to LF and stray CR to LF
              let s = String(code).split('\r\n').join('\n').split('\r').join('\n');
              // Strip BOM and zero-width characters
              let out = '';
              for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (ch === '\uFEFF' || ch === '\u200B' || ch === '\u200C' || ch === '\u200D' || ch === '\u2060') continue;
                out += ch;
              }
              // Replace common problematic unicode punctuation with ASCII equivalents
              out = out
                .replace(/[\u2018\u2019]/g, "'") // curly single quotes → '
                .replace(/[\u201C\u201D]/g, '"') // curly double quotes → "
                .replace(/[\u2013\u2014]/g, '-')   // en/em dash → -
                .replace(/\u2026/g, '...')         // ellipsis → ...
                .replace(/\u00A0/g, ' ')           // non-breaking space → space
                .replace(/\u00AD/g, '-')           // soft hyphen → -
                .replace(/\u2028/g, '\n')         // Unicode line separator → LF
                .replace(/\u2029/g, '\n')         // Unicode paragraph separator → LF
                ;
              // Strip additional bidi/formatting chars that can break parsing
              let cleaned2 = '';
              for (let j = 0; j < out.length; j++) {
                const c = out[j];
                const code = c.charCodeAt(0);
                // Filter common format/bidi chars: LRM/RLM, LRE/RLE/PDF, LRI/RLI/FSI/PDI
                if (
                  code === 0x200E || code === 0x200F ||
                  (code >= 0x202A && code <= 0x202E) ||
                  (code >= 0x2066 && code <= 0x2069)
                ) continue;
                cleaned2 += c;
              }
              out = cleaned2;
              return out;
            })()
          : '');
        const allow = (permissions && Array.isArray(permissions.net_allow)) ? permissions.net_allow : [];
        const allowedEnv = {}; const envAllow = (permissions && Array.isArray(permissions.env)) ? permissions.env : [];
        for (const k of envAllow) { if (process.env[k] != null) allowedEnv[k] = process.env[k]; }
        function isPrivateHost(h) {
          h = h.toLowerCase().trim();
          if (h === 'localhost' || h.endsWith('.internal')) return true;
          return /^(127\\.|10\\.|172\\.(1[6-9]|2\\d|3[01])\\.|192\\.168\\.|169\\.254\\.|0\\.|100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.|::1$|fc00:|fe80:|fd)/i.test(h);
        }
        async function lamdisFetch(url, init) {
          try {
            const u = new URL(String(url));
            const host = u.hostname || '';
            if (isPrivateHost(host)) {
              throw new Error('Network access to private/internal hosts is blocked');
            }
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              throw new Error('Only http/https protocols are allowed');
            }
            if (!allow.length || !allow.some(p => host === p || (p.startsWith('*.') && host.endsWith(p.slice(1))))) {
              throw new Error('Network access to ' + host + ' not allowed');
            }
            const resp = await fetch(url, init);
            const text = await resp.text();
            let parsed; try { parsed = JSON.parse(text); } catch {}
            return { ok: resp.ok, status: resp.status, headers: { 'content-type': resp.headers.get('content-type')||'' }, body: (parsed != null ? parsed : text) };
          } catch (e) {
            return { ok: false, status: 0, error: (e && e.message) || 'fetch failed' };
          }
        }
        const sandbox = {
          console: { log: safeLog, error: safeLog, warn: safeLog },
          fetch: lamdisFetch,
          URL,
          Buffer,
          btoa: function(s) { return Buffer.from(String(s)).toString('base64'); },
          atob: function(s) { return Buffer.from(String(s), 'base64').toString(); },
          setTimeout, clearTimeout,
          setInterval, clearInterval,
          process: { env: allowedEnv },
          exports: {}, module: { exports: {} },
        };
        const context = vm.createContext(sandbox, { name: 'lamdis-hosted' });
  // Wrap user code in an async IIFE so top-level await works (careful with escaping inside template)
  const src = '\"use strict\";\nreturn (async () => {\n' + cleaned + '\n})();';
        try {
          // Compile the user code as a function body with (input, ctx) params
          const fn = vm.compileFunction(src, ['input', 'ctx'], { parsingContext: context });
          const ctx = { env: allowedEnv, log: safeLog };
          const result = await fn(input, ctx);
          parentPort.postMessage({ ok: true, result, logs });
        } catch (e) {
          // Provide better diagnostics for syntax errors or runtime errors (pure JS)
          try {
            const preview = src.slice(0, 240);
            const line = e && (e.lineNumber != null ? e.lineNumber : e.line);
            const column = e && (e.columnNumber != null ? e.columnNumber : e.column);
            const pos = e && e.pos;
            const codeProp = e && e.code;
            parentPort.postMessage({ ok: false, error: (e && e.message) || 'execution failed', name: e && e.name, stack: String((e && e.stack) || ''), logs, preview, line, column, pos, code: codeProp });
          } catch (err2) {
            parentPort.postMessage({ ok: false, error: (e && e.message) || 'execution failed', logs });
          }
        }
      });
    `, { eval: true });
    } catch (e) {
      // If worker creation itself fails, fallback to main-thread execution
      runInMainThread().then(resolve);
      return;
    }

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { worker.terminate(); } catch {}
      resolve({ ok: false, error: 'timeout', logs: [] });
    }, timeoutMs + 50);

    worker.on('message', (m: any) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch {}
      if (!m?.ok) return resolve({
        ok: false,
        error: m?.error || 'execution failed',
        logs: m?.logs || [],
        ...(m?.name ? { name: m.name } : {}),
        ...(m?.stack ? { stack: m.stack } : {}),
        ...(m?.preview ? { preview: m.preview } : {}),
        ...(m?.line != null ? { line: m.line } : {}),
        ...(m?.column != null ? { column: m.column } : {}),
        ...(m?.pos != null ? { pos: m.pos } : {}),
        ...(m?.code ? { code: m.code } : {}),
      });
      const r = m.result;
      if (r && (r.kind === 'text' || typeof r === 'string')) {
        const text = typeof r === 'string' ? r : String(r.value ?? r.text ?? '');
      return resolve({ ok: true, status: 200, contentType: (r.contentType || 'text/plain'), body: text, logs: m.logs });
      }
      // default to JSON data
    return resolve({ ok: true, status: 200, contentType: ((r && r.contentType) || 'application/json'), body: (r && r.value != null ? r.value : (r && r.data != null ? r.data : r)), logs: m.logs });
    });
    worker.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch {}
      // Attempt main-thread fallback to still provide a useful result or better error
      runInMainThread().then(resolve);
    });
    worker.postMessage({ code: opts.code, input: opts.input, permissions: { net_allow: opts.permissions?.net_allow || [], env: opts.permissions?.env || [] } });
  });
}
