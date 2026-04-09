import { NextRequest, NextResponse } from 'next/server';
import { getDb, getContactsCollection } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, email, company, message, source } = body ?? {};

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = await getDb();
    const contacts = getContactsCollection(db);

    const now = new Date();
    await contacts.insertOne({
      name,
      email,
      company: company || null,
      message,
      createdAt: now,
      updatedAt: now,
      source: source || 'landing-contact',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/contact', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
