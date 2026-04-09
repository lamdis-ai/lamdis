import { NextRequest, NextResponse } from 'next/server';
import { getBearerSafe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const token = await getBearerSafe();
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'pdf';
  const includeTranscripts = searchParams.get('includeTranscripts') || 'true';
  const includeJudgeReasoning = searchParams.get('includeJudgeReasoning') || 'true';

  const api = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

  try {
    const url = `${api}/runs/${encodeURIComponent(params.runId)}/export?format=${format}&includeTranscripts=${includeTranscripts}&includeJudgeReasoning=${includeJudgeReasoning}`;
    
    const resp = await fetch(url, {
      headers: { Authorization: token },
      cache: 'no-store',
    });

    if (!resp.ok) {
      const txt = await resp.text();
      let data: any;
      try {
        data = JSON.parse(txt);
      } catch {
        data = { error: txt };
      }
      return NextResponse.json(data, { status: resp.status });
    }

    // Get the content and headers
    const content = await resp.text();
    const contentType = resp.headers.get('content-type') || 'text/html';
    const contentDisposition = resp.headers.get('content-disposition') || '';

    // Return the content with appropriate headers
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
