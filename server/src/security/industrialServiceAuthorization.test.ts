import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { enforceWorkstationAccess } from "./workstationAccess.js";
import { enforceModuleAuthorization } from "./moduleAuthorization.js";

test("central service bearer permits only allowlisted reads and never becomes a browser bypass", async (t) => {
  const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const previousOrigin = process.env.ANDON_ACCESS_ORIGIN;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const originalSession = prisma.industrialServiceSession.findUnique;
  const originalTouch = prisma.industrialServiceSession.updateMany;
  const originalPolicy = prisma.systemSettings.findUnique;
  const originalModule = prisma.moduleCredential.findUnique;
  let revoked = false;
  let passwordRequired = true;
  prisma.industrialServiceSession.findUnique = (async () => ({
    id: "service-session",
    tokenHash: "hash",
    serviceId: "service-id",
    secretVersion: 1,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: new Date(),
    revokedAt: revoked ? new Date() : null,
    service: {
      id: "service-id",
      name: "Node-RED",
      active: true,
      scopes: ["machines.read", "calls.read", "sound.read"],
      secretHash: "protected",
      secretVersion: 1,
      secretExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    },
  })) as unknown as typeof originalSession;
  prisma.industrialServiceSession.updateMany = (async () => ({
    count: 0,
  })) as unknown as typeof originalTouch;
  prisma.systemSettings.findUnique = (async () => null) as unknown as typeof originalPolicy;
  prisma.moduleCredential.findUnique = (async () => ({
    passwordRequired,
    credentialVersion: 1,
  })) as unknown as typeof originalModule;
  t.after(() => {
    prisma.industrialServiceSession.findUnique = originalSession;
    prisma.industrialServiceSession.updateMany = originalTouch;
    prisma.systemSettings.findUnique = originalPolicy;
    prisma.moduleCredential.findUnique = originalModule;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
    if (previousOrigin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
    else process.env.ANDON_ACCESS_ORIGIN = previousOrigin;
  });

  const app = Fastify();
  t.after(() => app.close());
  app.addHook("onRequest", async (request) => {
    Object.defineProperty(request.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceModuleAuthorization);
  app.route({
    url: "/api/machines",
    method: ["GET", "PATCH"],
    handler: async () => ({ ok: true }),
  });
  app.get("/api/andon-calls/history", async () => ({ ok: true }));

  const authorization = `Bearer andon-service-v1.${"a".repeat(43)}`;
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: { authorization } })).statusCode,
    200,
    "service authentication bypasses the separate legacy module password only after scope checks",
  );
  const mutation = await app.inject({
    url: "/api/machines",
    method: "PATCH",
    headers: { authorization },
  });
  assert.equal(mutation.statusCode, 403);
  assert.equal(mutation.json().error, "service_scope_denied");
  assert.equal(
    (await app.inject({ url: "/api/andon-calls/history", headers: { authorization } })).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/machines",
        headers: { authorization, origin: "https://andon.test" },
      })
    ).statusCode,
    403,
  );
  revoked = true;
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: { authorization } })).statusCode,
    401,
  );
  revoked = false;
  assert.equal((await app.inject({ url: "/api/machines" })).statusCode, 403);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  passwordRequired = false;
  assert.equal(
    (await app.inject({ url: "/api/machines" })).statusCode,
    200,
    "legacy no-Origin/no-UUID behavior remains unchanged while central access is disabled",
  );
});
