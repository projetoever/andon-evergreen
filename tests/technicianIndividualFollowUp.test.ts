import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addTechnicianSessions,
  attendAndonCall,
  completeMaintenanceAttendance,
  endTechnicianSession,
  finishAndonCall,
  openAndonCall,
  returnToMaintenance,
  type SelectedTechnicianInput,
} from "../src/services/andonService";
import type { AndonCall, TechnicianAttendanceSession } from "../src/types/andon";
import type { Machine } from "../src/types/machine";
import {
  buildTechnicianParticipationSummaries,
  getTechnicianAccumulatedMinutes,
} from "../src/utils/technicianSessionUtils";
import { buildTechnicianTimeAllocations } from "../src/utils/technicianTimeAllocationUtils";

function machine(id: string): Machine {
  const now = "2026-10-02T12:00:00.000Z";
  return {
    id,
    name: `Máquina ${id}`,
    machineStatus: "running",
    andonStatus: "none",
    currentCallId: null,
    lastStatusChangedAt: now,
    stoppedAt: null,
    lastStopDurationMinutes: 0,
    stopHistory: [],
    productionMode: "scheduled",
    productionModeChangedAt: now,
    productionHistory: [],
    useCommercialShift: false,
    isActive: true,
    displayOrder: null,
  };
}

function technician(id: string, areas = ["electrical"]): SelectedTechnicianInput {
  return {
    id,
    name: `Técnico ${id}`,
    technicalArea: areas[0],
    technicalAreas: areas,
  };
}

function startCall(
  machines: Machine[],
  calls: AndonCall[],
  technicians: SelectedTechnicianInput[],
) {
  const opened = openAndonCall(machines, calls, {
    machineId: machines[0].id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });
  const attended = attendAndonCall(opened.machines, opened.calls, {
    callId: opened.call.id,
    technicians,
  });
  const call = attended.calls.find((item) => item.id === opened.call.id);
  assert.ok(call);
  return { machines: attended.machines, calls: attended.calls, call };
}

test("conclusão encerra três manutenções no mesmo instante e acompanha somente o escolhido", () => {
  const started = startCall(
    [machine("m1")],
    [],
    [technician("a"), technician("b"), technician("c")],
  );
  const maintenanceSessions = started.call.technicianSessions ?? [];
  assert.deepEqual(
    maintenanceSessions.map((session) => [session.phase, session.cycleIndex]),
    [
      ["maintenance", 1],
      ["maintenance", 1],
      ["maintenance", 1],
    ],
  );

  const selected = maintenanceSessions[2];
  const completed = completeMaintenanceAttendance(started.machines, started.calls, {
    callId: started.call.id,
    followUpSessionIds: [selected.id],
  });
  const sessions = completed.call.technicianSessions ?? [];
  const endedMaintenance = sessions.filter((session) => session.phase === "maintenance");
  const followUp = sessions.filter((session) => session.phase === "follow_up");

  assert.equal(new Set(endedMaintenance.map((session) => session.endedAt)).size, 1);
  assert.ok(endedMaintenance.every((session) => session.endReason === "maintenance_completed"));
  assert.equal(followUp.length, 1);
  assert.equal(followUp[0].technicianId, "c");
  assert.equal(followUp[0].startedAt, endedMaintenance[0].endedAt);
  assert.equal(followUp[0].cycleIndex, 1);
  assert.equal(sessions.filter((session) => !session.endedAt).length, 1);
});

test("follow_up ativo bloqueia outro chamado e encerramento libera somente o técnico", () => {
  const machines = [machine("m1"), machine("m2")];
  const first = startCall(machines, [], [technician("a"), technician("b")]);
  const completed = completeMaintenanceAttendance(first.machines, first.calls, {
    callId: first.call.id,
    followUpSessionIds: (first.call.technicianSessions ?? []).map((session) => session.id),
  });
  const secondOpened = openAndonCall(completed.machines, completed.calls, {
    machineId: "m2",
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });

  assert.throws(
    () =>
      attendAndonCall(secondOpened.machines, secondOpened.calls, {
        callId: secondOpened.call.id,
        technicians: [technician("a")],
      }),
    /ativo em outro chamado/i,
  );

  const activeA = completed.call.technicianSessions?.find(
    (session) => session.technicianId === "a" && !session.endedAt,
  );
  assert.ok(activeA);
  const ended = endTechnicianSession(completed.machines, secondOpened.calls, {
    callId: first.call.id,
    sessionId: activeA.id,
    endReason: "follow_up_finished",
  });
  const firstAfterEnd = ended.calls.find((call) => call.id === first.call.id);
  assert.equal(
    firstAfterEnd?.technicianSessions?.find(
      (session) => session.technicianId === "b" && !session.endedAt,
    )?.phase,
    "follow_up",
  );
  assert.doesNotThrow(() =>
    attendAndonCall(secondOpened.machines, ended.calls, {
      callId: secondOpened.call.id,
      technicians: [technician("a")],
    }),
  );
});

