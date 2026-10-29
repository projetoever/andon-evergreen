import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, type Principal } from "./policy.js";
import { preflightCentralCallWrite, type CentralCallWritePreflightInput } from "./centralCallWritePreflight.js";

const principal: Principal = {
  userId: "operator-1",
  login: "operator",
  displayName: "Operator",
  roleLabel: "Production",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: "selected",
  machineIds: ["37"],
  permissions: ["andon.read", "calls.open", "calls.attend"],
  sessionId: "session-1",
  workstationId: "ws-1",
  purpose: "normal",
  authenticatedAt: new Date("2026-10-28T12:00:00Z"),
};
const workstation = {
  id: "ws-1", active: true,
  allowOperational: true, allowBi: false, allowPriorities: false,
};
const open = { method: "POST", path: "/api/andon-calls", body: { machineId: "37", origin: "kiosk" } };
const batch = { method: "POST", path: "/api/andon-calls/batch", body: { machineId: "37", subtypes: ["7", "8"] } };
const attend = { method: "PATCH", path: "/api/andon-calls/call-37/attend", callId: "call-37", body: { machineId: "39" } };
function input(request: CentralCallWritePreflightInput["request"], changes: Partial<CentralCallWritePreflightInput> = {}) {
  return { principal, workstation, request, ...changes };
}
async function rejects(action: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}

test("SEC-04/2A: single and multi-sector openings authorize the server-scoped machine only", async () => {
  const normal = await preflightCentralCallWrite(input(open));
  assert.deepEqual(normal, { operation: "open", machineId: "37", permission: "calls.open" });
  const multiple = await preflightCentralCallWrite(input(batch));
  assert.deepEqual(multiple, { operation: "open_batch", machineId: "37", permission: "calls.open" });
  await rejects(preflightCentralCallWrite(input({ ...batch, body: { machineId: "39", subtypes: ["7", "8"] } })), "machine_scope_denied");
  await rejects(preflightCentralCallWrite(input({ ...open, body: { machineId: ["37"] } })), "invalid_action_resource", 400);
  await rejects(preflightCentralCallWrite(input({ ...open, body: { machineId: 37 } })), "invalid_action_resource", 400);
  await rejects(preflightCentralCallWrite(input({ ...open, body: { machineId: " 37 " } })), "invalid_action_resource", 400);
});

test("SEC-04/2A: block system-test and forged creator/origin from human call opening", async () => {
  for (const extra of [
    { isSystemTest: true }, { isSystemTest: false },
    { createdBy: "installer-health" }, { origin: "installer_health_check" },
  ]) await rejects(preflightCentralCallWrite(input({
    ...open, body: { machineId: "37", ...extra },
  })), "reserved_call_origin");
});

test("SEC-04/2A: session, workstation, module and action authorization are cumulative", async () => {
  await rejects(preflightCentralCallWrite(input(open, {
    principal: { ...principal, purpose: "password_change" },
  })), "password_change_required");
  await rejects(preflightCentralCallWrite(input(open, {
    workstation: { ...workstation, active: false },
  })), "workstation_inactive");
  await rejects(preflightCentralCallWrite(input(open, {
    workstation: { ...workstation, id: "ws-foreign" },
  })), "workstation_session_mismatch");
  await rejects(preflightCentralCallWrite(input(open, {
    workstation: { ...workstation, pendingApproval: true },
  })), "workstation_inactive");
  await rejects(preflightCentralCallWrite(input(open, {
    workstation: { ...workstation, allowOperational: false },
  })), "workstation_module_denied");
  await rejects(preflightCentralCallWrite(input(open, {
    principal: { ...principal, permissions: ["calls.open"] },
  })), "permission_denied");
  await rejects(preflightCentralCallWrite(input(open, {
    principal: { ...principal, permissions: ["andon.read"] },
  })), "permission_denied");
  await rejects(preflightCentralCallWrite(input(open, {
    principal: { ...principal, machineIds: [] },
  })), "machine_scope_denied");
});

test("SEC-04/2A: attend obtains machine scope from trusted call record, not untrusted body", async () => {
  let lookups = 0;
  const resolver = async (id: string) => {
    lookups++;
    assert.equal(id, "call-37");
    return "37";
  };
  const ok = await preflightCentralCallWrite(input(attend, { resolveCallMachineId: resolver }));
  assert.deepEqual(ok, { operation: "attend", machineId: "37", permission: "calls.attend" });
  assert.equal(lookups, 1);
  await rejects(preflightCentralCallWrite(input(attend, {
    resolveCallMachineId: async () => "39",
  })), "call_not_found", 404);
  await rejects(preflightCentralCallWrite(input(attend, {
    resolveCallMachineId: async () => null,
  })), "call_not_found", 404);
  await rejects(preflightCentralCallWrite(input(attend)), "call_resolver_required");
  await rejects(preflightCentralCallWrite(input({ ...attend, callId: "different" }, {
    resolveCallMachineId: resolver,
  })), "invalid_action_resource", 400);
  let deniedLookup = false;
  await rejects(preflightCentralCallWrite(input(attend, {
    principal: { ...principal, permissions: ["andon.read"] },
    resolveCallMachineId: async () => { deniedLookup = true; return "37"; },
  })), "permission_denied");
  assert.equal(deniedLookup, false, "reject unauthenticated authorization before DB lookup");
});

test("SEC-04/2A: no other mutation obtains preflight approval", async () => {
  for (const request of [
    { method: "PATCH", path: "/api/andon-calls/call-37/finish-maintenance" },
    { method: "PATCH", path: "/api/andon-calls/call-37/finish" },
    { method: "PATCH", path: "/api/andon-calls/call-37/cancel" },
    { method: "GET", path: "/api/andon-calls" },
    { method: "PATCH", path: "/api/machines/37/status" },
    { method: "POST", path: "/api/andon-calls/call-37/attend" },
    { method: "POST", path: "/api/andon-calls/unknown" },
  ]) await rejects(preflightCentralCallWrite(input(request)), "central_action_not_supported");
});
