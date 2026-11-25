import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");

test("PENTE 2: the five sections have accessible desktop and mobile navigation", async () => {
  const nav = await source("components/priority/PrioritySectionNav.tsx");
  assert.match(nav, /type PrioritySectionId = "overview" \| "sequence" \| "production" \| "history" \| "help"/);
  for (const section of ["Visão Geral", "Sequência de Prioridades", "Produção Programada", "Histórico e Auditoria", "Ajuda e Orientações"])
    assert.ok(nav.includes(section), section);
  assert.match(nav, /<aside className="hidden lg:block"/);
  assert.match(nav, /<Sheet open=\{mobileOpen\} onOpenChange=\{setMobileOpen\}>/);
  assert.match(nav, /<nav aria-label=\{ui\("Navegação de Prioridades"\)\}/);
  assert.match(nav, /aria-current=\{activeSection === id \? "page" : undefined\}/);
  assert.match(nav, /focus-visible:ring-2/);
  assert.match(nav, /setMobileOpen\(false\)/);
});

test("PENTE 2: the first lot leaves priority writes and production scheduling separate", async () => {
  const page = await source("pages/DashboardPriorityPage.tsx");
  const service = await source("services/dashboardPriorityService.ts");
  const modal = await source("components/machines/ProductionModeCredentialModal.tsx");
  assert.match(page, /<PrioritySectionNav activeSection=\{activeSection\} onSectionChange=\{setActiveSection\}/);
  assert.match(page, /useState<PrioritySectionId>\("sequence"\)/);
  assert.match(page, /<ModuleNavigation showModuleLinks\s*\/>/);
  assert.match(page, /activeSection === "sequence" &&/);
  assert.match(page, /activeSection === "production" &&/);
  assert.match(page, /activeSection === "history" &&/);
  assert.match(page, /activeSection === "overview" &&/);
  assert.match(page, /activeSection === "help" &&/);
  assert.match(page, /activeRows\.slice\(0, effectiveHighlightCount\)/);
  assert.match(page, /saveDashboardPriorityOrder\(\s*rows\.map\(\(row\) => row\.id\), savedIds,/);
  assert.match(page, /priorityHighlightCount !== savedHighlightCount/);
  assert.match(page, /centralReadOnly = !access \|\| \(access\.centralAccessEnabled === true/);
  assert.match(page, /access\.principal\?\.machineScope !== "all"/);
  assert.match(page, /if \(centralReadOnly \|\| !hasUnsavedChanges \|\| isSaving\) return/);
  assert.doesNotMatch(page, /setProductionMode|machineProductionEvent|\/api\/machines\/:id\/production-mode/);
  assert.match(page, /accessRequest\("\/machines\/production-mode\/session", "POST"/);
  assert.doesNotMatch(service, /\/machines\/production-mode/);
  assert.match(modal, /expectedProductionMode: currentMode/);
});

test("PENTE 2: the sidebar copy has PT, EN and traditional Chinese entries", async () => {
  const messages = await source("i18n/messages.ts");
  for (const label of ["Sequência de Prioridades", "Histórico e Auditoria", "Ajuda e Orientações", "Como interpretar as prioridades"])
    assert.match(messages, new RegExp(`\\["${label}","[^"]+","[^"]+"\\]`));
});
