import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { AccessError, type Principal } from "./policy.js";
import { authorizeCentralAttendanceAfterLock } from "./centralCallTransactionalGuard.js";

const principal: Principal = {
  userId: "person-1", login: "maintenance", displayName: "Mantenedor",
  roleLabel: "Técnico", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"],
  permissions: ["andon.read", "calls.attend"], sessionId: "session-1",
  workstationId: "station-1", purpose: "normal", authenticatedAt: new Date(),
};
const station = {
  id: "station-1", active: true, allowOperational: true,
  allowBi: false, allowPriorities: false,
};
type CallState = { machineId: string; category: string; status: string; isSystemTest: boolean };
function fakeTransaction(opts: {
  initial?: CallState | null;
  afterLock?: CallState | null;
  machineActive?: boolean;
} = {}) {
  const log: string[] = [];
  let locked = false;
  const initial = opts.initial === undefined
    ? { machineId: "37", category: "maintenance", status: "open", isSystemTest: false }
    : opts.initial;
  const afterLock = opts.afterLock === undefined ? initial : opts.afterLock;
  const tx = {
    andonCall: {
      findUnique: async () => {
        log.push(locked ? "call-after-lock" : "call-before-lock");
        return locked ? afterLock : initial;
      },
    },
    $queryRaw: async () => {
      log.push("advisory-transaction-lock");
      locked = true;
      return [{ lockResult: "" }];
    },
    machine: {
      findUnique: async () => {
        log.push("machine-after-lock");
        return opts.machineActive === false ? { isActive: false } : { isActive: true };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, log };
}
async function fails(action: Promise<unknown>, code: string, status: number = 403) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}

test("SEC-04/2A.2: scoped valid attendance obtains lock then reloads state from transaction", async () => {
  const { tx, log } = fakeTransaction();
  const result = await authorizeCentralAttendanceAfterLock({ tx, principal, workstation: station, callId: "call-37" });
  assert.deepEqual(result, { callId: "call-37", machineId: "37", category: "maintenance", status: "open" });
  assert.deepEqual(log, [
    "call-before-lock", "advisory-transaction-lock", "call-after-lock", "machine-after-lock",
  ]);
});

test("SEC-04/2A.2: deny missing permission or incorrect workstation before any DB read", async () => {
  const { tx, log } = fakeTransaction();
  await fails(authorizeCentralAttendanceAfterLock({
    tx, principal: { ...principal, permissions: ["andon.read"] },
    workstation: station, callId: "call-37",
  }), "permission_denied");
  await fails(authorizeCentralAttendanceAfterLock({
    tx, principal, workstation: { ...station, id: "other" }, callId: "call-37",
  }), "workstation_session_mismatch");
  await fails(authorizeCentralAttendanceAfterLock({
    tx, principal, workstation: { ...station, pendingApproval: true }, callId: "call-37",
  }), "workstation_inactive");
  assert.deepEqual(log, [], "denied requests cannot enumerate calls or acquire locks");
});

test("SEC-04/2A.2: foreign and missing calls remain invisible to restricted users", async () => {
  const foreign = fakeTransaction({ initial: { machineId: "39", category: "maintenance", status: "open", isSystemTest: false } });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: foreign.tx, principal, workstation: station, callId: "outside",
  }), "call_not_found", 404);
  assert.deepEqual(foreign.log, ["call-before-lock"]);
  const missing = fakeTransaction({ initial: null });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: missing.tx, principal, workstation: station, callId: "missing",
  }), "call_not_found", 404);
  assert.deepEqual(missing.log, ["call-before-lock"]);
});

test("SEC-04/2A.2: post-lock status transitions or changed machine refuse attendance", async () => {
  const change = fakeTransaction({
    afterLock: { machineId: "37", category: "maintenance", status: "in_progress", isSystemTest: false },
  });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: change.tx, principal, workstation: station, callId: "call-37",
  }), "call_state_changed", 409);
  assert.deepEqual(change.log.slice(0, 3), ["call-before-lock", "advisory-transaction-lock", "call-after-lock"]);
  const moved = fakeTransaction({
    afterLock: { machineId: "39", category: "maintenance", status: "open", isSystemTest: false },
  });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: moved.tx, principal, workstation: station, callId: "call-37",
  }), "call_not_found", 404);
  assert.equal(moved.log.includes("machine-after-lock"), false);
});

test("SEC-04/2A.2: test calls, inactive machines and malformed call IDs are blocked", async () => {
  const systemTest = fakeTransaction({
    afterLock: { machineId: "37", category: "maintenance", status: "open", isSystemTest: true },
  });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: systemTest.tx, principal, workstation: station, callId: "call-37",
  }), "system_test_transition_denied");
  const inactive = fakeTransaction({ machineActive: false });
  await fails(authorizeCentralAttendanceAfterLock({
    tx: inactive.tx, principal, workstation: station, callId: "call-37",
  }), "machine_inactive", 409);
  const invalid = fakeTransaction();
  await fails(authorizeCentralAttendanceAfterLock({
    tx: invalid.tx, principal, workstation: station, callId: " ",
  }), "invalid_action_resource", 400);
  assert.deepEqual(invalid.log, []);
});
