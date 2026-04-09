import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || '').trim();
    const history = Array.isArray(body.history) ? (body.history as Msg[]).slice(-8) : [];
  const gatewayUrl = String(body.gatewayUrl || process.env.NEXT_PUBLIC_MCP_GATEWAY_URL || '').trim();
  const toolsBaseUrlOverride = String(body.toolsBaseUrl || '').trim();
    if (!message) return new Response(JSON.stringify({ error: 'message_required' }), { status: 400 });
    if (!gatewayUrl) return new Response(JSON.stringify({ error: 'gateway_url_required' }), { status: 400 });

    // Compute HTTP base URL from gateway (convert ws(s) -> http(s)) and strip trailing /ws.
    // Preserve any version query (?v=...) provided via toolsBaseUrlOverride so it's appended AFTER /tools.
    const { httpBase, httpQuery } = (() => {
      // Helper to normalize a URL-like string into { base, query }
      const normalize = (raw: string) => {
        try {
          const u = new URL(raw);
          if (u.protocol === 'wss:') u.protocol = 'https:';
          if (u.protocol === 'ws:') u.protocol = 'http:';
          u.pathname = u.pathname.replace(/\/?ws$/, '');
          const query = u.search || '';
          u.search = '';
          return { base: u.toString().replace(/\/$/, ''), query };
        } catch {
          // Fallback: split on '?', strip trailing slash and /ws
          const idx = raw.indexOf('?');
          const basePart = (idx === -1 ? raw : raw.slice(0, idx)).replace(/\/$/, '').replace(/\/?ws$/, '');
          const queryPart = idx === -1 ? '' : raw.slice(idx);
          return { base: basePart, query: queryPart };
        }
      };

      if (toolsBaseUrlOverride) {
        const { base, query } = normalize(toolsBaseUrlOverride);
        return { httpBase: base, httpQuery: query };
      }
      try {
        const u = new URL(gatewayUrl);
        if (u.protocol === 'wss:') u.protocol = 'https:';
        if (u.protocol === 'ws:') u.protocol = 'http:';
        u.pathname = u.pathname.replace(/\/?ws$/, '');
        // Drop any query from gatewayUrl by default
        u.search = '';
        return { httpBase: u.toString().replace(/\/$/, ''), httpQuery: '' };
      } catch {
        return { httpBase: '', httpQuery: '' };
      }
    })();

    // Fetch tool list from MCP gateway over HTTP (new endpoint)
    let toolsHint = '';
    let toolNames: string[] = [];
    try {
  const listUrl = httpBase + '/tools' + (httpQuery || '');
      const r = await fetch(listUrl, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const tools = Array.isArray(j?.tools) ? j.tools.slice(0, 12) : [];
        toolNames = tools.map((t: any) => t.name).filter(Boolean);
        if (tools.length) toolsHint = 'Available tools: ' + tools.map((t: any) => t.name || t.id).join(', ');
      }
    } catch {}

    // Heuristic: if the user asks for announcements and we have the tool, call it first for deterministic behavior
    const wantsAnnouncements = /\b(announcement|announcements|news|updates?)\b/i.test(message);
    if (httpBase && toolNames.includes('get-announcements') && wantsAnnouncements) {
      try {
        const r2 = await fetch(httpBase + '/tools/call' + (httpQuery || ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'get-announcements', args: {} })
        });
        const j2 = await r2.json().catch(() => ({} as any));
        // Hosted gateway returns either parsed JSON or { status, body } when plaintext
        const toolRes = (j2 && typeof j2 === 'object') ? (j2.result || j2) : j2;
        const bodyText = typeof toolRes?.body === 'string' ? toolRes.body : (typeof toolRes === 'string' ? toolRes : null);
        if (bodyText && bodyText.trim()) {
          const reply = `Here are the latest announcements:\n\n${bodyText.trim()}`;
          return new Response(JSON.stringify({ ok: true, reply }), { headers: { 'Content-Type': 'application/json' } });
        }
      } catch {}
    }

  const sys = `You are the Lamdis Support Assistant. You can answer questions about Lamdis and demonstrate capabilities by using Lamdis tools.
Use Lamdis tools through the gateway to fulfill user requests that involve actions. When a tool is appropriate, you MUST call a tool rather than only describing what you'd do.
${toolsHint}`.trim();
    const chat: Msg[] = [{ role: 'system', content: sys }, ...history, { role: 'user', content: message }];

    // Prefer: OpenAI Responses API MCP tools over HTTPS; Fallback: Chat Completions + function-calling
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return new Response(JSON.stringify({ error: 'openai_key_missing' }), { status: 500 });

    const model = process.env.OPENAI_MODEL || 'gpt-4o';

    // Try Responses API MCP mode first if we have an HTTPS base
    if (httpBase) {
      try {
        const responsesPayload: any = {
          model,
          input: message,
          tools: [
            {
              type: 'mcp',
              server_label: 'lamdis',
              server_url: httpBase + (httpQuery || ''),
              ...(toolNames.length ? { allowed_tools: toolNames } : {}),
              require_approval: 'never'
            }
          ]
        };
        const resp0 = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(responsesPayload)
        });
        const jr0 = await resp0.json();
        if (resp0.ok && typeof jr0?.output_text === 'string') {
          const reply = String(jr0.output_text);
          return new Response(JSON.stringify({ ok: true, reply }), { headers: { 'Content-Type': 'application/json' } });
        }
      } catch {}
    }

  // Fallback: allow model to request a tool call via function-calling
    const modelFallback = model || 'gpt-4o-mini';
    const toolsForModel = [
      {
        type: 'function',
        function: {
          name: 'call_tool',
          description: toolNames.length
            ? `Call one of these Lamdis tools: ${toolNames.join(', ')}`
            : 'Call a Lamdis tool by name with JSON arguments.',
          parameters: {
            type: 'object',
            properties: {
              name: toolNames.length ? { type: 'string', enum: toolNames } : { type: 'string' },
              args: { type: 'object', description: 'JSON arguments for the tool', additionalProperties: true }
            },
            required: ['name']
          }
        }
      }
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelFallback,
        messages: chat,
        tools: toolsForModel,
        tool_choice: 'auto',
      })
    });
    const jr = await resp.json();
    if (!resp.ok) return new Response(JSON.stringify({ error: jr?.error?.message || 'openai_failed' }), { status: 500 });
    let msg = jr?.choices?.[0]?.message;
    // Handle a single tool call if requested
    if (msg?.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0 && httpBase) {
      const call = msg.tool_calls[0];
      if (call?.function?.name === 'call_tool') {
        try {
          const parsed = JSON.parse(call.function.arguments || '{}');
          const name = String(parsed.name || '').trim();
          const args = parsed.args ?? {};
          if (name) {
            const r2 = await fetch(httpBase + '/tools/call' + (httpQuery || ''), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, args })
            });
            const j2 = await r2.json().catch(() => ({}));
            const toolResult = r2.ok ? j2 : { error: j2?.error || 'tool_call_failed' };
            // If hosted returned plaintext ({ body: string }), respond directly
            try {
              const tr = (toolResult && typeof toolResult === 'object') ? (toolResult.result || toolResult) : toolResult;
              const bodyText = typeof tr?.body === 'string' ? tr.body : (typeof tr === 'string' ? tr : null);
              if (bodyText && bodyText.trim()) {
                const reply = bodyText.trim();
                return new Response(JSON.stringify({ ok: true, reply }), { headers: { 'Content-Type': 'application/json' } });
              }
            } catch {}
            // Second pass: give result back to model for a final answer
            const resp2 = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model,
                messages: [
                  ...chat,
                  { role: 'assistant', content: msg.content || '', tool_calls: [call] },
                  { role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) }
                ]
              })
            });
            const jr2 = await resp2.json();
            if (resp2.ok) {
              msg = jr2?.choices?.[0]?.message;
            } else {
              msg = { role: 'assistant', content: 'Tool call failed.' };
            }
          }
        } catch {}
      }
    }

    const reply = msg?.content || 'Sorry, I could not respond.';

    return new Response(JSON.stringify({ ok: true, reply }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'server_error' }), { status: 500 });
  }
}
