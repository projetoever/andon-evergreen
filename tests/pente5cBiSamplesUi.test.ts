import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url),"utf8");

test("PENTE5C: API incluiu o funil sobre o mesmo dataset e máquina autorizada",()=>{
  const route=read("../server/src/routes/analytics.ts");
  assert.match(route,/buildBiSampleDiagnostics/);
  assert.match(route,/sampleDiagnostics: buildBiSampleDiagnostics/);
  assert.match(route,/calls: currentData\.calls/);
  assert.match(route,/failureEvents: currentData\.failureEvents/);
  assert.match(route,/reasonNameSnapshot: true/);
  assert.match(route,/scopedMachineReadIds\(request\)/);
});
test("PENTE5C: diagnóstico na Qualidade dos Dados usa a mesma janela selecionada",()=>{
  const page=read("../src/pages/AndonBiPage.tsx");
  const health=read("../src/components/bi/BiDataHealthPanel.tsx");
  const panel=read("../src/components/bi/BiSampleDiagnosticsPanel.tsx");
  assert.match(page,/sampleDiagnostics=\{overview\?\.sampleDiagnostics\}/);
  assert.match(health,/<BiSampleDiagnosticsPanel/);
  assert.match(panel,/Por que os KPIs estão sem amostra/);
  assert.match(panel,/sampleDiagnostics|data\.cases/);
  assert.match(panel,/candidate_needs_causal_episode/);
  assert.match(panel,/non_corrective_group/);
});
test("PENTE5C: configurador não equipara BI operacional e KPI de manutenção",()=>{
  const group=read("../src/components/settings/CallReasonsSettingsTab.tsx");
  assert.match(group,/grupo aparece no BI operacional, mas NÃO está elegível aos KPIs corretivos/);
  assert.match(group,/maintenanceKpiPolicy === "eligible"/);
  assert.match(group,/draft\.analyticsDisposition === "include"/);
});
