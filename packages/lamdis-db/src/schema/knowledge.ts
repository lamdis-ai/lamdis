import { pgTable, text, uuid, timestamp, integer, jsonb, uniqueIndex, index, customType } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// pgvector custom type — stores float[] as vector(dimensions)
const vector = customType<{ data: number[]; dpiverName: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown) {
    if (typeof value === 'string') {
      return value.replace(/[\[\]]/g, '').split(',').map(Number);
    }
    return value as number[];
  },
});

export const knowledgeCategories = pgTable('knowledge_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  path: text('path').notNull(), // e.g., "Guides/Setup"
  name: text('name').notNull(),
  description: text('description'),
  order: integer('order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('knowledge_categories_org_path_unique').on(t.orgId, t.path),
  index('knowledge_categories_org_id_idx').on(t.orgId),
]);

export const knowledgeArticles = pgTable('knowledge_articles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  articleId: text('article_id').notNull(), // slug per org
  title: text('title').notNull(),
  summary: text('summary'),
  content: jsonb('content'),
  contentType: text('content_type').default('text/markdown'),
  status: text('status').default('draft'), // 'draft','published'
  tags: jsonb('tags').$type<string[]>().default([]),
  version: text('version'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('knowledge_articles_org_article_id_unique').on(t.orgId, t.articleId),
  index('knowledge_articles_org_id_idx').on(t.orgId),
]);

export const knowledgeEmbeddings = pgTable('knowledge_embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  articleId: text('article_id').notNull(),
  articleTitle: text('article_title'),
  categories: jsonb('categories').$type<string[]>().default([]),
  chunkIndex: integer('chunk_index').notNull(),
  text: text('text').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('knowledge_embeddings_org_article_chunk_unique').on(t.orgId, t.articleId, t.chunkIndex),
  index('knowledge_embeddings_org_id_idx').on(t.orgId),
  index('knowledge_embeddings_article_id_idx').on(t.articleId),
  index('knowledge_embeddings_org_updated_at_idx').on(t.orgId, t.updatedAt),
  // NOTE: HNSW index for vector search must be created via raw SQL migration:
  // CREATE INDEX knowledge_embeddings_embedding_idx ON knowledge_embeddings
  //   USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
]);
