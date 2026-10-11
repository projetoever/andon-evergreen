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
  const page = await readFile(
    new URL("../src/pages/AndonBiPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /loadExecutiveOverview/);
  assert.match(page, /Pareto de máquinas/);
  assert.match(page, /Downtime físico/);
  assert.match(page, /MTTA/);
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
  const [page, service, summary, drilldown] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiExecutiveSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiAnalyticsDrillDown.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /BiExecutiveSummary/);
  assert.match(page, /BiDowntimeTrendCard/);
  assert.match(page, /BiAnalyticsDrillDown/);
  assert.match(service, /\/api\/analytics\/drilldown/);
  assert.match(summary, /período anterior equivalente/);
  assert.match(drilldown, /Registros analíticos que sustentam o ponto selecionado/);
});
