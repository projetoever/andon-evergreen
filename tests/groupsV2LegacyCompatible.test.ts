import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isCorrectiveReasonCandidate } from "../server/src/analytics/correctiveReasonCohort";

const read = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("GROUPS/V2: existing sectors remain direct buttons beside optional group shortcuts", async () => {
  const [panel, machine, general, options] = await Promise.all([
    read("src/components/machines/MachineActionPanel.tsx"),
    read("src/pages/MachineDetailPage.tsx"),
    read("src/components/calls/OpenCallModal.tsx"),
    read("src/components/calls/CallReasonOptionsModal.tsx"),
  ]);
  const direct = panel.indexOf("{categories.map((category)");
  const group = panel.indexOf("{hierarchicalReasons?.map(reason");
  assert(direct >= 0 && group > direct, "sectors must render before optional groups");
  assert.match(panel, /activeCall = activeCalls\.find\(call => call\.subtype === category\.id\)/);
  assert.match(panel, /onOpenSubtype=\{onOpenSubtype\}/);
  assert.match(panel, /onSelectCall=\{onSelectCall\}/);
  assert.match(machine, /if \(!machine\) return;\s+setHierarchicalChoice\(null\)/);
  assert.match(general, /<CallTypeSelector value=\{hierarchicalChoice \? null : subtype\}/);
  assert.match(general, /setHierarchicalChoice\(null\); setSubtype\(value\)/);
  assert.match(general, /Grupos de chamados \(opcionais\)/);
  assert.match(options, /Chamado já aberto/);
  assert.match(machine, /setSelectedCallId\(existing\.id\)/);
  assert.match(panel, /data-call-group-button="true"/);
  assert.match(panel, /backgroundColor: reason\.color/);
  assert.match(panel, /color: readableTextColor\(reason\.color\)/);
  assert.match(options, /sectorColors\?: Readonly<Record<string, string>>/);
  assert.match(options, /backgroundColor: color/);
  assert.match(machine, /sectorColors=\{Object\.fromEntries\(categories\.map/);
});

test("GROUPS/V2: parent owns corrective eligibility; direct legacy and GPIO subtype stay stable", async () => {
  const [policy, mutations, opening, calls, sound, service, schema] = await Promise.all([
    read("server/src/services/callReasons.ts"),
    read("server/src/services/callReasonMutations.ts"),
    read("server/src/services/callReasonOpening.ts"),
    read("server/src/routes/andonCalls.ts"),
    read("src/hooks/useAndonOpenCallSound.ts"),
    read("docs/INDUSTRIAL_SERVICE_IDENTITY.md"),
    read("server/prisma/schema.prisma"),
  ]);
  for (const field of ["nature","suggestedResponsibility","maintenanceKpiPolicy","analyticsDisposition"]) {
    assert.match(policy, new RegExp(field + ": reason\\." + field));
  }
  assert.match(mutations, /group_policy_cannot_be_overridden_by_sector/);
  assert.match(opening, /option\.technicalAreaId !== selected\.legacySubtype/);
  assert.match(calls, /const reasonSelection: ReasonOpeningSelection \| null = hasReasonSelection/);
  assert.match(calls, /findDuplicateActiveSectorCall\(/);
  assert.match(sound, /item\.key === call\.subtype/);
  assert.match(service, /GET \/api\/andon-calls/);
  assert.match(schema, /@@unique\(\[reasonId, technicalAreaId\]\)/);
  const direct = isCorrectiveReasonCandidate(null);
  const setup = isCorrectiveReasonCandidate({
    nature: "planned_setup", maintenanceKpiPolicy: "excluded", analyticsDisposition: "include",
  });
  const maintenance = isCorrectiveReasonCandidate({
    nature: "corrective_failure", maintenanceKpiPolicy: "eligible", analyticsDisposition: "include",
  });
  assert.equal(direct, true, "old calls retain original evidence-based evaluation");
  assert.equal(setup, false, "setup cannot be a corrective KPI candidate");
  assert.equal(maintenance, true, "eligible group is only a corrective candidate, not proof");
});

test("GROUPS/V2: configuration changes never rewrite technical sector identifiers", async () => {
  const [nav, groupEditor, service, modal] = await Promise.all([
    read("src/components/settings/AdminSettingsModal.tsx"),
    read("src/components/settings/CallReasonsSettingsTab.tsx"),
    read("src/services/callReasonsCatalogService.ts"),
    read("src/components/calls/QuickOpenCallModal.tsx"),
  ]);
  assert.match(nav, /Grupos de chamados/);
  assert.match(nav, /id: "callReasons"/);
  assert.match(nav, /id: "categories"/);
  assert.doesNotMatch(nav, /catalogView/);
  assert.match(groupEditor, /data-group-preview="true"/);
  assert.match(groupEditor, /readableGroupTextColor/);
  assert.match(groupEditor, /Prévia no ANDON/);
  assert.match(groupEditor, /Elegibilidade do grupo aos KPIs corretivos/);
  assert.match(groupEditor, /Permitir contabilização corretiva mediante evidências/);
  assert.match(groupEditor, /!isPrimaryAdmin \|\| draft\.nature !== "corrective_failure"/);
  assert.match(groupEditor, /getCategoryConfigs\(\)/);
  assert.match(groupEditor, /technicalAreaId: area\.id/);
  assert.match(groupEditor, /addCallReasonOption\(chosen\.id/);
  assert.match(service, /legacySubtype: string/);
  assert.match(modal, /expectedReasonRevision: hierarchicalChoice\.expectedReasonRevision/);
  assert.match(modal, /expectedOptionRevision: hierarchicalChoice\.expectedOptionRevision/);
  assert.doesNotMatch(groupEditor, /andonCategory\.delete|removeAndonCategory\(/);
});

test("REFINE22.1: active group is visible without enabling operational creation", async () => {
  const [panel, page, security, routes, service, editor, opening] = await Promise.all([
    read("src/components/machines/MachineActionPanel.tsx"),
    read("src/pages/MachineDetailPage.tsx"),
    read("server/src/security/centralCallReasonsHttp.ts"),
    read("server/src/routes/callReasons.ts"),
    read("src/services/callReasonsCatalogService.ts"),
    read("src/components/settings/CallReasonsSettingsTab.tsx"),
    read("server/src/services/callReasonOpening.ts"),
  ]);
  assert.match(routes, /openingEnabled: process\.env\.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED === "1"/);
  assert.match(service, /openingEnabled: boolean/);
  assert.match(panel, /disabled=\{!reason\.openingEnabled \|\| reason\.options\.length === 0\}/);
  assert.match(panel, /Grupo ativo, mas abertura por grupos não liberada nesta instalação/);
  assert.match(page, /reason\.openingEnabled/);
  assert.match(security, /if \(!centralCallReasonsHttpEnabled\(\)\)/);
  assert.match(security, /assertPermission\(principal, "calls\.open"\)/);
  assert.match(opening, /if \(!input\.catalogEnabled \|\| !input\.hierarchicalOpeningEnabled\)/);
  const globalOpen = await read("src/components/calls/OpenCallModal.tsx");
  assert.match(globalOpen, /!reason\?\.openingEnabled/);
  assert.match(globalOpen, /!reason\.openingEnabled \|\| reason\.options\.length === 0/);
  assert.match(editor, /grid gap-2 md:grid-cols-2/);
  assert.match(editor, /min-h-10 min-w-28 max-w-48/);
  assert.doesNotMatch(editor, /machine-sector-action inline-flex min-h-14/);
});
