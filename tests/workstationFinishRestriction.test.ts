import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createInitialMachines } from "../src/data/initialMachines";
import {
  addTechnicianSessions,
  attendAndonCall,
  completeMaintenanceAttendance,
  openAndonCall,
} from "../src/services/andonService";
import type { TechnicianAttendanceSession } from "../src/types/andon";
import {
  assertWorkstationCanCompleteMaintenance,
  assertWorkstationCanStartAttendance,
  evaluateMaintenanceCompletionAuthorization,
} from "../src/utils/workstationAttendanceUtils";
import {
  assertMaintenanceCompletionWorkstation,
  resolveAttendanceWorkstationId,
} from "../server/src/services/workstationAuthorization";

const WS_A = "ws_00000000-0000-4000-8000-0000000000aa";
const WS_B = "ws_00000000-0000-4000-8000-0000000000bb";
const WS_C = "ws_00000000-0000-4000-8000-0000000000cc";

function context(
  currentWorkstationId: string | null,
  currentWorkstationActive: boolean | null,
  restricted = true,
) {
  return { restricted, currentWorkstationId, currentWorkstationActive };
}

function session(
  id: string,
  workstationId: string | null,
  endedAt: string | null = null,
): TechnicianAttendanceSession {
  return {
    id,
    callId: "call-1",
    machineId: "machine-1",
    technicianName: `Mantenedor ${id}`,
    startedAt: "2026-09-29T20:00:00.000Z",
    endedAt: endedAt ?? undefined,
    workstationId,
  };
}

function backendTransaction(params: {
  restricted: boolean;
  workstations?: Record<string, { active: boolean; name?: string | null }>;
  sessions?: Array<{
    workstationId: string | null;
    endedAt: Date | null;
    workstation: { name: string | null } | null;
  }>;
}) {
  return {
    systemSettings: {
      findUnique: async () => ({
        restrictMaintenanceCompletionToAttendanceWorkstation: params.restricted,
      }),
    },
    workstation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const workstation = params.workstations?.[where.id];
        return workstation ? { id: where.id, active: workstation.active } : null;
      },
    },
    technicianSession: {
      findMany: async () => params.sessions ?? [],
    },
  } as never;
}

test("restrição OFF preserva atendimento sem workstation", () => {
  assert.doesNotThrow(() => assertWorkstationCanStartAttendance(context(null, null, false)));
});

test("restrição ON exige workstation existente e ativa ao atender", () => {
  assert.throws(() => assertWorkstationCanStartAttendance(context(null, null)), /identificar/i);
  assert.throws(() => assertWorkstationCanStartAttendance(context(WS_A, null)), /identificar/i);
  assert.throws(() => assertWorkstationCanStartAttendance(context(WS_A, false)), /desativada/i);
  assert.doesNotThrow(() => assertWorkstationCanStartAttendance(context(WS_A, true)));
});

test("backend registra workstation válida com regra OFF sem tornar o header obrigatório", async () => {
  const tx = backendTransaction({
    restricted: false,
    workstations: { [WS_A]: { active: true } },
  });

  assert.equal(
    await resolveAttendanceWorkstationId(tx, {
      workstationHeader: WS_A,
      isSystemTest: false,
    }),
    WS_A,
  );
  assert.equal(
    await resolveAttendanceWorkstationId(tx, {
      workstationHeader: undefined,
      isSystemTest: false,
    }),
    null,
  );
});

test("backend rejeita workstation ausente, inexistente e inativa com regra ON", async () => {
  const tx = backendTransaction({
    restricted: true,
    workstations: {
      [WS_A]: { active: true },
      [WS_B]: { active: false },
    },
  });

  await assert.rejects(
    resolveAttendanceWorkstationId(tx, {
      workstationHeader: undefined,
      isSystemTest: false,
    }),
    /identificar/i,
  );
  await assert.rejects(
    resolveAttendanceWorkstationId(tx, {
      workstationHeader: WS_C,
      isSystemTest: false,
    }),
    /identificar/i,
  );
  await assert.rejects(
    resolveAttendanceWorkstationId(tx, {
      workstationHeader: WS_B,
      isSystemTest: false,
    }),
    /desativada/i,
  );
  assert.equal(
    await resolveAttendanceWorkstationId(tx, {
      workstationHeader: WS_A,
      isSystemTest: false,
    }),
    WS_A,
  );
});

