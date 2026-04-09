import type { FastifyPluginAsync } from 'fastify';
import { getPublicUrl } from '../services/tunnel/tunnelService.js';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ ok: true }));
  app.get('/tunnel', async () => ({
    tunnelActive: !!getPublicUrl(),
    publicUrl: getPublicUrl(),
  }));
};

export default routes;
