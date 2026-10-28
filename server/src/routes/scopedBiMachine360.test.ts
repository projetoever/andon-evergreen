import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const principal = (machineScope: "selected" | "all", machineIds: string[]): Principal => ({
  userId: "u_machine360",
  login: "analyst.user",
  displayName: "Analyst",
  roleLabel: "Gestor/Gerente",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope,
  machineIds,
  permissions: ["bi.read"],
  sessionId: "s_machine360",
  workstationId: "ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose: "normal",
  authenticatedAt: new Date(),
});

const path = (machineId: string) =>
  `/api/analytics/machine-360?machineId=${machineId}&startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00`;

test("Machine 360 rejects out-of-scope machines before any database access", async (t) => {
  const oldFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const original = {
    findMachine: prisma.machine.findUnique,
    classifications: prisma.failureClassification.findMany,
  };
  let machineReads = 0;
  let policyReads = 0;
  let scope: "selected" | "all" = "selected";
  let machineIds: string[] = ["37"];
  let bind = true;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  prisma.machine.findUnique = (async () => {
    machineReads++;
    return null; // Authorized IDs reach lookup; these fixtures do not contain a real machine.
  }) as unknown as typeof original.findMachine;
  prisma.failureClassification.findMany = (async () => {
    policyReads++;
    return [];
  }) as typeof original.classifications;

  t.after(() => {
    prisma.machine.findUnique = original.findMachine;
    prisma.failureClassification.findMany = original.classifications;
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldFlag;
  });

  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    if (bind) bindAuthorizedMachineReadPrincipal(request, principal(scope, machineIds));
  });
  await registerAnalyticsRoutes(app);
  t.after(() => app.close());

  const denied = await app.inject({ url: path("38") });
  assert.equal(denied.statusCode, 404, denied.body);
  assert.equal(denied.json().error, "Máquina não encontrada");
  assert.equal(machineReads, 0, "unauthorized machine metadata must not be queried");
  assert.equal(policyReads, 0, "unauthorized request must not query even the analytics policy");

  const deniedHead = await app.inject({ method: "HEAD", url: path("38") });
  assert.equal(deniedHead.statusCode, 404);
  assert.equal(machineReads, 0);
  assert.equal(policyReads, 0);

  machineIds = [];
  const noMachines = await app.inject({ url: path("37") });
  assert.equal(noMachines.statusCode, 404);
  assert.equal(machineReads, 0);
  assert.equal(policyReads, 0);

  machineIds = ["37"];
  const allowed = await app.inject({ url: path("37") });
  assert.equal(allowed.statusCode, 404, allowed.body);
  assert.equal(machineReads, 1, "authorized machine reaches the normal lookup");
  assert.equal(policyReads, 1);

  scope = "all";
  const fullScope = await app.inject({ url: path("38") });
  assert.equal(fullScope.statusCode, 404, fullScope.body);
  assert.equal(machineReads, 2);
  assert.equal(policyReads, 2);

  bind = false;
  const missingBinding = await app.inject({ url: path("38") });
  assert.equal(missingBinding.statusCode, 403, missingBinding.body);
  assert.equal(missingBinding.json().error, "permission_denied");
  assert.equal(machineReads, 2);
  assert.equal(policyReads, 2);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = await app.inject({ url: path("38") });
  assert.equal(legacy.statusCode, 404, legacy.body);
  assert.equal(machineReads, 3, "legacy mode retains its existing database behavior");
  assert.equal(policyReads, 3);
});