test("backend autoriza somente workstations de sessões ativas", async () => {
  const tx = backendTransaction({
    restricted: true,
    workstations: {
      [WS_A]: { active: true, name: "Workstation A" },
      [WS_B]: { active: true, name: "Workstation B" },
    },
    sessions: [
      {
        workstationId: WS_A,
        endedAt: new Date("2026-09-29T20:05:00.000Z"),
        workstation: { name: "Workstation A" },
      },
      {
        workstationId: WS_B,
        endedAt: null,
        workstation: { name: "Workstation B" },
      },
    ],
  });

  await assert.rejects(
    assertMaintenanceCompletionWorkstation(tx, {
      callId: "call-1",
      workstationHeader: WS_A,
      isSystemTest: false,
    }),
    /Workstation B/i,
  );
  await assert.doesNotReject(
    assertMaintenanceCompletionWorkstation(tx, {
      callId: "call-1",
      workstationHeader: WS_B,
      isSystemTest: false,
    }),
  );
});

test("backend preserva atendimento legado e isenta system test", async () => {
  const legacyTx = backendTransaction({
    restricted: true,
    sessions: [{ workstationId: null, endedAt: null, workstation: null }],
  });
  await assert.doesNotReject(
    assertMaintenanceCompletionWorkstation(legacyTx, {
      callId: "legacy-call",
      workstationHeader: undefined,
      isSystemTest: false,
    }),
  );

  const systemTx = backendTransaction({ restricted: true });
  await assert.doesNotReject(
    assertMaintenanceCompletionWorkstation(systemTx, {
      callId: "system-call",
      workstationHeader: undefined,
      isSystemTest: true,
    }),
  );
});

test("mesma workstation ou segunda sessão ativa autorizam conclusão", () => {
  const sessions = [session("a", WS_A), session("b", WS_B)];
  assert.doesNotThrow(() => assertWorkstationCanCompleteMaintenance(sessions, context(WS_A, true)));
  assert.doesNotThrow(() => assertWorkstationCanCompleteMaintenance(sessions, context(WS_B, true)));
  assert.throws(
    () => assertWorkstationCanCompleteMaintenance(sessions, context(WS_C, true)),
    /onde o atendimento foi iniciado/i,
  );
});

test("avaliador visual mantém o botão livre quando a restrição está OFF", () => {
  assert.deepEqual(
    evaluateMaintenanceCompletionAuthorization([session("a", WS_A)], context(WS_B, false, false)),
    { allowed: true, kind: "restriction_off", message: null },
  );
});

test("avaliador visual autoriza a workstation de uma sessão ativa", () => {
  assert.deepEqual(
    evaluateMaintenanceCompletionAuthorization([session("a", WS_A)], context(WS_A, true)),
    { allowed: true, kind: "authorized", message: null },
  );
});

test("avaliador visual bloqueia workstation diferente com mensagem genérica", () => {
  const authorization = evaluateMaintenanceCompletionAuthorization(
    [session("a", WS_A)],
    context(WS_B, true),
  );

  assert.equal(authorization.allowed, false);
  assert.equal(authorization.kind, "different_workstation");
  assert.match(authorization.message ?? "", /onde o atendimento foi iniciado/i);
  assert.doesNotMatch(authorization.message ?? "", new RegExp(WS_A, "i"));
});

test("avaliador visual bloqueia workstation atual inativa", () => {
  const authorization = evaluateMaintenanceCompletionAuthorization(
    [session("a", WS_A)],
    context(WS_A, false),
  );

  assert.equal(authorization.allowed, false);
  assert.equal(authorization.kind, "inactive");
  assert.match(authorization.message ?? "", /desativada/i);
});

test("avaliador visual bloqueia identidade atual indisponível", () => {
  const authorization = evaluateMaintenanceCompletionAuthorization(
    [session("a", WS_A)],
    context(null, null),
  );

  assert.equal(authorization.allowed, false);
  assert.equal(authorization.kind, "unidentified");
  assert.match(authorization.message ?? "", /identificar/i);
});

