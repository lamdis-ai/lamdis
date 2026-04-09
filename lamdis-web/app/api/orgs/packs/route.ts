import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth0';
import { cookies } from 'next/headers';

const API_URL = process.env.LAMDIS_API_URL || 'http://localhost:3001';

async function getOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = await getSession();
  if (!session?.user?.sub) return null;
  const orgCookie = cookieStore.get('lamdis_org');
  return orgCookie?.value || null;
}

// GET /api/orgs/packs - List all marketplace packs or installed packs
export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  if (!orgId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const installed = searchParams.get('installed') === 'true';
  
  try {
    let url: string;
    if (installed) {
      // Get installed packs for this org
      url = `${API_URL}/orgs/${orgId}/packs`;
    } else {
      // Get marketplace packs
      const params = new URLSearchParams();
      ['search', 'industry', 'useCase', 'framework', 'featured', 'limit', 'offset'].forEach(key => {
        const val = searchParams.get(key);
        if (val) params.set(key, val);
      });
      url = `${API_URL}/packs?${params.toString()}`;
    }
    
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json({ error }, { status: res.status });
    }
    
    return NextResponse.json(await res.json());
  } catch (err) {
    console.error('Error fetching packs:', err);
    return NextResponse.json({ error: 'Failed to fetch packs' }, { status: 500 });
  }
}

