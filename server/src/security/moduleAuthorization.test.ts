import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { createAdminSession, enforceAdminAuthorization } from "./adminAuthorization.js";
import { enforceWorkstationAccess } from "./workstationAccess.js";
import { createModuleSession, enforceModuleAuthorization } from "./moduleAuthorization.js";
import { registerModuleCredentialRoutes } from "../routes/moduleCredentials.js";

const id = "ws_00000000-0000-4000-8000-000000000037";
test("module tokens are scoped to station, API family, expiry and credential version", async (t) => {
  let version = 1;
  const lookup = prisma.moduleCredential.findUnique;
  prisma.moduleCredential.findUnique = (async () => ({
    passwordRequired: true,
    credentialVersion: version,
  })) as unknown as typeof lookup;
  t.after(() => {
    prisma.moduleCredential.findUnique = lookup;
  });
  const app = Fastify();
  t.after(() => app.close());
  app.addHook("preHandler", enforceModuleAuthorization);
  app.get("/api/machines", async () => ({ ok: true }));
  app.get("/api/analytics/overview", async () => ({ ok: true }));
  app.post("/api/andon-calls", async () => ({ ok: true }));
  const session = createModuleSession("operational", id, "operator", version);
  const headers = { "x-andon-workstation-id": id, "x-andon-operational-token": session.token };
  assert.equal((await app.inject({ url: "/api/machines", headers })).statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/machines" })).statusCode,
    401,
    "no-Origin legacy requests cannot bypass an enabled password",
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/andon-calls",
        method: "POST",
        headers: { authorization: `Bearer ${createAdminSession("admin").token}` },
      })
    ).statusCode,
    401,
    "Admin is separate from module access",
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/machines",
        headers: { ...headers, "x-andon-workstation-id": id.replace(/37$/, "38") },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/analytics/overview",
        headers: { ...headers, "x-andon-bi-token": session.token },
      })
    ).statusCode,
    401,
    "a token from ANDON cannot enter BI",
  );
  version++;
  assert.equal(
    (await app.inject({ url: "/api/machines", headers })).statusCode,
    401,
    "credential updates revoke prior tokens",
  );
  const expiring = createModuleSession("bi", id, "manager", version);
  t.mock.method(Date, "now", () => Date.parse(expiring.expiresAt));
  assert.equal(
    (
      await app.inject({
        url: "/api/analytics/overview",
        headers: { "x-andon-workstation-id": id, "x-andon-bi-token": expiring.token },
      })
    ).statusCode,
    401,
  );
});

test("central Admin provisions hashed credentials; station permission remains required at login", async (t) => {
  type Config = {
    id: string;
    username: string | null;
    passwordHash: string | null;
    passwordRequired: boolean;
    credentialVersion: number;
  };
  const configs = new Map<string, Config>();
  let station = { id, active: true, allowOperational: true, allowBi: true, allowPriorities: true };
  const lookup = prisma.moduleCredential.findUnique,
    list = prisma.moduleCredential.findMany,
    upsert = prisma.moduleCredential.upsert,
    stationLookup = prisma.workstation.findUnique;
  prisma.moduleCredential.findUnique = (async ({ where }: { where: { id: string } }) =>
    configs.get(where.id) ?? null) as unknown as typeof lookup;
  prisma.moduleCredential.findMany = (async () => [...configs.values()]) as unknown as typeof list;
  prisma.moduleCredential.upsert = (async ({
    where,
    create,
    update,
  }: {
    where: { id: string };
    create: Config;
    update: Omit<Config, "credentialVersion"> & { credentialVersion: { increment: number } };
  }) => {
    const old = configs.get(where.id);
    const saved = old
      ? {
          ...old,
          ...update,
          credentialVersion: old.credentialVersion + update.credentialVersion.increment,
        }
      : create;
    configs.set(where.id, saved);
    return saved;
  }) as unknown as typeof upsert;
  prisma.workstation.findUnique = (async () => station) as unknown as typeof stationLookup;
  t.after(() => {
    prisma.moduleCredential.findUnique = lookup;
    prisma.moduleCredential.findMany = list;
    prisma.moduleCredential.upsert = upsert;
    prisma.workstation.findUnique = stationLookup;
  });
  const app = Fastify();
  t.after(() => app.close());
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerModuleCredentialRoutes(app);
  app.get("/api/machines", async () => ({ ok: true }));
  const headers = { "x-andon-workstation-id": id, origin: "http://localhost:8080" };
  const admin = { ...headers, authorization: `Bearer ${createAdminSession("admin").token}` };
  const settings = {
    username: "operator",
    password: "testing-module-password",
    passwordRequired: true,
  };
  assert.equal(
    (
      await app.inject({
        url: "/api/modules/operational/credentials",
        method: "PUT",
        headers,
        payload: settings,
      })
    ).statusCode,
    401,
  );
  assert.equal((await app.inject({ url: "/api/modules/credentials", headers })).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        url: "/api/modules/operational/credentials",
        method: "PUT",
        headers: admin,
        payload: { username: "operator", passwordRequired: true },
      })
    ).statusCode,
    400,
  );
  const saved = await app.inject({
    url: "/api/modules/operational/credentials",
    method: "PUT",
    headers: admin,
    payload: settings,
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().passwordHash, undefined);
  assert.match(configs.get("operational")!.passwordHash!, /^scrypt\$/);
  assert.equal(
    (
      await app.inject({
        url: "/api/modules/operational/login",
        method: "POST",
        headers,
        payload: { username: "operator", password: "wrong-password" },
      })
    ).statusCode,
    401,
  );
  const login = await app.inject({
    url: "/api/modules/operational/login",
    method: "POST",
    headers,
    payload: settings,
  });
  assert.equal(login.statusCode, 200);
  const authenticated = { ...headers, "x-andon-operational-token": login.json().token };
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: authenticated })).statusCode,
    200,
  );
  station = { ...station, allowOperational: false };
  assert.equal(
    (
      await app.inject({
        url: "/api/modules/operational/login",
        method: "POST",
        headers,
        payload: settings,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: authenticated })).statusCode,
    403,
  );
  station = { ...station, active: false };
  assert.equal(
    (await app.inject({ url: "/api/modules/credentials", headers: admin })).statusCode,
    200,
    "Admin recovery remains available without module access",
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/modules/operational/credentials",
        method: "PUT",
        headers: admin,
        payload: { username: "operator", passwordRequired: false },
      })
    ).statusCode,
    200,
  );
  assert.equal((await app.inject({ url: "/api/machines", headers: admin })).statusCode, 403);
});
