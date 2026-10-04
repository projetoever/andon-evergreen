import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCurrentPrioritySnapshot,
  buildPrioritySnapshot,
  diffPrioritySnapshots,
} from "../server/src/domain/machinePriorityHistory";

test("migration de prioridade é aditiva e isolada da operação", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20261004123000_add_dashboard_production_priority/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /dashboardMachineOrderMode/);
  assert.match(migration, /priorityOrder/);
  assert.match(migration, /dashboard_priority_config/);
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /andon_calls|failure_events|technician_sessions/i);
});

test("API de prioridades usa hash, sessão e salvamento transacional", async () => {
  const source = await readFile(
    new URL("../server/src/routes/dashboardPriority.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /hashCredential/);
  assert.match(source, /verifyCredential/);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /SESSION_TTL_MS/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /priorityOrder: index \+ 1/);
  assert.doesNotMatch(source, /AndonCall|machineStatus|andonStatus|productionMode/);
});

test("Admin deixa explícito que prioridade é somente visual", async () => {
  const source = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Organização visual do Dashboard/);
  assert.match(source, /Padrão atual/);
  assert.match(source, /Prioridade de produção/);
  assert.match(source, /Não altera chamados, tempos,/);
  assert.match(source, /Acesso à gestão de prioridades/);
});

