import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const PERIOD =
  "/api/analytics/maintenance?startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00";
const principal = (scope: "all" | "selected", machineIds: string[]): Principal => ({
  userId: "maintenance-scope-user",
  login: "maintenance.manager",
  displayName: "Manager",
  roleLabel: "Gestor",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: scope,
  machineIds,
  permissions: ["bi.read"],
  sessionId: "maintenance-scope-session",
  workstationId: "ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose: "normal",
  authenticatedAt: new Date(),
});
const sample = (id: string, machineId: string, callMachineId: string) => ({
  id,
  callId: "call-" + id,
  machineId,
  technicianId: "tec-" + id,
  call: { machineId: callMachineId, failureResponsibility: "maintenance" },
  technicianName: "Technician " + id,
  technicalArea: "mechanical",
  phase: "maintenance",
  cycleIndex: 1,
  startedAt: new Date("2026-10-01T12:00:00Z"),
  endedAt: new Date("2026-10-01T12:30:00Z"),
});

test("B2.4C/2: maintenance person-time never includes another machine's technician or call", async (t) => {
  const before = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const originalPolicy = prisma.failureClassification.findMany;
  const originalSessions = prisma.technicianSession.findMany;
  let policyReads = 0;
  const queries: any[] = [];
  let scope: "all" | "selected" = "selected";
  let ids: string[] = ["37"];
  let bind = true;
  const records = [
    sample("allowed", "37", "37"),
    sample("foreign", "38", "38"),
    sample("crosslink", "37", "38"),
  ];
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  prisma.failureClassification.findMany = (async () => {
    policyReads++;
    return [];
  }) as unknown as typeof originalPolicy;
  prisma.technicianSession.findMany = (async (query: any) => {
    queries.push(query);
    const sessionWhere = query.where.machineId;
    const callWhere = query.where.call.machineId;
    const accepted = (id: string, condition: any) =>
      condition === undefined ||
      (typeof condition === "string" ? condition === id : condition.in.includes(id));
    return records.filter((entry) =>
      accepted(entry.machineId, sessionWhere) &&
      accepted(entry.call.machineId, callWhere),
    );
  }) as unknown as typeof originalSessions;

  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    if (bind) bindAuthorizedMachineReadPrincipal(request, principal(scope, ids));
  });
  await registerAnalyticsRoutes(app);
  t.after(async () => {
    await app.close();
    prisma.failureClassification.findMany = originalPolicy;
    prisma.technicianSession.findMany = originalSessions;
    if (before === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = before;
  });

  const denied = await app.inject({ url: PERIOD + "&machineId=38" });
  assert.equal(denied.statusCode, 404, denied.body);
  assert.equal(policyReads, 0, "foreign ID must fail before policy/catalog access");
  assert.equal(queries.length, 0);
  const deniedHead = await app.inject({ method: "HEAD", url: PERIOD + "&machineId=38" });
  assert.equal(deniedHead.statusCode, 404);
  assert.equal(policyReads, 0);

  const allowed = await app.inject({ url: PERIOD });
  assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(allowed.json().totals.totalPersonMinutes, 30);
  assert.equal(allowed.json().totals.technicianCount, 1);
  assert(!allowed.body.includes("foreign"));
  assert(!allowed.body.includes("crosslink"));
  assert.deepEqual(queries.at(-1).where.machineId, { in: ["37"] });
  assert.deepEqual(queries.at(-1).where.call.machineId, { in: ["37"] });
  const allowedExplicit = await app.inject({ url: PERIOD + "&machineId=37" });
  assert.equal(allowedExplicit.statusCode, 200, allowedExplicit.body);
  assert.equal(queries.at(-1).where.machineId, "37");
  assert.deepEqual(queries.at(-1).where.call.machineId, { in: ["37"] });

  ids = [];
  const zero = await app.inject({ url: PERIOD });
  assert.equal(zero.statusCode, 200, zero.body);
  assert.equal(zero.json().totals.totalPersonMinutes, 0);
  assert.equal(zero.json().totals.technicianCount, 0);
  assert.deepEqual(queries.at(-1).where.machineId, { in: [] });
  assert.deepEqual(queries.at(-1).where.call.machineId, { in: [] });

  scope = "all";
  const global = await app.inject({ url: PERIOD });
  assert.equal(global.statusCode, 200, global.body);
  assert.equal(global.json().totals.totalPersonMinutes, 90);
  assert.equal(Object.hasOwn(queries.at(-1).where, "machineId"), false);
  assert.equal(Object.hasOwn(queries.at(-1).where.call, "machineId"), false);

  bind = false;
  const unbound = await app.inject({ url: PERIOD });
  assert.equal(unbound.statusCode, 403, unbound.body);
  assert.equal(queries.length, 4, "unbound request must not read technician sessions");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = await app.inject({ url: PERIOD });
  assert.equal(legacy.statusCode, 200, legacy.body);
  assert.equal(legacy.json().totals.totalPersonMinutes, 90);
  assert.equal(Object.hasOwn(queries.at(-1).where, "machineId"), false);
});
