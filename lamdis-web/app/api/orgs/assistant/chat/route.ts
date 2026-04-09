import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * POST /api/orgs/assistant/chat
 * 
 * Chat with the Lamdis AI Assistant (READ-ONLY MODE).
 * 
 * SECURITY: This endpoint now defaults to 'lamdis-readonly' mode which:
 * - Only allows read operations (list, get)
 * - Automatically redacts credentials and secrets
 * - Enforces org-scoped data access
 * - Blocks prompt injection attempts
 * 
 * The 'lamdis' (full write) mode is no longer available through this endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getBearerSafe();
    const body = await req.json();
    const { orgId, message, history } = body;

    // Extract orgId from the object if needed (frontend sometimes sends the full org object)
    const resolvedOrgId = typeof orgId === 'object' ? orgId?.orgId : orgId;

    if (!resolvedOrgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    // SECURITY: Always use read-only mode - ignore any mode parameter from client
    const secureMode = 'lamdis-readonly';

    // Call the backend assistant API
    const response = await fetch(`${API_BASE}/orgs/${resolvedOrgId}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({
        message,
        history: history || [],
        mode: secureMode,
      }),
    });

    const data = await response.json().catch(() => ({}));

    // Add read-only indicator to response
    if (data && typeof data === 'object') {
      data.readOnly = true;
    }

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Assistant Chat API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
