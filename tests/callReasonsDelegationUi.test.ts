import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("CFG-08A: explicit Admin status controls catalog create and KPI-sensitive controls", async () => {
  const [page,server,types] = await Promise.all([
    source("../src/components/settings/CallReasonsSettingsTab.tsx"),
    source("../server/src/routes/modules.ts"),
    source("../src/types/modules.ts"),
  ]);
  assert.match(server,/isPrimaryAdmin: principal\.isPrimaryAdmin/);
  assert.match(types,/isPrimaryAdmin\?: boolean/);
  assert.match(page,/access\?\.principal\?\.isPrimaryAdmin === true/);
  assert.match(page,/isPrimaryAdmin \? values : \{/);
  assert.match(page,/disabled=\{busy \|\| !isPrimaryAdmin\}/);
  assert.match(page,/disabled=\{busy \|\| \(Boolean\(chosen\) && !isPrimaryAdmin\)\}/);
  assert.match(page,/!chosen && !isPrimaryAdmin/);
  assert.match(page,/KPI exigem Admin principal/);
});

test("CFG-08A: transaction rechecks delegated catalog role after session refresh", async () => {
  const [tx,domain,http] = await Promise.all([
    source("../server/src/access/centralGlobalCatalogTransaction.ts"),
    source("../server/src/access/centralCallReasonsWrite.ts"),
    source("../server/src/security/centralCallReasonsHttp.ts"),
  ]);
  assert.match(tx,/input\.assertAuthorizedCatalogPrincipal\?\.\(principal\)/);
  assert.match(tx,/input\.assertAuthorizedCatalogPrincipal\?\.\(latest\)/);
  assert.match(domain,/isReasonPresentationOnlyPatch\(input\.operation, input\.body\)/);
  assert.match(domain,/!isAndonSettingsDelegate\(principal\)/);
  assert.match(domain,/requirePrimaryAdmin: !safeDelegateAction/);
  assert.match(http,/isReasonPresentationOnlyPatch\(/);
  assert.match(http,/!principal\.isPrimaryAdmin && !presentationPatch && !conservativeCreate/);
  assert.match(http,/checkCsrf\(/);
});


test("CFG-08A2: delegated specialty editor changes presentation, not linked area or KPI policy", async () => {
  const [page, service, policy] = await Promise.all([
    source("../src/components/settings/CallReasonsSettingsTab.tsx"),
    source("../src/services/callReasonsCatalogService.ts"),
    source("../server/src/security/callReasonPresentationPolicy.ts"),
  ]);
  const editor = page.split("async function saveOptionPresentation")[1]?.split("\n  return (")[0];
  assert.ok(editor, "specialty presentation save handler must exist");
  assert.ok(editor.includes(String.raw`!/^\d{1,4}$/.test(orderText)`));
  assert.match(editor, /await updateCallReasonOption\(chosen\.id, option\.id, option\.revision/);
  assert.match(editor, /displayName: label \|\| null, displayOrder: order/);
  assert.doesNotMatch(editor, /natureOverride:|technicalAreaId:|maintenanceKpiPolicyOverride:/);
  assert.match(page, /Nome exibido da especialidade/);
  assert.match(page, /Ordem de exibição/);
  assert.match(page, /Nome vazio utiliza a área técnica original/);
  assert.match(page, /disabled=\{busy \|\| editingOptionId !== null\}/);
  assert.match(service, /expectedRevision: revision/);
  assert.match(policy, /"displayName", "active", "displayOrder"/);
});

test("CFG-08B1: reason creation by settings delegates cannot choose KPI or create specialties", async () => {
  const [page, service, http, domain, helper, tx] = await Promise.all([
    source("../src/components/settings/CallReasonsSettingsTab.tsx"),
    source("../src/services/callReasonsCatalogService.ts"),
    source("../server/src/security/centralCallReasonsHttp.ts"),
    source("../server/src/access/centralCallReasonsWrite.ts"),
    source("../server/src/security/callReasonDelegateCreate.ts"),
    source("../server/src/access/centralGlobalCatalogTransaction.ts"),
  ]);
  assert.match(page, /await createCallReason\(isPrimaryAdmin \? next : \{/);
  assert.match(page, /id: next\.id, displayName: next\.displayName, color: next\.color/);
  assert.match(page, /nature: next\.nature/);
  assert.match(page, /Vincular especialidades e alterar políticas de KPI exigem Admin principal/);
  assert.match(service, /CreateCallReason \| DelegatedReasonCreate/);
  assert.match(helper, /SAFE_REASON_FIELDS/);
  assert.match(helper, /maintenanceKpiPolicy: operative \? "excluded" : "pending"/);
  assert.doesNotMatch(helper, /"eligible"/);
  assert.match(http, /isDelegatedReasonCreate\(request\.body\)/);
  assert.match(domain, /isDelegatedReasonCreate\(input\.body\)/);
  assert.match(domain, /conservativeReasonCreate\(/);
  assert.match(domain, /additionalPermissions: safeDelegateAction \? \[\] : \["analytics\.policy\.manage"\]/);
  assert.match(tx, /input\.assertAuthorizedCatalogPrincipal\?\.\(latest\)/);
  assert.match(page, /disabled=\{busy \|\| !areaToAdd \|\| !isPrimaryAdmin\}/);
});
