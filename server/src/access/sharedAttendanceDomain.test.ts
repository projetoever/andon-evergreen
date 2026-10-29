import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("SEC-04/2A.9b1: legacy and verified central call the same attendance state transition", async () => {
  const route = await readFile(new URL("../routes/andonCalls.ts", import.meta.url), "utf8");
  const sharedStart = route.indexOf("async function persistAttendanceTransition(");
  const centralStart = route.indexOf("export async function applyVerifiedCentralAttendanceDomainTransition(");
  const sharedEnd = route.indexOf("async function ensureOpenFailureEventForStoppedCall", centralStart);
  assert(sharedStart >= 0 && centralStart > sharedStart && sharedEnd > centralStart);
  const shared = route.slice(sharedStart, centralStart);
  const central = route.slice(centralStart, sharedEnd);
  assert.match(shared, /await tx\.andonCall\.update/);
  assert.match(shared, /attendedAt: currentCall\.attendedAt \?\? transitionAt/);
  assert.match(shared, /currentAttendanceStartedAt: transitionAt/);
  assert.match(shared, /await createTechnicianSessions\(tx/);
  assert.match(shared, /workstationId,/);
  assert.match(shared, /await syncMachineOperationalState\(tx, currentCall\.machineId\)/);
  assert.match(shared, /return findCallWithSessions\(tx, currentCall\.id\)/);

  const attendStart = route.indexOf('"/api/andon-calls/:id/attend"');
  const cancelStart = route.indexOf('"/api/andon-calls/:id/cancel"', attendStart);
  const legacy = route.slice(attendStart, cancelStart);
  assert.match(legacy, /await lockMachineCallFlow\(tx, call\.machineId\)/);
  assert.match(legacy, /await resolveAttendanceWorkstationId\(tx/);
  assert.match(legacy, /await resolveAttendanceTechnicians\(tx, currentCall, body\)/);
  assert.match(legacy, /await lockAndFindMissingActiveTechnicians\(tx/);
  assert.match(legacy, /return persistAttendanceTransition\(tx/);
  assert.doesNotMatch(legacy, /await tx\.andonCall\.update\(/,
    "legacy endpoint must delegate to shared transition, not maintain a second implementation");

  assert.match(central, /parseWorkstationId\(workstationId\)/);
  assert.match(central, /station\.pendingApproval/);
  assert.match(central, /currentCall\.status !== "open"/);
  assert.match(central, /currentCall\.isSystemTest/);
  assert.match(central, /technicianIdentitySelect/);
  assert.match(central, /getTechnicianTechnicalAreas\(verified\)/);
  assert.match(central, /await lockAndFindMissingActiveTechnicians\(tx/);
  assert.match(central, /return persistAttendanceTransition\(tx/);
});

test("SEC-04/2A.9b1: fixed server-only adapter invokes verified credentials and atomic audit wrapper", async () => {
  const adapter = await readFile(new URL("../services/centralVerifiedAttendanceDomain.ts", import.meta.url), "utf8");
  assert.match(adapter, /runCentralAttendanceWithVerifiedTechnician\(db/);
  assert.match(adapter, /applyVerifiedCentralAttendanceDomainTransition\(/);
  assert.doesNotMatch(adapter, /registerAndonCallRoutes|app\.(patch|post)|route\(/);
  const guard = await readFile(new URL("./centralAttendanceAtomicAudit.ts", import.meta.url), "utf8");
  assert.match(guard, /await appendAudit\(tx/);
  assert.match(guard, /await input\.verifyAndApplyAttendance\(tx, call\)/);
  const security = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(security, /central_action_not_supported/);
});
