import assert from "node:assert/strict";
import test from "node:test";
import { getFinishCallDefaults } from "../src/utils/finishCallDefaults";
import { SnapshotRevision } from "../src/utils/snapshotRevision";
import { evaluateMaintenanceCompletionAuthorization } from "../src/utils/workstationAttendanceUtils";
import { assertMaintenanceCompletionWorkstation } from "../server/src/services/workstationAuthorization";

test("physical failure handoff never seeds another call's diagnosis", () => {
  const electrical = {
    failureClassification: "electrical_failure",
    failureDescription: "Trava NR12",
    notes: null,
  };
  assert.equal(getFinishCallDefaults(electrical).description, "Trava NR12");
  const mechanical = {
    failureClassification: null,
    failureDescription: null,
    notes: "Continuidade da falha: impacto transferido",
  };
  assert.deepEqual(getFinishCallDefaults(mechanical), { classification: "", description: "" });
  assert.equal(getFinishCallDefaults(electrical).classification, "electrical_failure");
});
test("a poll captured before attendance cannot restore the previous open state", async () => {
  const revision = new SnapshotRevision();
  const pendingPoll = revision.capture();
  await revision.mutate(async () => "in_progress");
  assert.equal(revision.canApply(pendingPoll), false);
  assert.equal(revision.canApply(revision.capture()), true);
});
test("overlapping mutations and failed mutations invalidate in-flight snapshots", async () => {
  const revision = new SnapshotRevision();
  let release!: () => void;
  const action = revision.mutate(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const poll = revision.capture();
  await assert.rejects(
    revision.mutate(async () => {
      throw new Error("conflict");
    }),
  );
  assert.equal(revision.canApply(revision.capture()), false);
  release();
  await action;
  assert.equal(revision.canApply(poll), false);
});
test("ended participants retain authority only in their latest recorded maintenance cycle", async () => {
  const a = "ws_00000000-0000-4000-8000-000000000001",
    b = "ws_00000000-0000-4000-8000-000000000002";
  const sessions = [
    { workstationId: a, phase: "maintenance", cycleIndex: 1, endedAt: new Date() },
    { workstationId: b, phase: "maintenance", cycleIndex: 2, endedAt: new Date() },
  ];
  const tx = {
    systemSettings: {
      findUnique: async () => ({ restrictMaintenanceCompletionToAttendanceWorkstation: true }),
    },
    technicianSession: {
      findMany: async () => sessions.map((s) => ({ ...s, workstation: { name: s.workstationId } })),
    },
    workstation: { findUnique: async () => ({ active: true }) },
    $queryRaw: async () => [],
  } as never;
  await assert.doesNotReject(
    assertMaintenanceCompletionWorkstation(tx, {
      callId: "mechanical",
      workstationHeader: b,
      isSystemTest: false,
    }),
  );
  await assert.rejects(
    assertMaintenanceCompletionWorkstation(tx, {
      callId: "mechanical",
      workstationHeader: a,
      isSystemTest: false,
    }),
  );
  const visual = sessions.map((s, i) => ({
    ...s,
    id: String(i),
    callId: "mechanical",
    machineId: "37",
    technicianName: "Técnico",
    startedAt: new Date().toISOString(),
    endedAt: s.endedAt.toISOString(),
  }));
  assert.equal(
    evaluateMaintenanceCompletionAuthorization(visual, {
      restricted: true,
      currentWorkstationId: b,
      currentWorkstationActive: true,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateMaintenanceCompletionAuthorization(visual, {
      restricted: true,
      currentWorkstationId: a,
      currentWorkstationActive: true,
    }).allowed,
    false,
  );
});
