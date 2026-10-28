import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { createAdminSession, revokeAdminSession } from "../security/adminAuthorization.js";
import { registerAdminAuthRoutes } from "../routes/adminAuth.js";
import { describeMaintenanceStationAuthorization } from "./workstationCompletionDiagnostics.js";

const WS_A = "ws_00000000-0000-4000-8000-0000000000aa";
const WS_B = "ws_00000000-0000-4000-8000-0000000000bb";
const session = (id: string | null, endedAt: Date | null = null, cycleIndex = 1) => ({
  workstationId: id,
  cycleIndex,
  phase: "maintenance",
  endedAt,
  workstation: id ? { name: "Estação de teste", active: true } : null,
});

test("diagnostic matches server behavior for active cycle, ended participants and legacy records", () => {
  const a = session(WS_A, new Date(), 1);
  const b = session(WS_B, null, 1);
  const older = session(WS_A, null, 0);
  assert.equal(describeMaintenanceStationAuthorization([a, b], WS_A, true, true).outcome, "different_workstation");
  assert.equal(describeMaintenanceStationAuthorization([a, b], WS_B, true, true).outcome, "authorized");
  assert.equal(describeMaintenanceStationAuthorization([older, b], WS_A, true, true).outcome, "different_workstation");
  assert.equal(describeMaintenanceStationAuthorization([session(null)], null, null, true).outcome, "legacy_no_provenance");
  assert.equal(describeMaintenanceStationAuthorization([b], WS_B, false, true).outcome, "inactive");
  assert.equal(describeMaintenanceStationAuthorization([b], null, null, true).outcome, "unidentified");
  assert.equal(describeMaintenanceStationAuthorization([b], null, null, false).outcome, "restriction_off");
  const output = describeMaintenanceStationAuthorization([b], WS_B, true, true);
  assert.deepEqual(output.authorizedStations, [{ suffix: "000000bb", name: "Estação de teste", active: true }]);
  assert(!JSON.stringify(output).includes(WS_B), "diagnostic must not return the complete UUID");
});

test("Admin diagnostic endpoint requires existing admin session and never mutates calls", async (t) => {
  const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldCalls = prisma.andonCall.findUnique;
  const oldSettings = prisma.systemSettings.findUnique;
  const oldStations = prisma.workstation.findUnique;
  const token = createAdminSession("admin").token;
  let calls = 0, settings = 0, stations = 0;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  prisma.andonCall.findUnique = (async () => {
    calls++;
    return { id: "call01", machineId: "37", status: "in_progress", category: "maintenance",
      technicianSessions: [session(WS_A)] };
  }) as unknown as typeof oldCalls;
  prisma.systemSettings.findUnique = (async () => {
    settings++;
    return { restrictMaintenanceCompletionToAttendanceWorkstation: true };
  }) as unknown as typeof oldSettings;
  prisma.workstation.findUnique = (async () => {
    stations++;
    return { active: true };
  }) as unknown as typeof oldStations;

  const app = Fastify();
  registerAdminAuthRoutes(app);
  t.after(async () => {
    revokeAdminSession(token);
    await app.close();
    prisma.andonCall.findUnique = oldCalls;
    prisma.systemSettings.findUnique = oldSettings;
    prisma.workstation.findUnique = oldStations;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });

  const path = "/api/admin-auth/workstation-attendance-diagnostic?callId=call01";
  const noAuth = await app.inject({ url: path });
  assert.equal(noAuth.statusCode, 401);
  assert.equal(calls, 0);
  assert.equal(settings, 0);
  assert.equal(stations, 0);
  assert.equal(noAuth.headers["cache-control"], "no-store");

  const headers = { authorization: `Bearer ${token}`, "x-andon-workstation-id": WS_A };
  const allowed = await app.inject({ url: path, headers });
  assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(allowed.json().outcome, "authorized");
  assert.equal(allowed.json().advisoryOnly, true);
  assert(!allowed.body.includes(WS_A));
  assert.equal(calls, 1);
  assert.equal(settings, 1);
  assert.equal(stations, 1);
  const other = await app.inject({
    url: path, headers: { ...headers, "x-andon-workstation-id": WS_B },
  });
  assert.equal(other.statusCode, 200);
  assert.equal(other.json().outcome, "different_workstation");
  assert(!other.body.includes(WS_A));
  assert(!other.body.includes(WS_B));
  const bad = await app.inject({ url: "/api/admin-auth/workstation-attendance-diagnostic?callId=./..", headers });
  assert.equal(bad.statusCode, 400);
  assert.equal(calls, 2);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  const central = await app.inject({ url: path, headers });
  assert.equal(central.statusCode, 403);
  assert.equal(central.json().error, "central_admin_integration_pending");
  assert.equal(calls, 2);
});
