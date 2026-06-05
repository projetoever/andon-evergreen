import "./config/env.js";
import Fastify from "fastify";

import { prisma } from "./db/prisma.js";
import { registerHealthDbRoute } from "./routes/healthDb.js";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "andon-evergreen-api",
    timestamp: new Date().toISOString(),
  }));

  void registerHealthDbRoute(app);

  return app;
}

async function start() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const host = process.env.HOST ?? DEFAULT_HOST;

  const close = async () => {
    await app.close();
    await prisma.$disconnect();
  };

  process.once("SIGINT", close);
  process.once("SIGTERM", close);

  await app.listen({ port, host });
}

start().catch((error) => {
  console.error("Erro ao iniciar API ANDON:", error);
  process.exit(1);
});
