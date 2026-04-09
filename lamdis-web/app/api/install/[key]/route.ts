import { NextRequest, NextResponse } from 'next/server';

export async function POST(_: NextRequest, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  // Deprecated: kept for backward compatibility during pivot; redirect to Action Library.
  console.log('install (deprecated endpoint)', params.key);
  return NextResponse.redirect('/app/action-library');
}
