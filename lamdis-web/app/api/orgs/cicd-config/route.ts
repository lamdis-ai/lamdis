import { NextRequest, NextResponse } from 'next/server';
import { getSession, getAccessToken } from '@/lib/auth0';

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  
  // Use getAccessToken to ensure token is refreshed if expired
  const tokenResult = await getAccessToken();
  if (!tokenResult?.token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orgId = request.headers.get('x-org-id');
  if (!orgId) {
    return NextResponse.json({ error: 'org_id_required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/orgs/${orgId}/cicd-config`, {
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
      },
    });

    if (res.status === 404) {
      // Return default config if not found
      return NextResponse.json({
        enabled: false,
        provider: 'github',
        commentOnPR: true,
        failOnThreshold: true,
        passThreshold: 80,
        includeDetails: true,
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Error fetching CI/CD config:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  
  // Use getAccessToken to ensure token is refreshed if expired
  const tokenResult = await getAccessToken();
  if (!tokenResult?.token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const orgId = request.headers.get('x-org-id');
  if (!orgId) {
    return NextResponse.json({ error: 'org_id_required' }, { status: 400 });
  }

  try {
    const body = await request.json();

    const res = await fetch(`${API_URL}/orgs/${orgId}/cicd-config`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Error saving CI/CD config:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