test("técnico ocupado não pode ser adicionado como acompanhante em outro chamado", () => {
  const machines = [machine("m1"), machine("m2")];
  const first = startCall(machines, [], [technician("a")]);
  const firstCompleted = completeMaintenanceAttendance(first.machines, first.calls, first.call.id);
  const second = startCall(
    [firstCompleted.machines.find((item) => item.id === "m2") ?? machines[1], machines[0]],
    firstCompleted.calls,
    [technician("b")],
  );
  const secondCompleted = completeMaintenanceAttendance(
    second.machines,
    second.calls,
    second.call.id,
  );

  assert.throws(
    () =>
      addTechnicianSessions(secondCompleted.machines, secondCompleted.calls, {
        callId: second.call.id,
        technicians: [technician("a")],
      }),
    /ativo em outro chamado/i,
  );
});

test("adicionar durante post_maintenance cria somente follow_up na área real", () => {
  const started = startCall([machine("m1")], [], [technician("a")]);
  const completed = completeMaintenanceAttendance(started.machines, started.calls, {
    callId: started.call.id,
    followUpSessionIds: [],
  });
  const added = addTechnicianSessions(completed.machines, completed.calls, {
    callId: started.call.id,
    technicians: [technician("d", ["mechanical", "electrical"])],
  });
  const session = added.calls[0].technicianSessions?.find((item) => item.technicianId === "d");

  assert.equal(session?.phase, "follow_up");
  assert.equal(session?.cycleIndex, 1);
  assert.equal(session?.technicalArea, "electrical");
  assert.equal(
    added.calls[0].technicianSessions?.some(
      (item) => item.technicianId === "d" && item.phase === "maintenance",
    ),
    false,
  );
});

test("área não habilitada continua rejeitada no acompanhamento", () => {
  const started = startCall([machine("m1")], [], [technician("a")]);
  const completed = completeMaintenanceAttendance(started.machines, started.calls, started.call.id);
  assert.throws(
    () =>
      addTechnicianSessions(completed.machines, completed.calls, {
        callId: started.call.id,
        technicians: [technician("x", ["mechanical"])],
      }),
    /não pertence à área/i,
  );
});

test("retorno fecha somente acompanhantes ativos e abre manutenção no ciclo seguinte", () => {
  const started = startCall([machine("m1")], [], [technician("a"), technician("b")]);
  const completed = completeMaintenanceAttendance(started.machines, started.calls, started.call.id);
  const followUpA = completed.call.technicianSessions?.find(
    (session) => session.phase === "follow_up" && session.technicianId === "a",
  );
  assert.ok(followUpA);
  const ended = endTechnicianSession(completed.machines, completed.calls, {
    callId: started.call.id,
    sessionId: followUpA.id,
    endReason: "follow_up_finished",
  });
  const returned = returnToMaintenance(ended.machines, ended.calls, started.call.id);
  const sessions = returned.call.technicianSessions ?? [];
  const maintenanceCycle2 = sessions.filter(
    (session) => session.phase === "maintenance" && session.cycleIndex === 2,
  );
  const closedFollowUpB = sessions.find(
    (session) => session.phase === "follow_up" && session.technicianId === "b",
  );

  assert.deepEqual(
    maintenanceCycle2.map((session) => session.technicianId),
    ["b"],
  );
  assert.equal(maintenanceCycle2[0].startedAt, closedFollowUpB?.endedAt);
  assert.equal(closedFollowUpB?.endReason, "returned_to_maintenance");
  assert.equal(returned.call.maintenanceReturnCount, 1);
});

