import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/orgs/assistant/apply
 * 
 * DISABLED - This endpoint is no longer available.
 * The AI Assistant now operates in READ-ONLY mode for security.
 * 
 * Users cannot create, update, or delete resources through the assistant.
 * Use the regular dashboard UI to make changes to tests, suites, and other resources.
 */
export async function POST(req: NextRequest) {
  console.warn('[Assistant Apply API] Blocked attempt to apply operations - assistant is read-only');
  
  return NextResponse.json(
    { 
      error: 'Operation not permitted',
      message: 'The AI Assistant operates in read-only mode for security. Changes cannot be applied through the assistant. Please use the dashboard UI to create, update, or delete resources.',
      readOnly: true,
    },
    { status: 403 }
  );
}