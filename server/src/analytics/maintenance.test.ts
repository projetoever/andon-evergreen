import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMaintenanceParticipation,
  type AnalyticsMaintenanceSessionRecord,
} from "./maintenance.js";

function date(value: string) {
  return new Date(value);
}

test("participação técnica separa manutenção, acompanhamento e legado sem inventar fase", () => {
  const sessions: AnalyticsMaintenanceSessionRecord[] = [
    {
      id: "m1",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-a",
      technicianName: "Técnico A",
      technicalArea: "electrical",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T10:30:00Z"),
    },
    {
      id: "f1",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-a",
      technicianName: "Técnico A",
      technicalArea: "electrical",
      phase: "follow_up",
      cycleIndex: 1,
      startedAt: date("2026-10-01T10:30:00Z"),
      endedAt: date("2026-10-01T10:45:00Z"),
    },
    {
      id: "legacy",
      callId: "c2",
      machineId: "machine",
      technicianId: null,
      technicianName: "Técnico Legado",
      technicalArea: "mechanical",
      phase: null,
      cycleIndex: null,
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T11:00:00Z"),
    },
  ];

  const result = buildMaintenanceParticipation({
    sessions,
    start: date("2026-10-01T10:00:00Z"),
    effectiveEnd: date("2026-10-01T11:00:00Z"),
  });

  assert.equal(result.totals.maintenancePersonMinutes, 30);
  assert.equal(result.totals.followUpPersonMinutes, 15);
  assert.equal(result.totals.totalPersonMinutes, 45);
  assert.equal(result.totals.technicianCount, 1);
  assert.equal(result.coverage.phaseAwareSessions, 2);
  assert.equal(result.coverage.legacySessions, 1);
  assert.equal(result.coverage.phaseAwareMinutes, 45);
  assert.equal(result.coverage.legacyMinutes, 60);
  assert.equal(result.technicians[0].technicianName, "Técnico A");
});

test("sessões são recortadas ao período e retorno é contabilizado por ciclo", () => {
  const sessions: AnalyticsMaintenanceSessionRecord[] = [
    {
      id: "cycle-1",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-a",
      technicianName: "Técnico A",
      technicalArea: "electrical",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: date("2026-10-01T09:30:00Z"),
      endedAt: date("2026-10-01T10:15:00Z"),
    },
    {
      id: "cycle-2",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-a",
      technicianName: "Técnico A",
      technicalArea: "electrical",
      phase: "maintenance",
      cycleIndex: 2,
      startedAt: date("2026-10-01T10:45:00Z"),
      endedAt: null,
    },
  ];

  const result = buildMaintenanceParticipation({
    sessions,
    start: date("2026-10-01T10:00:00Z"),
    effectiveEnd: date("2026-10-01T11:00:00Z"),
  });

  assert.equal(result.totals.maintenancePersonMinutes, 30);
  assert.equal(result.totals.activeSessionCount, 1);
  assert.equal(result.totals.returnCycleSessions, 1);
  assert.equal(result.technicians[0].callCount, 1);
  assert.equal(result.technicians[0].activePhase, "maintenance");
  assert.equal(result.technicians[0].returnCycleSessions, 1);
});

test("múltiplos mantenedores somam pessoa-minutos sem serem confundidos com tempo de máquina", () => {
  const sessions: AnalyticsMaintenanceSessionRecord[] = [
    {
      id: "a",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-a",
      technicianName: "Técnico A",
      technicalArea: "electrical",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T11:00:00Z"),
    },
    {
      id: "b",
      callId: "c1",
      machineId: "machine",
      technicianId: "tech-b",
      technicianName: "Técnico B",
      technicalArea: "electrical",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T11:00:00Z"),
    },
  ];

  const result = buildMaintenanceParticipation({
    sessions,
    start: date("2026-10-01T10:00:00Z"),
    effectiveEnd: date("2026-10-01T11:00:00Z"),
  });

  assert.equal(result.totals.maintenancePersonMinutes, 120);
  assert.equal(result.totals.technicianCount, 2);
  assert.equal(result.totals.callCount, 1);
  assert.equal(result.technicalAreas[0].totalPersonMinutes, 120);
  assert.equal(result.technicalAreas[0].technicianCount, 2);
});