test("Dashboard possui acesso dedicado e envia modo visual ao grid", async () => {
  const source = await readFile(
    new URL("../src/pages/DashboardPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Organizar prioridade de produção/);
  assert.match(source, /DashboardPriorityLoginModal/);
  assert.match(source, /to: "\/machine-priorities"/);
  assert.match(source, /orderMode=\{dashboardMachineOrderMode\}/);
});

test("tela exclusiva permite arrastar, mover e salvar sem controles operacionais", async () => {
  const source = await readFile(
    new URL("../src/pages/DashboardPriorityPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /draggable/);
  assert.match(source, /Mover .* para cima/);
  assert.match(source, /Mover .* para baixo/);
  assert.match(source, /Salvar sequência/);
  assert.match(source, /Descartar/);
  assert.match(source, /Alterações não salvas/);
  assert.doesNotMatch(source, /attendCall|finishCall|machineStatus|changeMachineStatus/);
});

test("P1-P5 formam um grupo visual externo sem contorno individual nos cards", async () => {
  const [grid, card] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineGrid.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/machines/MachineCard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(grid, /orderedMachines\.slice\(0, 5\)/);
  assert.match(grid, /data-production-priority-group="true"/);
  assert.match(grid, /border-orange-500\/70/);
  assert.match(grid, /absolute -inset-1/);
  assert.match(grid, /contents lg:relative lg:grid/);
  assert.match(card, /P\{productionPriorityRank\}/);
  assert.doesNotMatch(card, /outline-primary\/70/);
});


test("CORS autoriza método PUT e header Authorization usados pela gestão de prioridades", async () => {
  const source = await readFile(
    new URL("../server/src/config/cors.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /"PUT"/);
  assert.match(source, /"Authorization"/);
  assert.match(source, /CORS_METHODS\.join\(","\)/);
  assert.match(source, /CORS_ALLOWED_HEADERS\.join\(","\)/);
});


test("route tree versionado inclui a tela de prioridades", async () => {
  const [routeFile, routeTree] = await Promise.all([
    readFile(new URL("../src/routes/machine-priorities.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8"),
  ]);

  assert.match(routeFile, /createFileRoute\("\/machine-priorities"\)/);
  assert.match(routeTree, /MachinePrioritiesRouteImport/);
  assert.match(routeTree, /'\/machine-priorities'/);
  assert.match(routeTree, /MachinePrioritiesRoute: typeof MachinePrioritiesRoute/);
});


test("badge P1-P5 mantém destaque leve sem virar alerta operacional", async () => {
  const card = await readFile(
    new URL("../src/components/machines/MachineCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(card, /text-\[13px\]/);
  assert.match(card, /sm:text-sm/);
  assert.match(card, /2xl:text-\[15px\]/);
  assert.match(card, /bg-orange-500\/12/);
  assert.match(card, /border-orange-500\/55/);
  assert.match(card, /text-orange-400/);
});


test("histórico de prioridade cria baseline aditivo para o futuro BI", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20261004190500_add_machine_priority_history/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /machine_priority_history/);
  assert.match(migration, /previousPriorityRank/);
  assert.match(migration, /newPriorityRank/);
  assert.match(migration, /history_baseline/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /WHERE m\."isActive" = TRUE/);
  assert.doesNotMatch(
    migration,
    /\bDROP\s+TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i,
  );
});

test("salvamento de prioridade registra somente mudanças reais na mesma transação", async () => {
  const [routeSource, helperSource] = await Promise.all([
    readFile(new URL("../server/src/routes/dashboardPriority.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../server/src/domain/machinePriorityHistory.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(routeSource, /buildCurrentPrioritySnapshot/);
  assert.match(routeSource, /buildPrioritySnapshot/);
  assert.match(routeSource, /diffPrioritySnapshots/);
  assert.match(routeSource, /prisma\.machinePriorityHistory\.create/);
  assert.match(routeSource, /changedBy: auth\.session\.username/);
  assert.match(routeSource, /source: "priority_manager"/);
  assert.match(routeSource, /\.\.\.historyEntries/);
  assert.match(routeSource, /prisma\.\$transaction/);
  assert.match(helperSource, /previousPriorityRank === newPriorityRank/);
});

test("snapshot de prioridade considera somente máquinas ativas no P1-P5", () => {
  const machines = Array.from({ length: 6 }, (_, index) => ({
    id: String(index + 1),
    isActive: true,
    priorityOrder: index + 1,
    displayOrder: index + 1,
  }));

  const previous = buildCurrentPrioritySnapshot(machines);
  const nextMachines = machines.map((machine) =>
    machine.id === "1" ? { ...machine, isActive: false } : machine,
  );
  const next = buildPrioritySnapshot(
    previous.orderedIds,
    new Map(nextMachines.map((machine) => [machine.id, machine])),
  );
  const changes = diffPrioritySnapshots(previous.orderedIds, previous, next);

  assert.deepEqual(
    changes.map((change) => [
      change.machineId,
      change.previousPriorityRank,
      change.newPriorityRank,
    ]),
    [
      ["1", 1, null],
      ["2", 2, 1],
      ["3", 3, 2],
      ["4", 4, 3],
      ["5", 5, 4],
      ["6", null, 5],
    ],
  );
});

test("snapshot idêntico não cria alteração histórica duplicada", () => {
  const machines = [
    { id: "1", isActive: true, priorityOrder: 1, displayOrder: 1 },
    { id: "2", isActive: true, priorityOrder: 2, displayOrder: 2 },
  ];
  const snapshot = buildCurrentPrioritySnapshot(machines);

  assert.deepEqual(
    diffPrioritySnapshots(snapshot.orderedIds, snapshot, snapshot),
    [],
  );
});

test("ativação e criação de máquina alimentam o histórico de prioridade", async () => {
  const source = await readFile(
    new URL("../server/src/routes/machines.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /priorityHistory:/);
  assert.match(source, /source: "machine_created"/);
  assert.match(source, /source: "machine_activation"/);
  assert.match(source, /diffPrioritySnapshots/);
  assert.match(source, /tx\.machinePriorityHistory\.create/);
  assert.match(source, /prisma\.\$transaction/);
});

test("schema de histórico de prioridade é preparado para análise temporal do BI", async () => {
  const schema = await readFile(
    new URL("../server/prisma/schema.prisma", import.meta.url),
    "utf8",
  );

  assert.match(schema, /model MachinePriorityHistory/);
  assert.match(schema, /previousOrder\s+Int\?/);
  assert.match(schema, /newOrder\s+Int\?/);
  assert.match(schema, /previousPriorityRank\s+Int\?/);
  assert.match(schema, /newPriorityRank\s+Int\?/);
  assert.match(schema, /changedAt\s+DateTime/);
  assert.match(schema, /changedBy\s+String\?/);
  assert.match(schema, /source\s+String/);
  assert.match(schema, /reason\s+String\?/);
  assert.match(schema, /@@index\(\[machineId, changedAt\]\)/);
});
