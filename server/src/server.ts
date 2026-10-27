import "./config/env.js";
import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { registerAccessRoutes } from "./routes/access.js";

import { registerCorsSupport } from "./config/cors.js";
import { enforceAdminAuthorization } from "./security/adminAuthorization.js";
import { enforceWorkstationAccess } from "./security/workstationAccess.js";
import { enforceModuleAuthorization } from "./security/moduleAuthorization.js";
import { prisma } from "./db/prisma.js";
import {
  createPlcRuntime,
  registerPlcHealthRoute,
} from "./integrations/plc/index.js";
import { registerAdminAuthRoutes } from "./routes/adminAuth.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerAndonCallRoutes } from "./routes/andonCalls.js";
import { registerAndonCategoryRoutes } from "./routes/andonCategories.js";
import { registerFailureClassificationRoutes } from "./routes/failureClassifications.js";
import { registerDashboardPriorityRoutes } from "./routes/dashboardPriority.js";
import { registerDiagnosisAuditRoutes } from "./routes/diagnosisAudit.js";
import { registerFailureEventRoutes } from "./routes/failureEvents.js";
import { registerHealthDbRoute } from "./routes/healthDb.js";
import { registerMachineRoutes } from "./routes/machines.js";
import { registerMachineCatalogRoutes } from "./routes/machineCatalogs.js";
import { registerMachineSetRoutes } from "./routes/machineSets.js";
import { registerMachineSubsetRoutes } from "./routes/machineSubsets.js";
import { registerShiftRoutes } from "./routes/shifts.js";
import { registerSystemSettingsRoutes } from "./routes/systemSettings.js";
import { registerTechnicianRoutes } from "./routes/technicians.js";
import { registerWorkstationRoutes } from "./routes/workstations.js";
import { registerModuleRoutes } from "./routes/modules.js";
import { registerModuleCredentialRoutes } from "./routes/moduleCredentials.js";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";

export function buildServer() {
  const tls = process.env.ANDON_TLS_CERT && process.env.ANDON_TLS_KEY
    ? { cert: readFileSync(process.env.ANDON_TLS_CERT), key: readFileSync(process.env.ANDON_TLS_KEY) }
    : undefined;
  const app = Fastify({ logger: { redact: ["req.headers.cookie", "req.headers.authorization", "req.headers.x-andon-csrf"] }, ...(tls ? { https: tls } : {}) });
  const plcRuntime = createPlcRuntime({
    debug: (bindings, message) => app.log.debug(bindings, message),
    info: (bindings, message) => app.log.info(bindings, message),
    warn: (bindings, message) => app.log.warn(bindings, message),
    error: (bindings, message) => app.log.error(bindings, message),
  });

  registerCorsSupport(app);
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);

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
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }));

  void registerHealthDbRoute(app);
  void registerAdminAuthRoutes(app);
  void registerAccessRoutes(app);
  void registerAnalyticsRoutes(app);
  void registerPlcHealthRoute(app, plcRuntime);
  void registerMachineRoutes(app);
  void registerMachineCatalogRoutes(app);
  void registerMachineSetRoutes(app);
  void registerMachineSubsetRoutes(app);
  void registerAndonCategoryRoutes(app);
  void registerAndonCallRoutes(app);
  void registerFailureEventRoutes(app);
  void registerDiagnosisAuditRoutes(app);
  void registerSystemSettingsRoutes(app);
  void registerDashboardPriorityRoutes(app);
  void registerTechnicianRoutes(app);
  void registerShiftRoutes(app);
  void registerFailureClassificationRoutes(app);
  void registerWorkstationRoutes(app);
  void registerModuleRoutes(app);
  void registerModuleCredentialRoutes(app);

  app.addHook("onReady", async () => {
    await plcRuntime.start();
  });

  app.addHook("onClose", async () => {
    await plcRuntime.stop();
  });

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
