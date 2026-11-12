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
