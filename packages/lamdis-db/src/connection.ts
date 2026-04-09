import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export type Database = NodePgDatabase<typeof schema>;

export function getPool(config?: PoolConfig): Pool {
  if (!_pool) {
    const rawConnStr = config?.connectionString || process.env.DATABASE_URL || 'postgres://lamdis:lamdis@localhost:5432/lamdis';
    const needsSsl = rawConnStr.includes('rds.amazonaws.com') || rawConnStr.includes('sslmode=');
    // Strip sslmode from URL to prevent pg from overriding our ssl config
    const connStr = needsSsl ? rawConnStr.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '') : rawConnStr;
    const { connectionString: _ignored, ...restConfig } = config || {} as PoolConfig;
    _pool = new Pool({
      connectionString: connStr,
      max: 20,
      ...restConfig,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return _pool;
}

export function getDb(config?: PoolConfig): Database {
  if (!_db) {
    _db = drizzle(getPool(config), { schema });
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
