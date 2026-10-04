import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildTechnicianActiveAssignmentMap,
  getTechnicianActiveAssignment,
} from "../src/utils/technicianAvailabilityUtils";
import type { AndonCall } from "../src/types/andon";
import type { Machine } from "../src/types/machine";
import type { TechnicianConfig } from "../src/types/settings";

const machines = [
  { id: "9", name: "Envasadora 9" },
  { id: "10", name: "Envasadora 10" },
] as Machine[];

function call(
  id: string,
  machineId: string,
  technicianId: string,
  technicianName: string,
  endedAt?: string,
) {
  return {
    id,
    machineId,
    technicianSessions: [
      {
        id: `${id}-session`,
        callId: id,
        machineId,
        technicianId,
        technicianName,
        startedAt: "2026-10-03T10:00:00Z",
        ...(endedAt ? { endedAt } : {}),
      },
    ],
  } as AndonCall;
}

const technician = {
  id: "tech-1",
  name: "João Silva",
} as TechnicianConfig;

test("disponibilidade encontra sessão ativa e informa a máquina", () => {
  const assignments = buildTechnicianActiveAssignmentMap(
    [call("call-a", "9", "tech-1", "João Silva")],
    machines,
    "target-call",
  );

  const assignment = getTechnicianActiveAssignment(technician, assignments);

  assert.equal(assignment?.machineId, "9");
  assert.equal(assignment?.machineLabel, "Máquina 9 · Envasadora 9");
});

test("sessão encerrada não bloqueia o mantenedor", () => {
  const assignments = buildTechnicianActiveAssignmentMap(
    [call("call-a", "9", "tech-1", "João Silva", "2026-10-03T11:00:00Z")],
    machines,
  );

  assert.equal(getTechnicianActiveAssignment(technician, assignments), null);
});

test("sessão do próprio chamado não é tratada como conflito externo", () => {
  const assignments = buildTechnicianActiveAssignmentMap(
    [call("target-call", "9", "tech-1", "João Silva")],
    machines,
    "target-call",
  );

  assert.equal(getTechnicianActiveAssignment(technician, assignments), null);
});

test("compatibilidade legada encontra sessão ativa pelo nome quando não há technicianId", () => {
  const legacyCall = {
    id: "legacy-call",
    machineId: "10",
    technicianSessions: [
      {
        id: "legacy-session",
        callId: "legacy-call",
        machineId: "10",
        technicianName: "João Silva",
        startedAt: "2026-10-03T10:00:00Z",
      },
    ],
  } as AndonCall;

  const assignments = buildTechnicianActiveAssignmentMap([legacyCall], machines);

  assert.equal(getTechnicianActiveAssignment(technician, assignments)?.machineId, "10");
});

test("seletor mantém mantenedor ocupado visível, discreto e desabilitado", async () => {
  const selector = await readFile(
    new URL("../src/components/calls/TechnicianSelector.tsx", import.meta.url),
    "utf8",
  );

  assert.match(selector, /activeAssignments/);
  assert.match(selector, /disabled={unavailable}/);
  assert.match(selector, /opacity-60/);
  assert.match(selector, /Ativo · {activeAssignment\.machineLabel}/);
});

test("modal de identificação informa bloqueio inline inclusive por credencial", async () => {
  const modal = await readFile(
    new URL("../src/components/calls/TechnicianIdentificationModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(modal, /buildTechnicianActiveAssignmentMap/);
  assert.match(modal, /getTechnicianActiveAssignment/);
  assert.match(modal, /availabilityNotice/);
  assert.match(modal, /Mantenedor indisponível/);
  assert.match(modal, /já está ativo em \$\{activeAssignment\.machineLabel\}/);
  assert.match(modal, /atendimento ativo em outro chamado/i);
});

test("notificações internas estão montadas globalmente e com apresentação discreta", async () => {
  const [root, toaster] = await Promise.all([
    readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/sonner.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(root, /import \{ Toaster \}/);
  assert.match(root, /<Toaster \/>/);
  assert.match(toaster, /position="bottom-right"/);
  assert.match(toaster, /duration=\{2600\}/);
  assert.match(toaster, /visibleToasts=\{3\}/);
  assert.match(toaster, /closeButton/);
});

test("fluxos sensíveis do Admin informam sucesso e falha", async () => {
  const [sounds, shifts, workstation, soundModal] = await Promise.all([
    readFile(
      new URL("../src/components/settings/SoundsSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/ShiftsSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/WorkstationsSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/components/settings/SoundSettingsModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(sounds, /Não foi possível salvar o som/);
  assert.match(sounds, /Não foi possível remover o som/);
  assert.match(shifts, /Filtro por turno atual habilitado/);
  assert.match(workstation, /Workstation ativada/);
  assert.match(workstation, /Workstation inativada/);
  assert.match(soundModal, /Não foi possível reproduzir o som/);
});
