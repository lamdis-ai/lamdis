import { NextResponse } from 'next/server';

export async function PATCH() {
  return NextResponse.json({ error: 'Agents are deprecated. Please use Testing → Suites.' }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Agents are deprecated. Please use Testing → Suites.' }, { status: 410 });
}
