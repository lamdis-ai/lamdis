// Central Drizzle database instance for lamdis-api route handlers
import { getDb, type Database } from '@lamdis/db/connection';

export const db: Database = getDb();
export type { Database };
