import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("HIST-03: Hub card remains disabled without server-enabled history grant", async () => {
  const [card, server, model] = await Promise.all([
    source("../src/components/layout/ModuleCards.tsx"),
    source("../server/src/routes/modules.ts"),
    source("../src/types/modules.ts"),
  ]);
  assert.match(card,/access\.globalHistory\?\.available === true/);
  assert.match(card,/access\.globalHistory\.allowed === true/);
  assert.match(card,/historyAllowed \? \(/);
  assert.match(card,/aria-disabled="true"/);
  assert.match(card,/to="\/history"/);
  assert.match(server,/globalHistory: globalHistoryModuleAccess\(principal, workstation\)/);
  assert.match(model,/globalHistory\?: \{ available: boolean; allowed: boolean \}/);
});

test("HIST-03: central history route does NOT mount the legacy unscoped AndonProvider", async () => {
  const [root, route, page] = await Promise.all([
    source("../src/routes/__root.tsx"),
    source("../src/pages/HistoryPage.tsx"),
    source("../src/pages/GlobalCallHistoryPage.tsx"),
  ]);
  assert.match(root,/pathname === "\/history"/);
  assert.match(root,/access\?\.centralAccessEnabled\s*\?\s*<Outlet\s*\/>/);
  assert.match(page,/if \(!allowed\) return/);
  assert.match(page,/searchGlobalHistory\(applied, offset\)/);
  assert.match(page,/listAuthorizedHistoryMachines\(\)/);
  assert.match(page,/Selecion[e]? uma ocorrência/);
  assert.match(route,/access\?\.centralAccessEnabled\) return <GlobalCallHistoryPage \/>/);
  assert.match(route,/function LegacyHistoryPage\(/);
});

test("HIST-03: chronology, period and selected-machine filtering cannot bypass server", async () => {
  const [backend, sql, scope] = await Promise.all([
    source("../server/src/routes/andonCalls.ts"),
    source("../server/src/services/globalCallHistoryQuery.ts"),
    source("../server/src/security/centralScopedMachineReads.ts"),
  ]);
  assert.match(backend,/ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED !== "1"/);
  assert.match(backend,/scopedGlobalHistoryReadIds\(request\)/);
  assert.match(sql,/callMachineReadWhere\(machineId, allowedMachineIds\)/);
  assert.match(sql,/openedAt: "desc" as const/);
  assert.match(scope,/assertPermission\(principal, "history.read"\)/);
});

test("HIST-04: individual details only load for server-authorized selected calls", async () => {
  const [page,client,panels] = await Promise.all([
    source("../src/pages/GlobalCallHistoryPage.tsx"),
    source("../src/services/globalHistoryService.ts"),
    source("../src/components/history/GlobalHistoryDetailSections.tsx"),
  ]);
  assert.match(page,/getGlobalHistoryCallDetail\(selectedId\)/);
  assert.match(page,/result\?\.items\.some\(item => item\.id === selectedId\)/);
  assert.match(page,/let active = true/);
  assert.match(page,/return \(\) => \{ active = false; \}/);
  assert.match(page,/detail\?\.id===selected\.id/);
  assert.match(client,/\/api\/andon-calls\/history\/detail\//);
  assert.match(panels,/call\.technicianSessions/);
  assert.match(panels,/call\.failureEvents/);
  assert.match(panels,/call\.machineStoppedMinutes/);
  assert.match(panels,/call\.attendedAt/);
  assert.match(panels,/Eventos e tempos apresentados conforme registros existentes/);
  assert.doesNotMatch(panels,/(?:eval\(|dangerouslySetInnerHTML)/);
});

test("HIST-05: exact authorized totals and page-only export are visibly distinguished", async () => {
  const [page,scope,panel,exporter] = await Promise.all([
    source("../src/pages/GlobalCallHistoryPage.tsx"),
    source("../server/src/security/centralScopedMachineReads.ts"),
    source("../src/components/history/GlobalHistorySummaryPanel.tsx"),
    source("../src/services/globalHistoryPageCsv.ts"),
  ]);
  assert.match(scope,/pathname === "\/api\/andon-calls\/history\/summary"/);
  assert.match(page,/getGlobalHistorySummary\(applied\)/);
  assert.match(page,/GlobalHistorySummaryPanel summary=\{summary\}/);
  assert.match(page,/downloadGlobalHistoryPageCsv\(result\.items\)/);
  assert.match(page,/CSV da página/);
  assert.match(page,/Exporta somente os registros da página atual/);
  assert.match(panel,/summary\.total/);
  assert.match(panel,/summary\.byStatus/);
  assert.match(panel,/summary\.byCategory/);
  assert.match(exporter,/items\.length > 25/);
  assert.doesNotMatch(page,/downloadGlobalHistoryPageCsv\(summary/);
});

test("HIST-06A: machine history links only to authorized global view with safe filter", async () => {
  const [machine, globalPage, route, sql, module] = await Promise.all([
    source("../src/pages/MachineCallHistoryPage.tsx"),
    source("../src/pages/GlobalCallHistoryPage.tsx"),
    source("../src/routes/history.tsx"),
    source("../server/src/services/globalCallHistoryQuery.ts"),
    source("../server/src/security/globalHistoryModuleAccess.ts"),
  ]);
  assert.match(machine, /access\.globalHistory\?\.available === true/);
  assert.match(machine, /access\.globalHistory\?\.allowed === true/);
  assert.match(machine, /globalHistoryAllowed && \(/);
  assert.match(machine, /to="\/history" search=\{\{ machineId \}\}/);
  assert.match(route, /validateSearch:/);
  assert.match(route, /search\.machineId\.length <= 128/);
  assert.match(globalPage, /useSearch\(\{ from: "\/history" \}\)/);
  assert.match(globalPage, /machineId: requestedMachineId/);
  assert.match(globalPage, /setApplied\(next\)/);
  assert.match(globalPage, /searchGlobalHistory\(applied, offset\)/);
  assert.match(sql, /callMachineReadWhere\(machineId, allowedMachineIds\)/);
  assert.match(module, /history\.read/);
});
