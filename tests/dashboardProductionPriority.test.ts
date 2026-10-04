import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
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

  assert.match(card, /text-\[11px\]/);
  assert.match(card, /sm:text-xs/);
  assert.match(card, /2xl:text-\[13px\]/);
  assert.match(card, /bg-orange-500\/10/);
  assert.match(card, /border-orange-500\/50/);
  assert.match(card, /text-orange-400/);
});
