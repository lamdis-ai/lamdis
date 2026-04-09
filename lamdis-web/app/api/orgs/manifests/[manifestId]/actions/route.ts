import { NextResponse } from 'next/server';

export async function GET() { return NextResponse.json({ error: 'gone', note: 'Legacy Manifests are removed.' }, { status: 410 }); }
export async function PUT() { return NextResponse.json({ error: 'gone', note: 'Legacy Manifests are removed.' }, { status: 410 }); }
