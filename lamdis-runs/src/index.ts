import 'dotenv/config';
import Fastify from 'fastify';
import runsRoutes from './routes/runs.js';
import { getPool } from '@lamdis/db/connection';

const app = Fastify({ logger: true });

// Simple health
app.get('/health', async () => ({ ok: true }));

// Register routes
await app.register(runsRoutes);

async function initDatabase() {
  const dbUrl = process.env.DATABASE_URL || 'postgres://lamdis:lamdis@localhost:5432/lamdis';
  app.log.info(`Connecting to PostgreSQL: ${dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  const pool = getPool({ connectionString: dbUrl });
  await pool.query('SELECT 1');
  app.log.info('PostgreSQL connected');
}

await initDatabase();

const PORT = Number(process.env.PORT || 3101);
app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`lamdis-runs listening on :${PORT}`);
}).catch((err)=>{
  app.log.error(err);
  process.exit(1);
});
