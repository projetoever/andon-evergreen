import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("PENTE 6-B: manutenção apresenta barras empilhadas visíveis e preserva detalhes", () => {
  const page = read("../src/components/bi/BiMaintenanceParticipation.tsx");
  const chart = read("../src/components/bi/BiMaintenanceStackedChart.tsx");
  assert.match(page, /technicianView === "chart"/);
  assert.match(page, /areaView === "chart"/);
  assert.match(page, /<BiMaintenanceStackedChart/);
  assert.match(page, /<SplitBar/);
  assert.match(page, /Atenção: \{0\} de \{1\} horas técnicas/);
  assert.match(chart, /layout="vertical"/);
  assert.match(chart, /stackId="technical"/);
  assert.match(chart, /<XAxis type="number"/);
  assert.match(chart, /<YAxis type="category"/);
  assert.match(chart, /totalPersonMinutes/);
  assert.doesNotMatch(chart, /fetch\(|axios\.|POST|PATCH|DELETE/);
});

test("PENTE 6-B: falhas e confiabilidade usam gráficos incorporados com inspeção", () => {
  const failures = read("../src/components/bi/BiFailureWorkspace.tsx");
  const actors = read("../src/components/bi/BiBadActorsPanel.tsx");
  const inline = read("../src/components/bi/BiInlineDistributionChart.tsx");
  assert.match(failures, /<BiInlineDistributionChart/g);
  assert.match(failures, /onInspect=\{id=>.*onDrilldown/s);
  assert.match(failures, /Ver classificações detalhadas/);
  assert.match(actors, /<BiInlineDistributionChart/);
  assert.match(actors, /onInspect=\{id=>.*onSelectMachine/s);
  assert.match(inline, /availableBiChartModes/);
  assert.match(inline, /allowComposition/);
  assert.match(inline, /<XAxis type="number"/);
  assert.match(inline, /<YAxis type="category"/);
  assert.match(inline, /<BiChartAlternative/);
  assert.doesNotMatch(inline, /fetch\(|axios\.|POST|PATCH|DELETE/);
});

test("PENTE 6-B: qualidade separa métricas de snapshot e período, sem rosca falsa", () => {
  const quality = read("../src/components/bi/BiDataHealthPanel.tsx");
  assert.match(quality, /Situação atual dos alertas/);
  assert.match(quality, /Alertas no período selecionado/);
  assert.match(quality, /allowComposition=\{false\}/g);
  assert.match(quality, /<BiInlineDistributionChart/g);
  assert.match(quality, /onCategoryChange\(id as AnalyticsDataQualityCategory\)/);
});

test("PENTE 6-B: Visão Geral troca modos diretamente no cartão, mantendo tabela e export", () => {
  const explorer = read("../src/components/bi/BiChartExplorer.tsx");
  assert.match(explorer, /chartModes\.length > 1/);
  assert.match(explorer, /activeMode !== "bars"/);
  assert.match(explorer, /<BiChartAlternative/);
  assert.match(explorer, /exportCsv/);
  assert.match(explorer, /onInspectRow\(selected\)/);
  const catalog = read("../src/i18n/visualMessages.ts");
  assert.match(catalog, /Escala em horas por pessoa/);
  assert.match(catalog, /responsabilidade pendente/);
});