test("avaliador visual preserva sessões ativas legadas sem workstation", () => {
  assert.deepEqual(
    evaluateMaintenanceCompletionAuthorization([session("legacy", null)], context(null, null)),
    { allowed: true, kind: "legacy", message: null },
  );
});

test("avaliador visual ignora sessão encerrada para autorização", () => {
  const sessions = [session("ended", WS_A, "2026-09-29T20:05:00.000Z"), session("active", WS_B)];

  assert.equal(
    evaluateMaintenanceCompletionAuthorization(sessions, context(WS_A, true)).allowed,
    false,
  );
  assert.equal(
    evaluateMaintenanceCompletionAuthorization(sessions, context(WS_B, true)).allowed,
    true,
  );
});

test("avaliador visual aceita qualquer workstation com sessão ativa no chamado", () => {
  const sessions = [session("a", WS_A), session("b", WS_B)];

  assert.equal(
    evaluateMaintenanceCompletionAuthorization(sessions, context(WS_A, true)).allowed,
    true,
  );
  assert.equal(
    evaluateMaintenanceCompletionAuthorization(sessions, context(WS_B, true)).allowed,
    true,
  );
});

test("avaliador visual replica a compatibilidade do backend sem sessão ativa", () => {
  assert.deepEqual(evaluateMaintenanceCompletionAuthorization([], context(null, null)), {
    allowed: true,
    kind: "legacy",
    message: null,
  });

  const historicalSession = [session("ended", WS_A, "2026-09-29T20:05:00.000Z")];
  const authorization = evaluateMaintenanceCompletionAuthorization(
    historicalSession,
    context(WS_A, true),
  );
  assert.equal(authorization.allowed, false);
  assert.equal(authorization.kind, "different_workstation");
});

test("workstation inativa não pode concluir manutenção", () => {
  assert.throws(
    () => assertWorkstationCanCompleteMaintenance([session("a", WS_A)], context(WS_A, false)),
    /desativada/i,
  );
});

test("sessão encerrada não autoriza quando existe outra sessão ativa", () => {
  const sessions = [session("a", WS_A, "2026-09-29T20:05:00.000Z"), session("b", WS_B)];
  assert.throws(
    () => assertWorkstationCanCompleteMaintenance(sessions, context(WS_A, true)),
    /onde o atendimento foi iniciado/i,
  );
  assert.doesNotThrow(() => assertWorkstationCanCompleteMaintenance(sessions, context(WS_B, true)));
});

test("sessões legadas null preservam conclusão, mas não ampliam sessão moderna", () => {
  assert.doesNotThrow(() =>
    assertWorkstationCanCompleteMaintenance([session("legacy", null)], context(null, null)),
  );

  const mixedSessions = [session("legacy", null), session("modern", WS_A)];
  assert.doesNotThrow(() =>
    assertWorkstationCanCompleteMaintenance(mixedSessions, context(WS_A, true)),
  );
  assert.throws(
    () => assertWorkstationCanCompleteMaintenance(mixedSessions, context(WS_B, true)),
    /onde o atendimento foi iniciado/i,
  );
});

test("modo local persiste workstation ao atender e adicionar mantenedor", () => {
  const machines = createInitialMachines().slice(0, 1);
  const opened = openAndonCall(machines, [], {
    machineId: machines[0].id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });
  const attended = attendAndonCall(
    opened.machines,
    opened.calls,
    {
      callId: opened.call.id,
      technicians: [{ id: "tech-a", name: "Mantenedor A", technicalArea: "electrical" }],
    },
    context(WS_A, true, false),
  );
  assert.equal(attended.calls[0].technicianSessions?.[0]?.workstationId, WS_A);

  const added = addTechnicianSessions(
    attended.machines,
    attended.calls,
    {
      callId: opened.call.id,
      technicians: [{ id: "tech-b", name: "Mantenedor B", technicalArea: "electrical" }],
    },
    context(WS_B, true),
  );
  assert.equal(added.calls[0].technicianSessions?.[1]?.workstationId, WS_B);
});

