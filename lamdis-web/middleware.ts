import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Lightweight middleware — no Auth0 SDK import (it was hanging).
 * Auth is handled lazily at the route/page level instead.
 */
export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  // Only match dashboard routes to check session
  matcher: ['/dashboard/:path*'],
};
