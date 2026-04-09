import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  return NextResponse.json({ error: 'Domain verification is disabled.' }, { status: 410 });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ error: 'Domain verification is disabled.' }, { status: 410 });
}
