import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("REFINE22 P1: all protected reason and option writes receive a derived CSRF token", async () => {
  const [client, guard] = await Promise.all([
    source("src/api/andonApiClient.ts"),
    source("server/src/security/centralCallReasonsHttp.ts"),
  ]);
  assert.match(client, /method === "POST" \|\| method === "PATCH"/);
  assert.match(client, /\/api\\\/call-reasons/);
  assert.match(client, /getCentralCsrf\(baseUrl, workstationId/);
  assert.match(client, /"X-Andon-CSRF": centralCsrf/);
  assert.match(guard, /checkCsrf\(readSecureCookie\(request, ACCESS_COOKIE\), request\.headers\["x-andon-csrf"\]\)/);
  assert.doesNotMatch(guard, /csrf_denied.*return/);
});

test("REFINE22 P1: motive-to-option UI preserves technical area, policy and editable buttons", async () => {
  const [editor, service, modal, backend] = await Promise.all([
    source("src/components/settings/CallReasonsSettingsTab.tsx"),
    source("src/services/callReasonsCatalogService.ts"),
    source("src/components/calls/CallReasonOptionsModal.tsx"),
    source("server/src/services/callReasons.ts"),
  ]);
  for (const item of [
    /<CompactAndonColorField/, /optionNameToAdd/, /Nome da subcategoria no botão/,
    /Área técnica responsável/, /addCallReasonOption\(chosen\.id/, /displayName,/,
    /draft\.analyticsDisposition/, /draft\.maintenanceKpiPolicy/, /policyReviewNeeded/,
  ]) assert.match(editor, item);
  assert.match(service, /displayName\?: string \| null/);
  assert.match(modal, /reason\?\.color/);
  assert.match(backend, /effectiveKpiStatus/);
  assert.match(backend, /preservesIndependentPhysicalDowntime: true/);
  assert.match(backend, /technicalTimeRecordedSeparately: true/);
  assert.match(editor, /KPIs de manutenção corretiva/);
  assert.doesNotMatch(editor, /openCall\(/);
});

test("REFINE22 P1: same ANDON picker is compact; no false missing-machine screen on pending snapshot", async () => {
  const [picker, colorField, reasonEditor, categoryEditor, root, machine, provider, loader] = await Promise.all([
    source("src/components/settings/VisualAccentRgbPicker.tsx"),
    source("src/components/settings/CompactAndonColorField.tsx"),
    source("src/components/settings/CallReasonsSettingsTab.tsx"),
    source("src/components/settings/CategoriesSettingsTab.tsx"),
    source("src/routes/__root.tsx"),
    source("src/pages/MachineDetailPage.tsx"),
    source("src/context/AndonProvider.tsx"),
    source("src/components/common/AndonLoadingTransition.tsx"),
  ]);
  assert.match(picker, /compact = false/);
  assert.match(picker, /linear-gradient\(to top/);
  assert.match(colorField, /<VisualAccentRgbPicker compact/);
  assert.match(reasonEditor, /<CompactAndonColorField/);
  assert.match(categoryEditor, /<CompactAndonColorField/);
  assert.match(root, /<RouteTransitionOverlay/);
  assert.match(machine, /initialSnapshotState !== "ready"/);
  assert.match(machine, /<AndonLoadingTransition recovering=/);
  const history = await source("src/pages/MachineCallHistoryPage.tsx");
  assert.match(history, /initialSnapshotState !== "ready"/);
  assert.match(history, /<AndonLoadingTransition recovering=/);
  assert.match(provider, /initialSnapshotState: "loading" \| "ready" \| "error"/);
  assert.match(loader, /motion-reduce:animate-none/);
});
