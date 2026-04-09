import { NextResponse } from 'next/server';

export async function POST() { return NextResponse.json({ error: 'gone', note: 'Legacy Agents are removed.' }, { status: 410 }); }
