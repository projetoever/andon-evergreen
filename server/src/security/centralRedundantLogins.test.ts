import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerModuleCredentialRoutes } from "../routes/moduleCredentials.js";
import { registerDashboardPriorityRoutes } from "../routes/dashboardPriority.js";
import { createModuleSession, hasModuleSession, enforceModuleAuthorization } from "./moduleAuthorization.js";

const station = "ws_00000000-0000-4000-8000-000000000037";
const policy = { passwordRequired: true, credentialVersion: 1 };
const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;

test("S3: central ON blocks redundant ANDON/BI and Prioridades logins before credential lookups", async (t) => {
  t.after(() => {
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  const app = Fastify();
  t.after(() => app.close());
  void registerModuleCredentialRoutes(app);
  registerDashboardPriorityRoutes(app);

  for (const [url, payload, expected] of [
    ["/api/modules/operational/login", { username: "op", password: "s3-testing" }, "legacy_module_login_disabled"],
    ["/api/modules/bi/login", { username: "bi", password: "s3-testing" }, "legacy_module_login_disabled"],
    ["/api/dashboard-priority/login", { username: "mgr", password: "s3-testing" }, "legacy_priority_login_disabled"],
  ] as const) {
    const response = await app.inject({ url, method: "POST", payload });
    assert.equal(response.statusCode, 403, url);
    assert.equal(response.json().error, expected);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().token, undefined);
  }
});

test("S3: legacy module sessions cannot survive central activation or return to legacy mode", async (t) => {
  t.after(() => {
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = createModuleSession("bi", station, "legacy", 1);
  const request = {
    headers: {
      "x-andon-workstation-id": station,
      "x-andon-bi-token": legacy.token,
    },
  } as never;
  assert.equal(hasModuleSession(request, "bi", policy), true);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  assert.equal(hasModuleSession(request, "bi", policy), false);
  assert.throws(() => createModuleSession("bi", station, "legacy", 1), /legacy_module_session_disabled/);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  assert.equal(hasModuleSession(request, "bi", policy), false);
  const newSession = createModuleSession("bi", station, "legacy", 1);
  assert.equal(hasModuleSession({
    headers: { "x-andon-workstation-id": station, "x-andon-bi-token": newSession.token },
  } as never, "bi", policy), true);
});

test("S3: central module auth hook never checks a stored module password or Bearer", async (t) => {
  t.after(() => {
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  const app = Fastify();
  t.after(() => app.close());
  app.addHook("preHandler", enforceModuleAuthorization);
  app.get("/api/analytics/overview", async () => ({ ok: true }));
  const response = await app.inject({ url: "/api/analytics/overview" });
  assert.equal(response.statusCode, 200);
  // The preceding central workstation/session gate remains essential in the real server.
});

test("S3/2: central ON rejects legacy module and priority credential settings before DB lookups", async (t) => {
  const previous = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  t.after(() => {
    if (previous === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previous;
  });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  const app = Fastify();
  t.after(() => app.close());
  void registerModuleCredentialRoutes(app);
  registerDashboardPriorityRoutes(app);

  for (const { method, url, payload, code } of [
    { method: "GET", url: "/api/modules/credentials",
      code: "legacy_module_credentials_disabled" },
    { method: "PUT", url: "/api/modules/operational/credentials",
      payload: { username: "op", password: "NotSaved123", passwordRequired: true },
      code: "legacy_module_credentials_disabled" },
    { method: "PUT", url: "/api/modules/bi/credentials",
      payload: { username: "bi", password: "NotSaved123", passwordRequired: true },
      code: "legacy_module_credentials_disabled" },
    { method: "PATCH", url: "/api/dashboard-priority/access-policy",
      payload: { passwordRequired: false }, code: "legacy_priority_credentials_disabled" },
    { method: "PUT", url: "/api/dashboard-priority/credentials",
      payload: { username: "lead", password: "NotSaved123" },
      code: "legacy_priority_credentials_disabled" },
  ] as const) {
    const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
    assert.equal(res.statusCode, 403, `${method} ${url}`);
    assert.equal(res.json().error, code);
    assert.equal(res.json().token, undefined);
    assert.equal(res.headers["cache-control"], "no-store");
  }

  // No database fixtures are needed: all five paths must fail before making
  // a Prisma call, keeping stored legacy secrets intact for explicit rollback.
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  for (const { method, url, payload } of [
    { method: "PUT", url: "/api/modules/operational/credentials",
      payload: { username: "op", passwordRequired: "invalid" } },
    { method: "PATCH", url: "/api/dashboard-priority/access-policy",
      payload: { passwordRequired: "invalid" } },
    { method: "PUT", url: "/api/dashboard-priority/credentials",
      payload: { username: "x", password: "short" } },
  ] as const) {
    const res = await app.inject({ method, url, payload });
    assert.equal(res.statusCode, 400, `${method} ${url} legacy mode must preserve validation`);
  }
});
