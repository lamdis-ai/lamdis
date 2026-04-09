import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'lamdis-web';

  if (!uri) {
    throw new Error('MONGODB_URI env var is required for contact form');
  }

  if (!client) {
    client = new MongoClient(uri);
  }

  await client.connect();

  cachedDb = client.db(dbName);
  return cachedDb;
}

export function getContactsCollection(db: Db): Collection {
  return db.collection('contacts');
}