test("modo local protege conclusão e isenta system test", () => {
  const machines = createInitialMachines().slice(0, 1);
  const opened = openAndonCall(machines, [], {
    machineId: machines[0].id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });
  const call = {
    ...opened.call,
    status: "in_progress" as const,
    technicianSessions: [session("a", WS_A)],
  };

  assert.throws(
    () => completeMaintenanceAttendance(opened.machines, [call], call.id, context(WS_B, true)),
    /onde o atendimento foi iniciado/i,
  );
  assert.equal(
    completeMaintenanceAttendance(opened.machines, [call], call.id, context(WS_A, true)).call
      .status,
    "post_maintenance",
  );

  const systemCall = { ...call, isSystemTest: true, technicianSessions: [] };
  assert.equal(
    completeMaintenanceAttendance(opened.machines, [systemCall], call.id, context(null, null)).call
      .status,
    "post_maintenance",
  );
});

test("migration é aditiva, nullable e mantém a configuração desligada", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20260929223000_add_workstation_finish_restriction/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /"restrictMaintenanceCompletionToAttendanceWorkstation" BOOLEAN NOT NULL DEFAULT false/,
  );
  assert.match(migration, /ADD COLUMN "workstationId" TEXT/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /^(?:\s*)(?:DROP|DELETE|UPDATE|TRUNCATE)\b/im);
});

test("backend protege apenas finish-maintenance e mantém PATCH finish sem trava", async () => {
  const source = await readFile(
    new URL("../server/src/routes/andonCalls.ts", import.meta.url),
    "utf8",
  );
  const occurrences = source.match(/assertMaintenanceCompletionWorkstation/g) ?? [];
  const finishMaintenanceIndex = source.indexOf('"/api/andon-calls/:id/finish-maintenance"');
  const finalFinishIndex = source.indexOf('"/api/andon-calls/:id/finish"');
  const assertionIndex = source.lastIndexOf("assertMaintenanceCompletionWorkstation");

  assert.equal(occurrences.length, 2, "uma importação e uma aplicação da regra são esperadas");
  assert.ok(assertionIndex > finishMaintenanceIndex);
  assert.ok(assertionIndex < finalFinishIndex);
});

test("Admin persiste a configuração no SystemSettings existente", async () => {
  const admin = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(admin, /Restringir conclusão da manutenção à workstation do atendimento/);
  assert.match(admin, /restrictMaintenanceCompletionToAttendanceWorkstation/);
  assert.match(admin, /updateSystemSettings/);
});

test("painel desabilita somente a conclusão de manutenção e exibe o motivo", async () => {
  const panel = await readFile(
    new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url),
    "utf8",
  );
  const disabledOccurrences = panel.match(/disabled=\{maintenanceCompletionDisabled\}/g) ?? [];

  assert.equal(disabledOccurrences.length, 1);
  assert.match(panel, /Concluir manutenção/);
  assert.match(panel, /maintenanceCompletionHint/);
  assert.match(panel, /onClick=\{onCompleteMaintenance\}/);
  assert.doesNotMatch(panel, /onClick=\{onFinish\}[^]*disabled=\{maintenanceCompletionDisabled\}/);
  assert.doesNotMatch(
    panel,
    /onClick=\{onReturnToMaintenance\}[^]*disabled=\{maintenanceCompletionDisabled\}/,
  );
});

test("página não bloqueia por incerteza de carregamento e mantém erro do backend", async () => {
  const page = await readFile(
    new URL("../src/pages/MachineDetailPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    page,
    /Promise\.allSettled\(\[getSystemSettings\(\), registerCurrentWorkstation\(\)\]\)/,
  );
  assert.match(
    page,
    /maintenanceCompletionDisabled=\{maintenanceCompletionAuthorization\?\.allowed === false\}/,
  );
  assert.doesNotMatch(page, /Workstation autorizada para concluir esta manutenção/);
  assert.match(page, /A validação será feita ao concluir/);
  assert.match(page, /return maintenanceCompletionAuthorization\.message/);
  assert.match(page, /await completeMaintenance\(currentCall\.id\)/);
  assert.match(page, /Erro ao concluir manutenção/);
});
