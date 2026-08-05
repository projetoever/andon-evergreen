import type { FastifyInstance } from "fastify";
import type { PlcRuntime } from "../PlcRuntime.js";

export async function registerPlcHealthRoute(
  app: FastifyInstance,
  runtime: PlcRuntime,
) {
  app.get("/health/plc", async () => runtime.getHealth());
}
