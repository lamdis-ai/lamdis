import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  return NextResponse.json({ integrations: {} }, { status: 200 });
}

export async function PATCH(_: NextRequest) {
  return NextResponse.json({ error: 'gone' }, { status: 410 });
}
