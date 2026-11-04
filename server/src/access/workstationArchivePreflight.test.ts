import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { tokenHash } from "./credentials.js";
import {
  evaluateWorkstationArchive, inspectWorkstationArchive, type ArchiveInspection,
} from "./workstationArchivePreflight.js";

const now = new Date("2026-11-03T20:00:00.000Z");
function baseline(): ArchiveInspection {
  return {
    ownWorkstation: false,
    active: false,
    pendingApproval: false,
    admissionPending: false,
    lockedMachineId: null,
    modulesEnabled: false,
    lastHeartbeatAt: null,
    lastSeenAt: new Date(now.getTime() - 60 * 60_000),
    activeMaintenance: false,
    activeAccessSession: false,
    kioskLinked: false,
  };
}

test("S5/2 read-only inspection never permits archive without physical validation", () => {
  const result = evaluateWorkstationArchive(baseline(), now);
  assert.equal(result.canArchiveFromSystemChecks, true);
  assert.equal(result.archiveActionAvailable, false);
  assert.equal(result.requiresPhysicalReview, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.quietPeriodMinutes, 15);
});

test("S5/2 fail-closed blockers cover every ongoing-use and identity condition", () => {
  const variants: Array<[Partial<ArchiveInspection>, string]> = [
    [{ ownWorkstation: true }, "own_workstation"],
    [{ active: true }, "station_active"],
    [{ pendingApproval: true }, "approval_pending"],
    [{ admissionPending: true }, "approval_pending"],
    [{ lockedMachineId: "37" }, "locked_machine"],
    [{ modulesEnabled: true }, "modules_enabled"],
    [{ lastHeartbeatAt: new Date(now.getTime() - 20_000) }, "recent_heartbeat"],
    [{ lastSeenAt: new Date(now.getTime() - 20_000) }, "recent_contact"],
    [{ activeMaintenance: true }, "active_maintenance"],
    [{ activeAccessSession: true }, "active_access_session"],
    [{ kioskLinked: true }, "kiosk_linked"],
  ];
  for (const [patch, expected] of variants) {
    const outcome = evaluateWorkstationArchive({ ...baseline(), ...patch }, now);
    assert(outcome.blockers.includes(expected as never), expected);
    assert.equal(outcome.canArchiveFromSystemChecks, false, expected);
    assert.equal(outcome.archiveActionAvailable, false, expected);
  }
});

test("S5/2 exact quiet-period boundary and future timestamps cannot imply disuse", () => {
  assert.equal(evaluateWorkstationArchive({
    ...baseline(), lastHeartbeatAt: new Date(now.getTime() - 15 * 60_000),
  }, now).canArchiveFromSystemChecks, true);
  assert.equal(evaluateWorkstationArchive({
    ...baseline(), lastSeenAt: new Date(now.getTime() + 30_000),
  }, now).canArchiveFromSystemChecks, false);
  assert.equal(evaluateWorkstationArchive({
    ...baseline(), lastHeartbeatAt: new Date(now.getTime() + 30_000),
  }, now).canArchiveFromSystemChecks, false);
});

test("S5/2 only primary Admin can inspect the target; no database mutation occurs", async () => {
  let isPrimaryAdmin = false;
  const calls: string[] = [];
  const t = new Date();
  const db = {
    accessSession: { findUnique: async (args: { where: { tokenHash: string } }) => {
      assert.equal(args.where.tokenHash, tokenHash("f".repeat(64)));
      calls.push("verify-session");
      return {
        id: "sess", userId: "u", workstationId: "ws-current",
        purpose: "normal", authorizationVersion: 1, createdAt: t,
        lastInteractionAt: t, expiresAt: new Date(t.getTime() + 500_000),
        revokedAt: null, lastAuthenticatedAt: null,
        workstation: { active: true, pendingApproval: false },
        user: {
          id: "u", login: "admin", displayName: "Admin", roleLabel: "Admin",
          accountType: "person", active: true, isPrimaryAdmin,
          authorizationVersion: 1, mustChangePassword: false,
          machineScope: "all", machines: [], permissions: [],
        },
      };
    } },
    workstation: { findUnique: async () => {
      calls.push("read-workstation");
      return {
        id: "ws-target", active: false, pendingApproval: false,
        lockedMachineId: null, allowOperational: false, allowBi: false,
        allowPriorities: false, lastSeenAt: new Date(t.getTime() - 20 * 60_000),
        lastHeartbeatAt: null, admission: null,
      };
    } },
    technicianSession: { findFirst: async () => { calls.push("maintenance"); return null; } },
    accessSessionAux: { findFirst: async () => null },
    $transaction: () => { throw Error("preflight must never write"); },
  } as unknown as PrismaClient;
  (db.accessSession as unknown as { findFirst: (query: unknown) => Promise<null> }).findFirst =
    async () => { calls.push("access-sessions-read"); return null; };
  await assert.rejects(
    inspectWorkstationArchive(db, { token: "f".repeat(64), workstationId: "ws-current" }, "ws-target"),
    (e) => e instanceof AccessError && e.code === "admin_required",
  );
  assert.deepEqual(calls, ["verify-session"]);
  isPrimaryAdmin = true;
  const result = await inspectWorkstationArchive(
    db, { token: "f".repeat(64), workstationId: "ws-current" }, "ws-target",
  );
  assert.equal(result.canArchiveFromSystemChecks, true);
  assert.equal(result.archiveActionAvailable, false);
  assert(calls.includes("read-workstation"));
  assert.equal(calls.filter(x => x === "access-sessions-read").length, 2);
});
