import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("PENTE 2 visual: priority frame and header mirror Global History's approved layout", async () => {
  const [priority, history, nav] = await Promise.all([
    read("pages/DashboardPriorityPage.tsx"),
    read("pages/GlobalCallHistoryPage.tsx"),
    read("components/priority/PrioritySectionNav.tsx"),
  ]);
  for (const code of [priority, history]) {
    assert.match(code, /max-w-\[1800px\]/);
    assert.match(code, /bg-background px-3 pb-6 pt-4 text-foreground sm:px-5/);
    assert.match(code, /flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3/);
    assert.match(code, /text-xl font-black sm:text-2xl/);
    assert.match(code, /<LanguageSelector compact\s*\/>/);
    assert.match(code, /<ModuleNavigation showModuleLinks\s*\/>/);
  }
  assert.match(priority, /lg:grid-cols-\[minmax\(260px,320px\)_minmax\(0,1fr\)\]/);
  assert.match(nav, /<aside className="hidden lg:block"/);
  assert.match(nav, /<Sheet open=\{mobileOpen\} onOpenChange=\{setMobileOpen\}>/);
  assert.match(nav, /aria-current=\{activeSection === id \? "page" : undefined\}/);
  assert.match(nav, /focus-visible:ring-2/);
});

test("PENTE 2 visual: collapsible filters apply only to visible rows without dropping order changes", async () => {
  const priority = await read("pages/DashboardPriorityPage.tsx");
  assert.match(priority, /const \[filtersExpanded, setFiltersExpanded\] = useState\(true\)/);
  assert.match(priority, /aria-expanded=\{filtersExpanded\} aria-controls="priority-filters"/);
  assert.match(priority, /id="priority-filters"/);
  assert.match(priority, /activeFilterCount > 0/);
  assert.match(priority, /setSearchQuery\(""\)/);
  assert.match(priority, /setActivityFilter\("all"\)/);
  assert.match(priority, /setProductionFilter\("all"\)/);
  assert.match(priority, /visibleRows\.length === 0 \? \(/);
  assert.match(priority, /rows\.length === 0 \? ui/);
  assert.match(priority, /reorderVisiblePriorityIds/);
  assert.match(priority, /saveDashboardPriorityOrder\(\s*rows\.map\(\(row\) => row\.id\), savedIds,/);
  assert.match(priority, /priorityHighlightCount !== savedHighlightCount/);
  assert.match(priority, /hasUnsavedChanges/);
  assert.match(priority, /window\.confirm\(ui\("Descartar as alterações de prioridade ainda não salvas\?"\)\)/);
});

test("PENTE 2 visual: semantic machine badges, rights-scoped history and operational separation", async () => {
  const [priority, badge, service, nav] = await Promise.all([
    read("pages/DashboardPriorityPage.tsx"),
    read("components/priority/PriorityMachineBadges.tsx"),
    read("services/dashboardPriorityService.ts"),
    read("components/layout/ModuleNavigation.tsx"),
  ]);
  assert.match(priority, /<PriorityActivationBadge active=\{row\.isActive\}/);
  assert.match(priority, /<PriorityProductionBadge mode=\{row\.productionMode\}/);
  assert.match(priority, /onClick=\{\(\) => void requestScheduleChange\(row\)\}/);
  assert.match(priority, /scheduleRequester.fullScope \|\| scheduleRequester.machineIds.includes\(row.id\)/);
  assert.match(priority, /activePriorityRanks\.get\(row\.id\)/);
  assert.match(priority, /canShowPriorityMachineHistory\(access, row\.id\)/);
  assert.match(priority, /canShowPriorityMachineHistory\(access, row\.id\)/);
  assert.match(priority, /navigate\(\{ to: "\/history", search: \{ machineId: row\.id \} \}\)/);
  assert.match(badge, /CalendarCheck2/);
  assert.match(badge, /CalendarX2/);
  assert.match(badge, /bg-emerald-50/);
  assert.match(badge, /bg-amber-50/);
  assert.match(badge, /dark:bg-emerald-950/);
  assert.match(badge, /dark:bg-amber-950/);
  assert.match(badge, /Ativa no cadastro/);
  assert.doesNotMatch(priority, /machineStatus|activeCalls\.length|andonStatus/);
  assert.match(priority, /accessRequest\("\/machines\/production-mode\/session", "POST"/);
  assert.match(priority, /<ProductionModeCredentialModal/);
  assert.match(priority, /expectedProductionMode: machine\.productionMode/);
  assert.match(service, /expectedMachineIds/);
  assert.match(nav, /!grant\?\.available \|\| !grant\.enabled \|\| !grant\.allowed/);
});

test("PENTE 2 visual: newly added controls and status labels translated in three languages", async () => {
  const messages = await read("i18n/messages.ts");
  const labels = [
    "ANDON · Organização visual", "Filtros e máquinas", "Filtros ativos: {0}",
    "Limpar filtros", "Exibindo {0} de {1} máquinas", "Posição", "Prioridade {0}",
    "Ativa no cadastro", "Inativa no cadastro", "Consultar histórico de {0}",
    "Os filtros alteram somente a lista exibida. A gravação preserva a sequência completa e as máquinas ocultas.",
  ];
  const base = JSON.parse(await read("i18n/baseMessages.json")) as string[][];
  for (const label of labels) {
    assert(base.some(([pt]) => pt === label) ||
      messages.includes(JSON.stringify(label) + ","),
      `missing translation: ${label}`);
  }
});
