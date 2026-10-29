import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { enforceWorkstationAccess } from "./workstationAccess.js";
import { enforceModuleAuthorization } from "./moduleAuthorization.js";
import { ACCESS_COOKIE } from "../access/http.js";

const stationId = "ws_00000000-0000-4000-8000-000000000037";
const token = "a".repeat(64);
test("SEC-04 single central login bypasses only legacy module passwords, not central ACL or write deny", async (t) => {
  const prevFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const prevOrigin = process.env.ANDON_ACCESS_ORIGIN;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const originalStation = prisma.workstation.findUnique;
  const originalSession = prisma.accessSession.findUnique;
  const originalCredential = prisma.moduleCredential.findUnique;
  let allowBi = true;
  let canReadBi = true;
  let legacyLookup = 0;
  prisma.workstation.findUnique = (async () => ({
    id: stationId, active: true, pendingApproval: false,
    allowOperational: true, allowBi, allowPriorities: false,
  })) as typeof originalStation;
  prisma.moduleCredential.findUnique = (async () => {
    legacyLookup++;
    return { passwordRequired: true, credentialVersion: 1 };
  }) as unknown as typeof originalCredential;
  prisma.accessSession.findUnique = (async () => ({
    id: "central-session", workstationId: stationId, purpose: "normal",
    authorizationVersion: 1, revokedAt: null,
    createdAt: new Date(), lastInteractionAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
    workstation: { id: stationId, active: true, pendingApproval: false },
    user: {
      id: "central-user", login: "manager", displayName: "Manager", roleLabel: "Manager",
      accountType: "person", isPrimaryAdmin: false, active: true,
      mustChangePassword: false, authorizationVersion: 1, machineScope: "all",
      permissions: [
        { key: "andon.read" }, ...(canReadBi ? [{ key: "bi.read" }] : []),
      ],
      machines: [],
    },
  })) as typeof originalSession;
  t.after(() => {
    prisma.workstation.findUnique = originalStation;
    prisma.accessSession.findUnique = originalSession;
    prisma.moduleCredential.findUnique = originalCredential;
    if (prevFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = prevFlag;
    if (prevOrigin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
    else process.env.ANDON_ACCESS_ORIGIN = prevOrigin;
  });

  const app = Fastify();
  t.after(() => app.close());
  app.addHook("onRequest", async (req) => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  // The order must match buildServer; central ACL always precedes module auth.
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceModuleAuthorization);
  app.get("/api/machines", async () => ({ ok: true }));
  app.get("/api/analytics/overview", async () => ({ ok: true }));
  app.post("/api/andon-calls", async () => ({ ok: true }));

  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: ACCESS_COOKIE + "=" + token,
  };
  assert.equal((await app.inject({ url: "/api/machines", headers })).statusCode, 200);
  assert.equal((await app.inject({ url: "/api/analytics/overview", headers })).statusCode, 200);
  assert.equal(legacyLookup, 0, "central mode must not query legacy module password");
  assert.equal((await app.inject({ url: "/api/machines",
    headers: { origin: headers.origin, "x-andon-workstation-id": stationId },
  })).statusCode, 401, "missing central session cannot pass via legacy mode");

  canReadBi = false;
  assert.equal((await app.inject({ url: "/api/analytics/overview", headers })).statusCode, 403,
    "central permission stays mandatory");
  canReadBi = true;
  allowBi = false;
  assert.equal((await app.inject({ url: "/api/analytics/overview", headers })).statusCode, 403,
    "workstation module allowance stays mandatory");
  allowBi = true;
  const write = await app.inject({ url: "/api/andon-calls", method: "POST", headers });
  assert.equal(write.statusCode, 403, "central write gate must remain closed");
  assert.equal(write.json().error, "central_action_not_supported");
  assert.equal(legacyLookup, 0);
});
