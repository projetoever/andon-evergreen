import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { registerModuleRoutes } from "./modules.js";
import { ACCESS_COOKIE } from "../access/http.js";

const stationId = "ws_00000000-0000-4000-8000-000000000037";
test("Hub module access reflects the verified central login, not legacy module passwords", async (t) => {
  const prevFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const prevOrigin = process.env.ANDON_ACCESS_ORIGIN;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const originals = {
    workstation: prisma.workstation.findUnique,
    settings: prisma.systemSettings.findUnique,
    credentials: prisma.moduleCredential.findMany,
    priorities: prisma.dashboardPriorityConfig.findUnique,
    session: prisma.accessSession.findUnique,
  };
  let purpose = "normal";
  prisma.workstation.findUnique = (async () => ({
    id: stationId, name: "Notebook", active: true, pendingApproval: false,
    allowOperational: true, allowBi: true, allowPriorities: true,
    lockedMachineId: null, admission: null,
  })) as unknown as typeof originals.workstation;
  prisma.systemSettings.findUnique = (async () => ({
    hubEnabled: true,
  })) as unknown as typeof originals.settings;
  prisma.moduleCredential.findMany = (async () => [
    { id: "operational", passwordRequired: true, credentialVersion: 2 },
    { id: "bi", passwordRequired: true, credentialVersion: 3 },
  ]) as unknown as typeof originals.credentials;
  prisma.dashboardPriorityConfig.findUnique = (async () => ({
    passwordRequired: true,
  })) as unknown as typeof originals.priorities;
  prisma.accessSession.findUnique = (async () => ({
    id: "session", workstationId: stationId, purpose,
    authorizationVersion: 1, revokedAt: null, createdAt: new Date(),
    lastInteractionAt: new Date(), expiresAt: new Date(Date.now() + 3600_000),
    workstation: { active: true, pendingApproval: false },
    user: {
      id: "u", login: "manager", displayName: "Manager", roleLabel: "Manager",
      accountType: "person", active: true, isPrimaryAdmin: false,
      mustChangePassword: purpose !== "normal", authorizationVersion: 1,
      machineScope: "all", machines: [],
      permissions: [{ key: "andon.read" }, { key: "bi.read" },
        { key: "priorities.read" }],
    },
  })) as unknown as typeof originals.session;
  t.after(() => {
    prisma.workstation.findUnique = originals.workstation;
    prisma.systemSettings.findUnique = originals.settings;
    prisma.moduleCredential.findMany = originals.credentials;
    prisma.dashboardPriorityConfig.findUnique = originals.priorities;
    prisma.accessSession.findUnique = originals.session;
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
  await registerModuleRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: ACCESS_COOKIE + "=" + "a".repeat(64),
  };
  const response = await app.inject({ url: "/api/modules/access", headers });
  assert.equal(response.statusCode, 200);
  const modules = response.json().modules;
  for (const id of ["operational", "bi"]) {
    const item = modules.find((m: { id: string }) => m.id === id);
    assert.equal(item.allowed, true);
    assert.equal(item.passwordRequired, false);
    assert.equal(item.authenticated, true);
  }
  const priorities = modules.find((m: { id: string }) => m.id === "priorities");
  assert.equal(priorities.passwordRequired, true,
    "priority credential is NOT removed until its migration is reviewed");

  purpose = "password_change";
  const provisional = (await app.inject({ url: "/api/modules/access", headers })).json();
  assert.equal(provisional.modules.find((m: {id: string}) => m.id === "operational").allowed, false);
  assert.equal(provisional.modules.find((m: {id: string}) => m.id === "bi").authenticated, false);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = (await app.inject({ url: "/api/modules/access", headers })).json();
  assert.equal(legacy.modules.find((m: {id: string}) => m.id === "operational").passwordRequired, true);
  assert.equal(legacy.modules.find((m: {id: string}) => m.id === "bi").authenticated, false);
});
