import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { knowledgeEmbeddings, knowledgeArticles } from '@lamdis/db/schema';
import { organizations } from '@lamdis/db/schema';
import { decrypt } from '../lib/crypto.js';

export default async function knowledgeSearchRoutes(app: FastifyInstance) {
  // POST /orgs/:id/knowledge/search
  app.post('/orgs/:id/knowledge/search', async (req, reply) => {
    const { id } = req.params as any;
    const { query, agent, categories, articleIds, k } = (req.body || {}) as {
      query?: string;
      agent?: { allowed_knowledge_categories?: string[]; allowed_knowledge_ids?: string[] };
      categories?: string[];
      articleIds?: string[];
      k?: number;
    };
    const topK = Math.min(Math.max(Number(k || 8), 1), 20);

    // Build filters: server-enforced intersection of agent scope and caller hints
    const allowedCats = Array.isArray(agent?.allowed_knowledge_categories) ? agent!.allowed_knowledge_categories : [];
    const allowedIds = Array.isArray(agent?.allowed_knowledge_ids) ? agent!.allowed_knowledge_ids : [];
    const hintCats = Array.isArray(categories) ? categories : [];
    const hintIds = Array.isArray(articleIds) ? articleIds : [];

    // Compute final category and id filters as intersection of agent allow-lists and caller hints
    const setIntersect = (a: string[], b: string[]) => Array.from(new Set(a)).filter(x => new Set(b).has(x));
    const finalCats = allowedCats.length && hintCats.length
      ? setIntersect(allowedCats, hintCats)
      : (allowedCats.length ? allowedCats : (hintCats.length ? hintCats : []));
    const finalIds = allowedIds.length && hintIds.length
      ? setIntersect(allowedIds, hintIds)
      : (allowedIds.length ? allowedIds : (hintIds.length ? hintIds : []));

    // Attempt vector search (pgvector cosine distance), falling back to keyword+recency when unavailable
    const q = String(query || '').trim();
    let resultsDocs: any[] | null = null;

    if (q) {
      try {
        // Resolve OpenAI embedding key (org-scoped first, then env)
        const [org] = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, id))
          .limit(1);

        let apiKey: string | undefined;
        try {
          const d = decrypt((org as any)?.integrations?.openai);
          apiKey = d?.apiKey;
        } catch {}
        if (!apiKey && process.env.OPENAI_API_KEY) apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('no_openai_key');

        const openaiBase = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
        const embedModel = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
        const er = await fetch(`${openaiBase}/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: embedModel, input: q }),
        });
        const etxt = await er.text();
        if (!er.ok) throw new Error(`embed_error:${etxt}`);
        let ejson: any;
        try { ejson = JSON.parse(etxt); } catch { throw new Error('embed_parse'); }
        const queryVector: number[] = Array.isArray(ejson?.data?.[0]?.embedding) ? ejson.data[0].embedding : [];
        if (!Array.isArray(queryVector) || !queryVector.length) throw new Error('embed_empty');

        // Format vector as string for pgvector
        const vectorString = `[${queryVector.join(',')}]`;

        // Build WHERE clause fragments for the raw SQL query
        const conditions: string[] = [`org_id = '${id}'`];
        if (finalCats.length) {
          // categories is a JSONB array; use ?| operator to check overlap
          const catsLiteral = `ARRAY[${finalCats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')}]`;
          conditions.push(`categories ?| ${catsLiteral}`);
        }
        if (finalIds.length) {
          const idsLiteral = finalIds.map(i => `'${i.replace(/'/g, "''")}'`).join(',');
          conditions.push(`article_id IN (${idsLiteral})`);
        }
        const whereClause = conditions.join(' AND ');

        // pgvector cosine distance search
        resultsDocs = (await db.execute(sql.raw(`
          SELECT *, embedding <=> '${vectorString}'::vector AS distance
          FROM knowledge_embeddings
          WHERE ${whereClause}
          ORDER BY embedding <=> '${vectorString}'::vector
          LIMIT ${topK}
        `))).rows as any[];
      } catch (e) {
        // Fall through to keyword+recency fallback
        resultsDocs = null;
      }
    }

    // Fallback or no query: keyword+recency over filtered set
    if (!resultsDocs) {
      // Build Drizzle query with filters
      const conditions = [eq(knowledgeEmbeddings.orgId, id)];
      if (finalIds.length) {
        conditions.push(inArray(knowledgeEmbeddings.articleId, finalIds));
      }

      let docs: any[];
      if (finalCats.length) {
        // For category filtering with JSONB ?| operator, use raw SQL fragment
        const catsLiteral = `ARRAY[${finalCats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')}]`;
        const catCondition = sql.raw(`categories ?| ${catsLiteral}`);
        docs = await db
          .select()
          .from(knowledgeEmbeddings)
          .where(and(...conditions, catCondition))
          .orderBy(desc(knowledgeEmbeddings.updatedAt))
          .limit(400);
      } else {
        docs = await db
          .select()
          .from(knowledgeEmbeddings)
          .where(and(...conditions))
          .orderBy(desc(knowledgeEmbeddings.updatedAt))
          .limit(400);
      }

      const scored = docs.map(d => {
        const text = `${d.articleTitle || ''}\n${d.text}`.toLowerCase();
        const terms = q ? q.toLowerCase().split(/\s+/g).filter(Boolean) : [];
        const termHits = terms.length ? terms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0) : 0;
        const recencyBoost = Math.max(0, 1 - ((Date.now() - new Date(d.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 90))); // up to ~90d
        const score = termHits * 3 + recencyBoost;
        return { d, score };
      }).sort((a, b) => b.score - a.score).slice(0, topK);
      resultsDocs = scored.map(s => s.d);
    }

    // Hydrate article meta for citations
    const byId = new Map<string, { title: string }>();
    const uniqueArticleIds = Array.from(new Set(resultsDocs.map((d: any) => d.articleId ?? d.article_id)));
    if (uniqueArticleIds.length) {
      const arts = await db
        .select({ articleId: knowledgeArticles.articleId, title: knowledgeArticles.title })
        .from(knowledgeArticles)
        .where(and(eq(knowledgeArticles.orgId, id), inArray(knowledgeArticles.articleId, uniqueArticleIds)));
      arts.forEach(a => byId.set(a.articleId, { title: a.title }));
    }

    return {
      results: resultsDocs.map((d: any) => {
        // Handle both camelCase (Drizzle select) and snake_case (raw SQL) column names
        const artId = d.articleId ?? d.article_id;
        const artTitle = d.articleTitle ?? d.article_title;
        const chunkIdx = d.chunkIndex ?? d.chunk_index;
        const chunkText = d.text ?? d.text;
        const cats = d.categories ?? [];
        return {
          articleId: artId,
          articleTitle: byId.get(artId)?.title || artTitle || '',
          chunkIndex: chunkIdx,
          text: chunkText,
          categories: cats,
        };
      }),
    };
  });
}
