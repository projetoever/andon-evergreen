import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cliente do ANDON BI permanece read-only e nao gera identidade de workstation", async () => {
  const client = await readFile(
    new URL("../src/api/andonBiApiClient.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(client, /workstationIdentity|X-Andon-Workstation-Id|adminSession/);
  assert.match(client, /method: "GET"/);
  assert.doesNotMatch(client, /post\(|patch\(|delete\(/);
});

test("dashboard executivo usa Analytics API real e nao placeholders", async () => {
  const [page, overview] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/bi/BiOverviewWorkspace.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /loadExecutiveOverview/);
  assert.match(overview, /Máquinas com maior parada/);
  assert.match(overview, /Downtime acumulado/);
  assert.match(overview, /MTTA/);
  assert.doesNotMatch(page, /Aguardando Analytics API|Sem dados simulados/);
});

test("servico BI usa relogio autoritativo do servidor para definir o periodo", async () => {
  const service = await readFile(
    new URL("../src/services/andonBiService.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /andonBiApiClient\.get<ApiHealth>\("\/health"\)/);
  assert.match(service, /buildRollingPeriod\(health\.timestamp, filters\.period\)/);
});


test("dashboard BI oferece resumo executivo, downtime temporal e drill-down read-only", async () => {
  const [page, overview, service, summary, drilldown] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/bi/BiOverviewWorkspace.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiExecutiveSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiAnalyticsDrillDown.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(overview, /BiExecutiveSummary/);
  assert.match(overview, /BiDowntimeTrendCard/);
  assert.match(page, /BiAnalyticsDrillDown/);
  assert.match(service, /\/api\/analytics\/drilldown/);
  assert.match(summary, /período anterior equivalente/);
  assert.match(drilldown, /Registros analíticos que sustentam o ponto selecionado/);
  assert.match(drilldown, /PAGE_SIZE = 7/);
});


test("dashboard BI mantém confiabilidade e semântica visual ANDON", async () => {
  const [overview, card, reliability, summary] = await Promise.all([
    readFile(
      new URL("../src/components/bi/BiOverviewWorkspace.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/components/bi/BiKpiCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiReliabilityStrip.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiExecutiveSummary.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(overview, /Tempo efetivo manutenção/);
  assert.match(overview, /Downtime acumulado/);
  assert.match(reliability, /MTBF estimado/);
  assert.match(reliability, /Downtime \/ episódio/);
  assert.match(card, /Baixa amostra/);
  assert.match(card, /border-red-500/);
  assert.match(card, /border-amber-500/);
  assert.match(card, /border-emerald-500/);
  assert.match(summary, /amostra baixa/i);
});


test("BI-MVP-5 mede participação técnica em pessoa-minutos sem ranking", async () => {
  const [page, service, component, route] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/bi/BiMaintenanceParticipation.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BiMaintenanceParticipation/);
  assert.match(service, /\/api\/analytics\/maintenance/);
  assert.match(component, /Pessoa-minutos/);
  assert.match(component, /não ranking de desempenho/);
  assert.match(component, /Cobertura de fases/);
  assert.match(component, /sessão\(ões\) legada\(s\)/);
  assert.match(route, /technicianSession\.findMany/);
  assert.match(route, /isSystemTest: false/);
  assert.match(route, /phase maintenance\/follow_up/);
});


test("BI-MVP-6 preserva bad actors, reincidência e saúde do dado", async () => {
  const [page, service, badActors, dataHealth, route, analytics] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiBadActorsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiDataHealthPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/analytics/reliability.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BiBadActorsPanel/);
  assert.match(page, /BiDataHealthPanel/);
  assert.match(service, /\/api\/analytics\/reliability/);
  assert.match(badActors, /Máquinas críticas · Bad Actors/);
  assert.match(badActors, /Diag\. repetido/);
  assert.match(dataHealth, /Qualidade dos dados · Investigação/);
  assert.match(dataHealth, /Chamados ativos > 24h/);
  assert.match(route, /badActors:/);
  assert.match(route, /não há score oculto/);
  assert.match(analytics, /countRepeatDiagnoses/);
  assert.match(analytics, /mergeIntervals/);
});


test("BI-UX-1 usa workspace de tela única com abas e drill-down em overlay", async () => {
  const [page, tabs, drilldown] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiWorkspaceTabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiAnalyticsDrillDown.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /h-dvh overflow-hidden/);
  assert.match(page, /min-h-0 flex-1 overflow-hidden/);
  assert.match(page, /activeTab === "overview"/);
  assert.match(page, /activeTab === "reliability"/);
  assert.match(page, /activeTab === "failures"/);
  assert.match(page, /activeTab === "maintenance"/);
  assert.match(page, /activeTab === "data-quality"/);
  assert.match(page, /fixed inset-0 z-50/);
  assert.match(tabs, /Visão Geral/);
  assert.match(tabs, /Confiabilidade/);
  assert.match(tabs, /Falhas/);
  assert.match(tabs, /Manutenção/);
  assert.match(tabs, /Qualidade do Dado/);
  assert.match(drilldown, /página/);
});


test("BI-UX-1.1 pagina participação pela altura e preserva cobertura de fases", async () => {
  const component = await readFile(
    new URL("../src/components/bi/BiMaintenanceParticipation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /ResizeObserver/);
  assert.match(component, /viewport\.clientHeight \/ rowHeight/);
  assert.match(component, /useVisibleRows\(62, Boolean\(data\)\)/);
  assert.match(component, /useVisibleRows\(63, Boolean\(data\)\)/);
  assert.match(component, /ref=\{technicianViewport\}/);
  assert.match(component, /ref=\{areaViewport\}/);
  assert.match(component, /PageControls/);
  assert.match(component, /Cobertura de fases/);
  assert.doesNotMatch(component, /technicians\.slice\(0, 6\)/);
  assert.doesNotMatch(component, /technicalAreas\.slice\(0, 6\)/);
});

test("BI-UX-1.1 fecha modal com Esc e usa linhas de altura natural", async () => {
  const [page, detail, badActors] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiAnalyticsDrillDown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiBadActorsPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /event\.key !== "Escape"/);
  assert.match(page, /document\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(page, /document\.removeEventListener\("keydown", onKeyDown, true\)/);
  assert.match(page, /previousFocus\.focus\(\)/);
  assert.match(detail, /autoFocus/);
  assert.match(detail, /Esc para fechar/);
  assert.doesNotMatch(detail, /<table className="h-full/);
  assert.doesNotMatch(badActors, /<table className="h-full/);
});


test("BI-MVP-7 mantém Pareto e acrescenta reincidência com linha do tempo read-only", async () => {
  const [page, workspace, panel, service, route] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiFailureWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiFailureIntelligencePanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /loadFailureIntelligence/);
  assert.match(workspace, /Reincidências/);
  assert.match(workspace, /Classificações e setores/);
  assert.match(workspace, /BiFailureIntelligencePanel/);
  assert.match(panel, /Repetições até 24h/);
  assert.match(panel, /Repetições até 7 dias/);
  assert.match(panel, /Repetições até 30 dias/);
  assert.match(panel, /Histórico \/ linha do tempo/);
  assert.match(panel, /ResizeObserver/);
  assert.match(panel, /Página anterior/);
  assert.match(service, /\/api\/analytics\/failure-intelligence/);
  assert.match(route, /buildFailureIntelligence/);
  assert.match(route, /isSystemTest: false/);
  assert.match(route, /status: "finished"/);
});


test("BI-MVP-8 abre Machine 360 read-only com filtros, snapshot e paginação sem rolagem", async () => {
  const [page, overlay, client, endpoint, model] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiMachine360Overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/analytics/machine360.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BiMachine360Overlay/);
  assert.match(page, /loadMachine360/);
  assert.match(page, /setMachineSelection/);
  assert.match(client, /\/api\/analytics\/machine-360/);
  assert.match(overlay, /Machine 360/);
  assert.match(overlay, /event\.key !== "Escape"/);
  assert.match(overlay, /ResizeObserver/);
  assert.match(overlay, /role="dialog"/);
  assert.match(overlay, /Linha do tempo/);
  assert.match(endpoint, /"\/api\/analytics\/machine-360"/);
  assert.match(endpoint, /isSystemTest: false/);
  assert.match(model, /buildAssetReliability/);
  assert.match(model, /timeline:/);
});
