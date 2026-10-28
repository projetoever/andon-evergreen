import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createAdminSession, revokeAdminSession } from "../security/adminAuthorization.js";
import { registerTlsAdministrationRoutes } from "./tlsAdministration.js";

test("TLS inventory rejects anonymous access, HTTP and central mode before disclosure", async () => {
  const app = Fastify();
  registerTlsAdministrationRoutes(app);
  await app.ready();
  const savedOrigin = process.env.ANDON_ACCESS_ORIGIN;
  const savedCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  try {
    process.env.ANDON_ACCESS_ORIGIN = "https://127.0.0.1:8080";
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    const anon = await app.inject({ method: "GET", url: "/api/admin-auth/tls-status" });
    assert.equal(anon.statusCode, 401);
    assert.equal(anon.json().error, "admin_auth_required");
    const admin = createAdminSession("admin");
    const request = {
      method: "GET" as const,
      url: "/api/admin-auth/tls-status",
      headers: { authorization: "Bearer " + admin.token, origin: "https://127.0.0.1:8080" },
    };
    const overHttp = await app.inject(request);
    assert.equal(overHttp.statusCode, 426);
    assert(!overHttp.body.includes("PRIVATE KEY"));
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    const central = await app.inject(request);
    assert.equal(central.statusCode, 403);
    revokeAdminSession(admin.token);
  } finally {
    if (savedOrigin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
    else process.env.ANDON_ACCESS_ORIGIN = savedOrigin;
    if (savedCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = savedCentral;
    await app.close();
  }
});