test("nova conclusão no ciclo 2 mantém seleção individual", () => {
  const started = startCall([machine("m1")], [], [technician("a")]);
  const firstCompleted = completeMaintenanceAttendance(
    started.machines,
    started.calls,
    started.call.id,
  );
  const returned = returnToMaintenance(
    firstCompleted.machines,
    firstCompleted.calls,
    started.call.id,
  );
  const added = addTechnicianSessions(returned.machines, returned.calls, {
    callId: started.call.id,
    technicians: [technician("e")],
  });
  const currentCall = added.calls.find((call) => call.id === started.call.id);
  const cycle2 = currentCall?.technicianSessions?.filter(
    (session) => session.phase === "maintenance" && session.cycleIndex === 2 && !session.endedAt,
  );
  assert.equal(cycle2?.length, 2);
  const selected = cycle2?.find((session) => session.technicianId === "e");
  assert.ok(selected);
  const completed = completeMaintenanceAttendance(added.machines, added.calls, {
    callId: started.call.id,
    followUpSessionIds: [selected.id],
  });
  assert.deepEqual(
    completed.call.technicianSessions
      ?.filter((session) => session.phase === "follow_up" && !session.endedAt)
      .map((session) => [session.technicianId, session.cycleIndex]),
    [["e", 2]],
  );
});

test("finalização encerra follow_up ativo sem sobrescrever sessão já encerrada", () => {
  const started = startCall([machine("m1")], [], [technician("a"), technician("b")]);
  const completed = completeMaintenanceAttendance(started.machines, started.calls, started.call.id);
  const followUpA = completed.call.technicianSessions?.find(
    (session) => session.phase === "follow_up" && session.technicianId === "a",
  );
  assert.ok(followUpA);
  const individuallyEnded = endTechnicianSession(completed.machines, completed.calls, {
    callId: started.call.id,
    sessionId: followUpA.id,
    endReason: "follow_up_finished",
  });
  const endedAt = individuallyEnded.calls[0].technicianSessions?.find(
    (session) => session.id === followUpA.id,
  )?.endedAt;
  const finished = finishAndonCall(individuallyEnded.machines, individuallyEnded.calls, {
    callId: started.call.id,
    failureClassification: "electrical_failure",
    failureDescription: "Falha elétrica corrigida",
    machineStatus: "running",
    impactCallIds: [],
    technicianName: null,
    technicianNames: [],
    technicianArea: "electrical",
    confirmedMachineSetId: null,
    confirmedMachineSetCodeSnapshot: null,
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSetTypeSnapshot: null,
    confirmedMachineSubsetId: null,
    confirmedMachineSubsetCodeSnapshot: null,
    confirmedMachineSubsetNameSnapshot: null,
    confirmedMachineSubsetTypeSnapshot: null,
  });
  const finishedSessions = finished.calls[0].technicianSessions ?? [];

  assert.equal(finishedSessions.find((session) => session.id === followUpA.id)?.endedAt, endedAt);
  assert.equal(
    finishedSessions.find(
      (session) => session.phase === "follow_up" && session.technicianId === "b",
    )?.endReason,
    "final_call",
  );
});

test("contadores separam manutenção e acompanhamento usando o agora informado", () => {
  const sessions: TechnicianAttendanceSession[] = [
    {
      id: "maintenance",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: "2026-10-02T10:00:00.000Z",
      endedAt: "2026-10-02T10:30:00.000Z",
    },
    {
      id: "follow-up",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "follow_up",
      cycleIndex: 1,
      startedAt: "2026-10-02T10:30:00.000Z",
    },
  ];
  const [summary] = buildTechnicianParticipationSummaries(
    sessions,
    "2026-10-02T10:45:00.000Z",
    "post_maintenance",
  );

  assert.equal(summary.maintenanceMinutes, 30);
  assert.equal(summary.followUpMinutes, 15);
  assert.equal(summary.activePhase, "follow_up");
  assert.deepEqual(summary.maintenanceIntervals, [
    {
      sessionId: "maintenance",
      startedAt: "2026-10-02T10:00:00.000Z",
      endedAt: "2026-10-02T10:30:00.000Z",
      minutes: 30,
      cycleIndex: 1,
    },
  ]);
  assert.deepEqual(summary.followUpIntervals, [
    {
      sessionId: "follow-up",
      startedAt: "2026-10-02T10:30:00.000Z",
      endedAt: null,
      minutes: 15,
      cycleIndex: 1,
    },
  ]);
});

