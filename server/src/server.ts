import "./config/env.js";
import Fastify from "fastify";

import { registerCorsSupport } from "./config/cors.js";
import { prisma } from "./db/prisma.js";
import { registerAndonCallRoutes } from "./routes/andonCalls.js";
import { registerFailureClassificationRoutes } from "./routes/failureClassifications.js";
import { registerFailureEventRoutes } from "./routes/failureEvents.js";
import { registerHealthDbRoute } from "./routes/healthDb.js";
import { registerMachineRoutes } from "./routes/machines.js";
import { registerShiftRoutes } from "./routes/shifts.js";
import { registerTechnicianRoutes } from "./routes/technicians.js";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";

export function buildServer() {
  const app = Fastify({ logger: true });

  registerCorsSupport(app);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ error }, "Erro ao processar requisição");

    const requestError = error as Error & { statusCode?: number };
    const statusCode =
      requestError.statusCode && requestError.statusCode >= 400 ? requestError.statusCode : 500;

    return reply.status(statusCode).send({
      error: statusCode === 500 ? "internal_server_error" : "request_error",
      message: statusCode === 500 ? "Erro interno ao processar requisição" : requestError.message,
      ...(process.env.NODE_ENV === "production" ? {} : { details: requestError.stack }),
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "andon-evergreen-api",
    timestamp: new Date().toISOString(),
  }));

  void registerHealthDbRoute(app);
  void registerMachineRoutes(app);
  void registerAndonCallRoutes(app);
  void registerFailureEventRoutes(app);
  void registerTechnicianRoutes(app);
  void registerShiftRoutes(app);
  void registerFailureClassificationRoutes(app);

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
