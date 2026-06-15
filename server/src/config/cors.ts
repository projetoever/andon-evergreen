import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export const CORS_METHODS = ["GET", "POST", "PATCH", "OPTIONS"] as const;
export const CORS_ALLOWED_HEADERS = ["Content-Type"] as const;

function parseCorsOrigins(value: string | undefined) {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getAllowedCorsOrigins() {
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...parseCorsOrigins(process.env.CORS_ORIGINS)]));
}

function applyCorsHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedOrigins: string[],
) {
  const origin = request.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    void reply.header("Access-Control-Allow-Origin", origin);
    void reply.header("Vary", "Origin");
  }

  void reply.header("Access-Control-Allow-Methods", CORS_METHODS.join(","));
  void reply.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(","));
}

async function registerCorsPlugin(app: FastifyInstance, allowedOrigins: string[]) {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ default?: unknown }>;
  const corsModule = await dynamicImport("@fastify/cors");
  const corsPlugin = corsModule.default;

  if (typeof corsPlugin !== "function") {
    throw new Error("Plugin @fastify/cors inválido");
  }

  await app.register(corsPlugin as unknown as FastifyPluginAsync<Record<string, unknown>>, {
    origin: allowedOrigins,
    methods: [...CORS_METHODS],
    allowedHeaders: [...CORS_ALLOWED_HEADERS],
  });
}

function registerGlobalCorsHeaders(app: FastifyInstance, allowedOrigins: string[]) {
  app.addHook("onRequest", async (request, reply) => {
    applyCorsHeaders(request, reply, allowedOrigins);

    if (request.method === "OPTIONS") {
      return reply.status(204).send();
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    applyCorsHeaders(request, reply, allowedOrigins);
    return payload;
  });
}

export function registerCorsSupport(app: FastifyInstance) {
  const allowedOrigins = getAllowedCorsOrigins();

  registerGlobalCorsHeaders(app, allowedOrigins);

  void registerCorsPlugin(app, allowedOrigins).catch((error) => {
    app.log.warn(
      { error },
      "Não foi possível registrar @fastify/cors; mantendo hooks CORS globais locais.",
    );
  });
}
