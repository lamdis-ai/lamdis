import { NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export async function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL as string;
  const bearer = await getBearerSafe();

  const out: any = { bearerPresent: !!bearer };
  if (!bearer) {
    out.note = 'No bearer token available on the web tier.';
    return NextResponse.json(out, { status: 200 });
  }

  // Call /me first
  const meRes = await fetch(`${api}/me`, { headers: { Authorization: bearer } });
  let meBody: any = null;
  try { meBody = await meRes.json(); } catch {}
  out.me = { status: meRes.status, body: meBody };

  // Then try /me/bootstrap
  const bootRes = await fetch(`${api}/me/bootstrap`, { method: 'POST', headers: { Authorization: bearer } });
  let bootBody: any = null;
  try { bootBody = await bootRes.json(); } catch {}
  out.bootstrap = { status: bootRes.status, body: bootBody };

  return NextResponse.json(out);
}
