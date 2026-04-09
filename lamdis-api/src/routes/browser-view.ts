/**
 * Browser View Route — live streaming of the agent's Playwright browser to the UI.
 *
 * Architecture:
 *   1. Client POSTs to /token endpoint to mint a 60s single-use viewer token
 *   2. Client opens WebSocket to /browser-view/ws?token=...
 *   3. Server streams JPEG screenshots at ~2.5fps via { type: 'frame', data: base64 }
 *   4. Client sends back { type: 'click'|'type'|'key'|'scroll'|'navigate' } messages
 *      which are forwarded to the live Playwright page
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { getActiveBrowserSession, touchBrowserSession } from '../services/browser/smartBrowser.js';
import { db } from '../db.js';
import { browserSkills, type BrowserSkillStep } from '@lamdis/db/schema';

interface ViewerToken {
  orgId: string;
  instanceId: string;
  expiresAt: number;
}

const viewerTokens = new Map<string, ViewerToken>();

// Cleanup expired tokens every 30s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of viewerTokens) {
    if (v.expiresAt < now) viewerTokens.delete(k);
  }
}, 30_000);

function resolveOrgId(req: FastifyRequest, reply: FastifyReply): string | null {
  const { orgId } = req.params as { orgId: string };
  const apiKeyAuth = (req as any).apiKeyAuth as { orgId: string; scopes: string[] } | undefined;
  if (apiKeyAuth) {
    if (orgId !== apiKeyAuth.orgId) {
      reply.code(403).send({ error: 'Forbidden' });
      return null;
    }
  }
  return orgId;
}

export default async function browserViewRoutes(app: FastifyInstance) {
  // Mint a single-use viewer token (authenticated via normal bearer auth)
  app.post('/orgs/:orgId/outcome-instances/:id/browser-view/token', async (req, reply) => {
    const orgId = resolveOrgId(req, reply);
    if (!orgId) return;
    const { id } = req.params as { id: string };
    const token = randomBytes(24).toString('hex');
    viewerTokens.set(token, {
      orgId,
      instanceId: id,
      expiresAt: Date.now() + 60_000,
    });
    return { token, expiresInMs: 60_000 };
  });

  // WebSocket — auth bypassed (token is auth boundary)
  app.get('/browser-view/ws', { websocket: true }, (connection: any, req) => {
    const socket = connection.socket || connection;
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const tokenStr = url.searchParams.get('token') || '';
    const tok = viewerTokens.get(tokenStr);

    if (!tok) {
      socket.close(4001, 'Invalid or expired token');
      return;
    }

    // Single-use: consume the token immediately
    viewerTokens.delete(tokenStr);

    const { orgId } = tok;
    let streaming = false;
    let frameTimer: ReturnType<typeof setInterval> | null = null;
    let frameInFlight = false;
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    // Skill recording state — captures user actions into a sequence the
    // agent can later replay/adapt on similar pages
    let recordingSteps: BrowserSkillStep[] | null = null;
    let recordingStartUrl = '';

    // Helper: extract element info at given coordinates from the live page
    async function getElementAt(x: number, y: number): Promise<{ selector?: string; text?: string; tag?: string } | null> {
      const session = getActiveBrowserSession(orgId);
      if (!session) return null;
      try {
        return await session.page.evaluate(({ ex, ey }) => {
          // NOTE: must be a self-contained string due to esbuild __name issue
          const el = document.elementFromPoint(ex, ey) as HTMLElement | null;
          if (!el) return null;
          // Generate a stable selector
          function gen(node: Element): string {
            if ((node as HTMLElement).id) return '#' + (node as HTMLElement).id;
            const testid = node.getAttribute('data-testid');
            if (testid) return '[data-testid="' + testid + '"]';
            const aria = node.getAttribute('aria-label');
            if (aria) return '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
            let path = node.tagName.toLowerCase();
            const cls = (node.className && typeof node.className === 'string') ? node.className.trim().split(/\s+/).filter(c => c && !c.includes(':') && c.length < 30).slice(0, 2) : [];
            if (cls.length) path += '.' + cls.join('.');
            const parent = node.parentElement;
            if (parent) {
              const sibs = Array.from(parent.children).filter(s => s.tagName === node.tagName);
              if (sibs.length > 1) {
                const idx = sibs.indexOf(node) + 1;
                path += ':nth-child(' + idx + ')';
              }
            }
            return path;
          }
          return {
            selector: gen(el),
            text: (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 100),
            tag: el.tagName.toLowerCase(),
          };
        }, { ex: x, ey: y });
      } catch {
        return null;
      }
    }

    const send = (obj: any) => {
      if (socket.readyState === 1) {
        try { socket.send(JSON.stringify(obj)); } catch { /* ignore */ }
      }
    };

    const captureLoop = async () => {
      if (!streaming || frameInFlight) return;
      frameInFlight = true;
      try {
        const session = getActiveBrowserSession(orgId);
        if (!session) {
          send({ type: 'no_session' });
        } else {
          const buf = await session.page.screenshot({ type: 'jpeg', quality: 50, fullPage: false });
          touchBrowserSession(orgId);
          const title = await session.page.title().catch(() => '');
          send({
            type: 'frame',
            data: (buf as Buffer).toString('base64'),
            url: session.page.url(),
            title,
            ts: Date.now(),
          });
        }
      } catch (err: any) {
        send({ type: 'error', message: err?.message || 'Capture failed' });
      } finally {
        frameInFlight = false;
      }
    };

    const startStreaming = () => {
      if (streaming) return;
      streaming = true;
      // Capture immediately, then poll
      captureLoop();
      frameTimer = setInterval(captureLoop, 400); // ~2.5 fps
    };

    const stopStreaming = () => {
      streaming = false;
      if (frameTimer) {
        clearInterval(frameTimer);
        frameTimer = null;
      }
    };

    // Keep-alive ping
    pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch { /* ignore */ }
      }
    }, 15_000);

    console.log(`[browser-view] Client connected for org ${orgId}`);

    async function handleMessage(raw: any) {
      let msg: any;
      try {
        const data = typeof raw === 'string' ? raw : (raw instanceof Buffer ? raw.toString() : raw.data?.toString() ?? raw.toString());
        msg = JSON.parse(data);
      } catch {
        return;
      }

      const session = getActiveBrowserSession(orgId);

      switch (msg.type) {
        case 'start':
          startStreaming();
          break;
        case 'stop':
          stopStreaming();
          break;
        case 'click': {
          if (!session || typeof msg.x !== 'number' || typeof msg.y !== 'number') break;
          const el = await getElementAt(msg.x, msg.y);
          if (recordingSteps) {
            recordingSteps.push({
              type: 'click',
              selector: el?.selector,
              elementText: el?.text,
              elementTag: el?.tag,
              x: msg.x,
              y: msg.y,
            });
          }
          // Echo what was clicked + current recording step count (UI source of truth)
          send({
            type: 'action_recorded',
            action: 'click',
            element: el,
            x: msg.x,
            y: msg.y,
            recording: !!recordingSteps,
            stepCount: recordingSteps?.length || 0,
          });
          session.page.mouse.click(msg.x, msg.y).catch(() => {});
          break;
        }
        case 'move':
          if (session && typeof msg.x === 'number' && typeof msg.y === 'number') {
            session.page.mouse.move(msg.x, msg.y).catch(() => {});
          }
          break;
        case 'type': {
          if (!session || typeof msg.text !== 'string') break;
          if (recordingSteps) {
            recordingSteps.push({ type: 'type', value: msg.text });
          }
          send({
            type: 'action_recorded',
            action: 'type',
            element: { text: msg.text },
            recording: !!recordingSteps,
            stepCount: recordingSteps?.length || 0,
          });
          session.page.keyboard.type(msg.text, { delay: 30 }).catch(() => {});
          break;
        }
        case 'key': {
          if (!session || typeof msg.key !== 'string') break;
          if (recordingSteps) {
            recordingSteps.push({ type: 'key', key: msg.key });
          }
          send({
            type: 'action_recorded',
            action: 'key',
            element: { text: msg.key },
            recording: !!recordingSteps,
            stepCount: recordingSteps?.length || 0,
          });
          session.page.keyboard.press(msg.key).catch(() => {});
          break;
        }
        case 'scroll': {
          if (!session || typeof msg.deltaY !== 'number') break;
          if (recordingSteps) {
            recordingSteps.push({ type: 'scroll', deltaY: msg.deltaY });
          }
          send({
            type: 'action_recorded',
            action: 'scroll',
            element: { text: `${msg.deltaY > 0 ? 'down' : 'up'} ${Math.abs(msg.deltaY)}px` },
            recording: !!recordingSteps,
            stepCount: recordingSteps?.length || 0,
          });
          session.page.mouse.wheel(msg.deltaX || 0, msg.deltaY).catch(() => {});
          break;
        }
        case 'navigate': {
          if (!session || typeof msg.url !== 'string') break;
          if (recordingSteps) {
            recordingSteps.push({ type: 'navigate', url: msg.url });
          }
          send({
            type: 'action_recorded',
            action: 'navigate',
            element: { text: msg.url },
            recording: !!recordingSteps,
            stepCount: recordingSteps?.length || 0,
          });
          session.page.goto(msg.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          break;
        }
        case 'record_start': {
          recordingSteps = [];
          recordingStartUrl = session?.page.url() || '';
          send({ type: 'record_status', recording: true, stepCount: 0 });
          console.log(`[browser-view] Started recording for org ${orgId} at ${recordingStartUrl}`);
          break;
        }
        case 'record_stop': {
          recordingSteps = null;
          send({ type: 'record_status', recording: false, stepCount: 0 });
          break;
        }
        case 'record_save': {
          if (!recordingSteps || recordingSteps.length === 0) {
            send({ type: 'error', message: 'Nothing to save — start recording first' });
            break;
          }
          if (!session) {
            send({ type: 'error', message: 'No active browser session' });
            break;
          }
          try {
            // Derive domain + URL pattern from the start URL
            const startUrl = new URL(recordingStartUrl || session.page.url());
            const domain = startUrl.hostname.replace(/^www\./, '');
            const urlPattern = startUrl.pathname.split('/').slice(0, 3).join('/') || undefined;

            const name = (msg.name as string) || `Skill on ${domain}`;
            const intent = (msg.intent as string) || `User-recorded procedure (${recordingSteps.length} steps)`;

            const [saved] = await db.insert(browserSkills).values({
              orgId,
              domain,
              urlPattern,
              name,
              intent,
              steps: recordingSteps,
              source: 'user_demonstration',
              createdBy: 'user',
            } as any).returning({ id: browserSkills.id });

            send({
              type: 'record_saved',
              skillId: saved.id,
              name,
              domain,
              stepCount: recordingSteps.length,
            });
            console.log(`[browser-view] Saved skill "${name}" for ${domain} with ${recordingSteps.length} steps (id: ${saved.id})`);

            // Clear recording after save
            recordingSteps = null;
          } catch (err: any) {
            send({ type: 'error', message: `Failed to save skill: ${err?.message}` });
          }
          break;
        }
        case 'pong':
          // ignore
          break;
      }
    }

    // Handle both 'message' (WebSocket) and 'data' (stream) events
    connection.on('message', handleMessage);
    if (connection !== socket) {
      socket.on('message', handleMessage);
    }

    function cleanup() {
      stopStreaming();
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      console.log(`[browser-view] Client disconnected for org ${orgId}`);
    }

    connection.on('close', cleanup);
    connection.on('end', cleanup);
    connection.on('error', cleanup);
  });
}
