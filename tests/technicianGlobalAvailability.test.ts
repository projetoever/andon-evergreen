import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("P0: Production and Admin use the same server-owned, global busy-set", async () => {
  const [modal, selector, service, route, guard] = await Promise.all([
    read("../src/components/calls/TechnicianIdentificationModal.tsx"),
    read("../src/components/calls/TechnicianSelector.tsx"),
    read("../src/services/technicianConfigService.ts"),
    read("../server/src/routes/technicians.ts"),
    read("../server/src/security/workstationAccess.ts"),
  ]);
  assert.match(modal, /getGlobalTechnicianAvailability\(call\.id\)/);
  assert.match(modal, /if \(!centralAttendance\)/);
  assert.match(modal, /return buildTechnicianActiveAssignmentMap\(calls, machines, call\?\.id\)/);
  assert.match(modal, /getGlobalTechnicianAvailability/);
  assert.match(modal, /setGlobalAvailabilityState\("error"\)/);
  assert.match(modal, /globalAvailabilityState === "ready"/);
  assert.match(modal, /centralAttendance && globalAvailabilityState !== "ready"/);
  assert.match(selector, /disabled=\{unavailable\}/);
  assert.match(service, /api\/technicians\/availability\?callId=/);
  assert.match(route, /busyTechnicianIdsFromGlobalSessions/);
  assert.match(route, /where: \{ endedAt: null, callId: \{ not: callId \} \}/);
  assert.match(route, /"Cache-Control", "no-store"/);
  assert.doesNotMatch(route, /machineId:.*busyTechnicianIds/);
  assert.match(guard, /request\.method === "GET" && path === "\/api\/technicians\/availability"/);
  assert.match(guard, /assertPermission\(principal, attendancePermission\)/);
});

test("P0: session policy never replaces selected permissions and station safeguards remain", async () => {
  const [editor, policy, sessions] = await Promise.all([
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/services/persistentSessionEligibility.ts"),
    read("../server/src/access/sessions.ts"),
  ]);
  assert.doesNotMatch(editor, /Verificação de elegibilidade da conta/);
  assert.doesNotMatch(editor, /persistentSessionIncompatibleGrants/);
  assert.match(editor, /value=\{draft\.sessionPolicy\}/);
  assert.doesNotMatch(editor, /Usar permissões de Produção 24h/);
  assert.doesNotMatch(editor, /suggestedPersistentProductionGrants/);
  assert.match(editor, /value="daily"/);
  assert.match(editor, /value="persistent"/);
  assert.match(policy, /const PERSISTENT_OPERATIONAL_ALLOWED_KEYS/);
});
