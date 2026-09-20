import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LocalAndonRepository } from "../src/repositories/localAndonRepository";
import type { AndonCall } from "../src/types/andon";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculateCallWaitingSnapshotMinutes,
  calculatePostMaintenanceMinutes,
  calculateTotalCallMinutes,
} from "../src/utils/durationUtils";

const OPENED_AT = "2026-09-20T12:00:00.000Z";

function createCall(patch: Partial<AndonCall> = {}): AndonCall {
  return {
    id: "call-duration-freeze",
    machineId: "machine-duration-freeze",
    category: "maintenance",
    subtype: "electrical",
    status: "open",
    criticality: "medium",
    machineCondition: "running",
    openedAt: OPENED_AT,
    attendedAt: null,
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: null,
    finishedAt: null,
    technicianName: null,
    technicianNames: [],
    technicianArea: null,
    callWaitingMinutes: 0,
    attendanceMinutes: 0,
    postMaintenanceMinutes: 0,
    maintenanceReturnCount: 0,
    totalCallMinutes: 0,
    machineStoppedMinutes: 0,
    notes: null,
    createdBy: null,
    origin: "kiosk",
    isSystemTest: false,
    updatedAt: OPENED_AT,
    ...patch,
  };
}

test("cenário A: cancelado sem atendimento preserva o snapshot em mapeamentos futuros", () => {
  const call = createCall({
    status: "cancelled",
    finishedAt: "2026-09-20T12:08:00.000Z",
    callWaitingMinutes: 8,
    totalCallMinutes: 8,
  });

  const firstMapping = calculateCallWaitingSnapshotMinutes(call, "2026-09-20T12:20:00.000Z");
  const laterMapping = calculateCallWaitingSnapshotMinutes(call, "2026-09-20T13:45:00.000Z");

  assert.equal(firstMapping, 8);
  assert.equal(laterMapping, 8);
  assert.equal(calculateCallWaitingMinutes(call, "2026-09-20T14:00:00.000Z"), 8);
});

test("cenário B: chamado atendido e finalizado mantém todos os tempos congelados", () => {
  const call = createCall({
    status: "finished",
    attendedAt: "2026-09-20T12:05:00.000Z",
    finishedAt: "2026-09-20T12:20:00.000Z",
    callWaitingMinutes: 5,
    attendanceMinutes: 11,
    postMaintenanceMinutes: 4,
    totalCallMinutes: 20,
  });

  const firstWaiting = calculateCallWaitingSnapshotMinutes(call, "2026-09-20T12:30:00.000Z");
  const laterWaiting = calculateCallWaitingSnapshotMinutes(call, "2026-09-21T12:30:00.000Z");
  const firstTotal = calculateTotalCallMinutes(call, "2026-09-20T12:30:00.000Z");
  const laterTotal = calculateTotalCallMinutes(call, "2026-09-21T12:30:00.000Z");
  const firstAttendance = calculateAttendanceMinutes(call, "2026-09-20T12:30:00.000Z");
  const laterAttendance = calculateAttendanceMinutes(call, "2026-09-21T12:30:00.000Z");
  const firstPostMaintenance = calculatePostMaintenanceMinutes(call, "2026-09-20T12:30:00.000Z");
  const laterPostMaintenance = calculatePostMaintenanceMinutes(call, "2026-09-21T12:30:00.000Z");

  assert.equal(firstWaiting, laterWaiting);
  assert.equal(laterWaiting, 5);
  assert.equal(firstTotal, laterTotal);
  assert.equal(laterTotal, 20);
  assert.equal(firstAttendance, laterAttendance);
  assert.equal(laterAttendance, 11);
  assert.equal(firstPostMaintenance, laterPostMaintenance);
  assert.equal(laterPostMaintenance, 4);
});

test("cenário C: chamado aberto sem atendimento continua evoluindo", () => {
  const call = createCall();

  const firstMapping = calculateCallWaitingSnapshotMinutes(call, "2026-09-20T12:05:00.000Z");
  const laterMapping = calculateCallWaitingSnapshotMinutes(call, "2026-09-20T12:15:00.000Z");

  assert.equal(firstMapping, 5);
  assert.equal(laterMapping, 15);
  assert.ok(laterMapping > firstMapping);
});

test("cenário D: chamado legado encerrado sem snapshot usa finishedAt, nunca agora", () => {
  const legacyCall = {
    ...createCall({
      status: "cancelled",
      finishedAt: "2026-09-20T12:12:00.000Z",
      totalCallMinutes: 12,
    }),
    callWaitingMinutes: undefined,
  } as unknown as AndonCall;

  const firstMapping = calculateCallWaitingSnapshotMinutes(legacyCall, "2026-09-20T13:00:00.000Z");
  const laterMapping = calculateCallWaitingSnapshotMinutes(legacyCall, "2026-09-22T13:00:00.000Z");

  assert.equal(firstMapping, 12);
  assert.equal(laterMapping, 12);
});

test("cenário E: cancelReason e dados do cancelamento permanecem preservados", async () => {
  const route = await readFile(
    new URL("../server/src/routes/andonCalls.ts", import.meta.url),
    "utf8",
  );
  const cancelRoute = route.slice(
    route.indexOf('"/api/andon-calls/:id/cancel"'),
    route.indexOf('"/api/andon-calls/:id/technicians"'),
  );

  assert.match(cancelRoute, /status: "cancelled"/);
  assert.match(cancelRoute, /finishedAt: now/);
  assert.match(cancelRoute, /callWaitingMinutes: diffMinutes\(call\.openedAt, now\)/);
  assert.match(cancelRoute, /totalCallMinutes: diffMinutes\(call\.openedAt, now\)/);
  assert.match(cancelRoute, /cancelReason: reason/);

  const apiCall = createCall({
    status: "cancelled",
    finishedAt: "2026-09-20T12:08:00.000Z",
    callWaitingMinutes: 8,
    totalCallMinutes: 8,
    cancelReason: "Chamado aberto para o setor incorreto.",
    notes: "Cancelamento registrado",
  });
  assert.equal(apiCall.cancelReason, "Chamado aberto para o setor incorreto.");
  assert.equal(apiCall.notes, "Cancelamento registrado");
  assert.equal(apiCall.status, "cancelled");
  assert.equal(apiCall.finishedAt, "2026-09-20T12:08:00.000Z");

  const localRepository = new LocalAndonRepository();
  const localSourceCall = createCall({
    openedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  });
  const localResult = await localRepository.cancelCall([], [localSourceCall], {
    callId: localSourceCall.id,
    reason: "  Cancelamento local preservado.  ",
  });
  const localCancelledCall = localResult.calls.find((call) => call.id === localSourceCall.id);

  assert.ok(localCancelledCall);
  assert.equal(localCancelledCall.status, "cancelled");
  assert.equal(localCancelledCall.cancelReason, "Cancelamento local preservado.");
  assert.ok(localCancelledCall.finishedAt);
  assert.ok(localCancelledCall.callWaitingMinutes > 0);
  assert.equal(localCancelledCall.callWaitingMinutes, localCancelledCall.totalCallMinutes);
  assert.equal(
    calculateCallWaitingMinutes(localCancelledCall, "2099-01-01T00:00:00.000Z"),
    localCancelledCall.callWaitingMinutes,
  );
});
