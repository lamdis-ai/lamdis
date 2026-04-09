import type { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/me', async (req) => {
    return { user: (req as any).user };
  });
};

export default routes;