test("contador acumulado preserva tempo do mantenedor entre manutenção, acompanhamento e retorno", () => {
  const sessions: TechnicianAttendanceSession[] = [
    {
      id: "m1",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "maintenance",
      cycleIndex: 1,
      startedAt: "2026-10-02T10:00:00.000Z",
      endedAt: "2026-10-02T10:20:00.000Z",
    },
    {
      id: "f1",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "follow_up",
      cycleIndex: 1,
      startedAt: "2026-10-02T10:20:00.000Z",
      endedAt: "2026-10-02T10:30:00.000Z",
    },
    {
      id: "m2",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "maintenance",
      cycleIndex: 2,
      startedAt: "2026-10-02T10:30:00.000Z",
      endedAt: "2026-10-02T10:45:00.000Z",
    },
    {
      id: "f2",
      callId: "call",
      machineId: "m1",
      technicianId: "a",
      technicianName: "Técnico A",
      phase: "follow_up",
      cycleIndex: 2,
      startedAt: "2026-10-02T10:45:00.000Z",
    },
  ];

  const [summary] = buildTechnicianParticipationSummaries(
    sessions,
    "2026-10-02T11:00:00.000Z",
    "post_maintenance",
  );

  assert.equal(summary.maintenanceMinutes, 35);
  assert.equal(summary.followUpMinutes, 25);
  assert.equal(getTechnicianAccumulatedMinutes(summary), 60);
  assert.equal(summary.activePhase, "follow_up");
});

test("legado support_finished mantém semântica e sessão explícita respeita endedAt", () => {
  const baseCall = {
    id: "legacy",
    machineId: "m1",
    category: "maintenance",
    subtype: "electrical",
    status: "finished",
    criticality: "medium",
    machineCondition: "running",
    openedAt: "2026-10-02T10:00:00.000Z",
    attendedAt: "2026-10-02T10:00:00.000Z",
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: "2026-10-02T10:30:00.000Z",
    finishedAt: "2026-10-02T11:00:00.000Z",
    technicianName: "Técnico A",
    technicianNames: ["Técnico A"],
    technicianArea: "electrical",
    callWaitingMinutes: 0,
    attendanceMinutes: 30,
    postMaintenanceMinutes: 30,
    maintenanceReturnCount: 0,
    totalCallMinutes: 60,
    machineStoppedMinutes: 0,
    notes: null,
    createdBy: null,
    origin: "kiosk",
    isSystemTest: false,
    updatedAt: "2026-10-02T11:00:00.000Z",
  } satisfies AndonCall;
  const legacySession: TechnicianAttendanceSession = {
    id: "legacy-session",
    callId: baseCall.id,
    machineId: baseCall.machineId,
    technicianName: "Técnico A",
    startedAt: "2026-10-02T10:00:00.000Z",
    endedAt: "2026-10-02T10:15:00.000Z",
    endReason: "support_finished",
  };
  const explicitSession = { ...legacySession, id: "explicit", phase: "maintenance" as const };

  const legacy = buildTechnicianTimeAllocations({
    call: { ...baseCall, technicianSessions: [legacySession] },
    finalizedAt: baseCall.finishedAt!,
    technicianNames: ["Técnico A"],
  });
  const explicit = buildTechnicianTimeAllocations({
    call: { ...baseCall, technicianSessions: [explicitSession] },
    finalizedAt: baseCall.finishedAt!,
    technicianNames: ["Técnico A"],
  });

  assert.equal(legacy[0].minutes, 60);
  assert.equal(explicit[0].minutes, 15);
});

test("migration permanece aditiva e UI usa acompanhamento compacto sem modal de seleção", async () => {
  const [migration, schema, packageJson, route, page] = await Promise.all([
    readFile(
      new URL(
        "../server/prisma/migrations/20261002200000_add_technician_session_phase/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../server/package.json", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /ADD COLUMN "phase" TEXT/);
  assert.match(migration, /ADD COLUMN "cycleIndex" INTEGER/);
  assert.doesNotMatch(migration, /^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.match(schema, /phase\s+String\?/);
  assert.match(schema, /cycleIndex\s+Int\?/);
  assert.match(packageJson, /technicianIndividualFollowUp\.test\.ts/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /followUpSessionIds/);
  assert.match(page, /getServerNowIso\(\)/);
  assert.match(page, /await completeMaintenance\(currentCall\.id\)/);
  assert.match(page, /Adicionar acompanhamento/);
  assert.match(page, /Encerrar acompanhamento/);
  assert.match(page, /setEndOpen\(true\)/);
  assert.match(page, /EndTechnicianSessionModal/);
  assert.match(page, /getTechnicianAccumulatedMinutes\(summary\)/);
  assert.doesNotMatch(page, /handleEndActiveSession/);
  assert.doesNotMatch(page, /MaintenanceFollowUpSelectionModal/);
  assert.doesNotMatch(page, /maintenanceIntervals\.map/);
  assert.doesNotMatch(page, /followUpIntervals\.map/);
});
