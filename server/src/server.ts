import cors from '@fastify/cors';
import Fastify from 'fastify';

import { env } from './config/env.js';
import { registerHealthRoutes } from './routes/health.js';

export async function buildServer() {
  const server = Fastify({
    logger: true,
  });

  await server.register(cors, {
    origin: env.corsOrigin,
  });

  await server.register(registerHealthRoutes);

  return server;
}

async function startServer(): Promise<void> {
  const server = await buildServer();

  await server.listen({
    port: env.port,
    host: env.host,
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
