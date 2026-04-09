import { getBearerSafe } from '@/lib/auth';
import { getOrgId } from '@/lib/apiProxy';

const API_URL = () => (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Quick-create: creates (or reuses) an outcome type + creates an instance + starts agent.
 * POST { goal: string, playbookId?: string }
 *
 * If playbookId is provided, we use the playbook's existing outcomeTypeId
 * instead of creating a new outcome type. The orchestrator will then
 * automatically pick up the playbook for this instance.
 *
 * Returns { outcomeTypeId, instanceId, playbookId? }
 */
export async function POST(req: Request) {
  try {
    const token = await getBearerSafe();
    if (!token) return new Response('Unauthorized', { status: 401 });
    const orgId = await getOrgId(token);
    if (!orgId) return new Response('No org', { status: 400 });

    const { goal, playbookId } = await req.json();
    if (!goal || typeof goal !== 'string') {
      return new Response(JSON.stringify({ error: 'goal is required' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const base = API_URL();
    const headers = { Authorization: token, 'Content-Type': 'application/json' };

    let outcomeTypeId: string | undefined;

    // 1. Resolve outcome type — either via playbook or by creating one
    if (playbookId) {
      const pbRes = await fetch(`${base}/orgs/${orgId}/playbooks/${playbookId}`, { headers });
      const pb = await pbRes.json();
      if (!pb?.outcomeTypeId) {
        return new Response(JSON.stringify({ error: 'Playbook not found or has no outcome type', detail: pb }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      outcomeTypeId = pb.outcomeTypeId;
    } else {
      const otRes = await fetch(`${base}/orgs/${orgId}/outcomes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: goal.slice(0, 100),
          description: goal,
          riskClass: 'medium',
          agentConfig: { autoStart: true },
        }),
      });
      const ot = await otRes.json();
      if (!ot?.id) return new Response(JSON.stringify({ error: 'Failed to create outcome type', detail: ot }), { status: 500, headers: { 'content-type': 'application/json' } });
      outcomeTypeId = ot.id;
    }

    // 2. Create outcome instance
    const oiRes = await fetch(`${base}/orgs/${orgId}/outcome-instances`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        outcomeTypeId,
        label: goal.slice(0, 100),
      }),
    });
    const oi = await oiRes.json();
    if (!oi?.id) return new Response(JSON.stringify({ error: 'Failed to create instance', detail: oi }), { status: 500, headers: { 'content-type': 'application/json' } });

    // 3. Start agent
    await fetch(`${base}/orgs/${orgId}/outcome-instances/${oi.id}/agent/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ goal }),
    });

    return new Response(JSON.stringify({
      outcomeTypeId,
      instanceId: oi.id,
      playbookId: playbookId || null,
      goal,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}
