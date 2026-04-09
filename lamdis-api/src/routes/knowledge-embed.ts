import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { knowledgeArticles, knowledgeEmbeddings } from '@lamdis/db/schema';

function splitMarkdownIntoChunks(md: string, maxLen = 800): string[] {
  const lines = md.split(/\r?\n/);
  const chunks: string[] = [];
  let buf: string[] = [];
  const push = () => { if (buf.length) { chunks.push(buf.join('\n')); buf = []; } };
  for (const ln of lines) {
    if (/^\s*#/.test(ln) && buf.join('\n').length > 0) push();
    buf.push(ln);
    if (buf.join('\n').length >= maxLen) push();
  }
  push();
  return chunks.filter(c => c.trim().length > 0);
}

function expandTagPaths(tags?: string[]): string[] {
  const out = new Set<string>();
  if (!Array.isArray(tags)) return [];
  for (const raw of tags) {
    const t = String(raw || '').trim();
    if (!t) continue;
    out.add(t);
    if (t.includes('/')) {
      const parts = t.split('/').map(s => s.trim()).filter(Boolean);
      let acc: string[] = [];
      for (const p of parts) {
        acc.push(p);
        out.add(acc.join('/'));
      }
    }
  }
  return Array.from(out);
}

export default async function knowledgeEmbedRoutes(app: FastifyInstance) {
  // POST /orgs/:id/knowledge/:kid/embed -> rebuild embeddings for one article
  app.post('/orgs/:id/knowledge/:kid/embed', async (req, reply) => {
    const { id, kid } = req.params as any;
    const openaiBase = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
    const openaiKey = process.env.OPENAI_API_KEY || '';
    if (!openaiKey) return reply.code(500).send({ error: 'OPENAI_API_KEY missing' });

    const [art] = await db
      .select()
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.orgId, id), eq(knowledgeArticles.articleId, kid)))
      .limit(1);
    if (!art) return reply.code(404).send({ error: 'not_found' });

    const content = typeof art.content === 'string' ? art.content : JSON.stringify(art.content || '');
    const md = String(content || '');
    const chunks = splitMarkdownIntoChunks(md, 800);
    const title = art.title || kid;
    // Store all tags and their parent paths so agents scoped to a parent (e.g., "Guides") match nested content (e.g., "Guides/Setup").
    const categories = expandTagPaths(art.tags as string[] | undefined);

    // Batch embed chunks (simple loop; optimize with parallel batching as needed)
    let idx = 0;
    const upserts: Array<{
      orgId: string;
      articleId: string;
      articleTitle: string;
      categories: string[];
      chunkIndex: number;
      text: string;
      embedding: number[];
      updatedAt: Date;
    }> = [];

    for (const text of chunks) {
      const r = await fetch(`${openaiBase}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small', input: text }),
      });
      const j = await r.json();
      const vec = Array.isArray(j?.data?.[0]?.embedding) ? j.data[0].embedding as number[] : [];
      if (!vec.length) continue;
      upserts.push({
        orgId: id,
        articleId: kid,
        articleTitle: title,
        categories,
        chunkIndex: idx++,
        text,
        embedding: vec,
        updatedAt: new Date(),
      });
    }

    // Upsert by (orgId, articleId, chunkIndex)
    for (const u of upserts) {
      const [existing] = await db
        .select({ id: knowledgeEmbeddings.id })
        .from(knowledgeEmbeddings)
        .where(
          and(
            eq(knowledgeEmbeddings.orgId, u.orgId),
            eq(knowledgeEmbeddings.articleId, u.articleId),
            eq(knowledgeEmbeddings.chunkIndex, u.chunkIndex),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(knowledgeEmbeddings)
          .set({
            articleTitle: u.articleTitle,
            categories: u.categories,
            text: u.text,
            embedding: u.embedding,
            updatedAt: u.updatedAt,
          })
          .where(eq(knowledgeEmbeddings.id, existing.id));
      } else {
        await db
          .insert(knowledgeEmbeddings)
          .values({
            orgId: u.orgId,
            articleId: u.articleId,
            articleTitle: u.articleTitle,
            categories: u.categories,
            chunkIndex: u.chunkIndex,
            text: u.text,
            embedding: u.embedding,
            createdAt: u.updatedAt,
            updatedAt: u.updatedAt,
          });
      }
    }

    return { ok: true, chunks: upserts.length };
  });
}
