import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/health', async () => ({
    status: 'ok',
    service: 'andon-api',
    timestamp: new Date().toISOString(),
  }));
}
