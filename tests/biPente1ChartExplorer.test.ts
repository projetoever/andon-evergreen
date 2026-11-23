import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(`../src/components/bi/${path}`, import.meta.url), "utf8");

test("PENTE1: chart explorer uses accessible dialog, focus controls, table and local CSV", async () => {
  const chart = await source("BiChartExplorer.tsx");
  for (const entry of [
    "<Dialog open={open}",
    'role="button"',
    'tabIndex={0}',
    'aria-haspopup="dialog"',
    'event.key === "Enter"',
    'event.key === " "',
    "<DialogTitle",
    "<DialogDescription",
    "validRows",
    "highest",
    "lowest",
    'view === "chart"',
    "<table",
    'onInspectRow(selected)',
    "URL.createObjectURL(blob)",
    "URL.revokeObjectURL(url)",
    "csvCell",
  ]) assert.ok(chart.includes(entry), `Missing chart explorer contract: ${entry}`);
  assert.match(chart, /value === null/);
  assert.match(chart, /unit === "percent" \|\| !selected/);
  assert.match(chart, /selectedShare/);
  assert.doesNotMatch(chart, /fetch\(|axios\(|loadAnalyticsDrilldown\(/);
});

test("PENTE1: overview and temporal chart surfaces open focus with original authorized values", async () => {
  const [availability, downtime, overview, temporal] = await Promise.all([
    source("BiDailyAvailabilityCard.tsx"),
    source("BiDowntimeTrendCard.tsx"),
    source("BiOverviewWorkspace.tsx"),
    source("BiTemporalPatterns.tsx"),
  ]);
  for (const chart of [availability, downtime, overview]) {
    assert.match(chart, /<BiChartExplorer/);
    assert.match(chart, /<\/BiChartExplorer>/);
  }
  assert.equal((temporal.match(/<BiChartExplorer/g) ?? []).length, 2);
  assert.match(availability, /day\.scheduledMinutes > 0 \? day\.availabilityPercent : null/);
  assert.match(availability, /scheduledDowntimeMinutes/);
  assert.match(downtime, /value: day\.downtimeMinutes/);
  assert.match(overview, /overview\.machinePareto\.map/);
  assert.match(overview, /onInspectRow=\{\(row\) =>/);
  assert.match(overview, /onDrilldown\(\{/);
  assert.match(temporal, /rows=\{byHour\.map/);
  assert.match(temporal, /rows=\{byWeekday\.map/);
  assert.match(temporal, /setHeatmapOpen\(true\)/);
  assert.match(temporal, /<Dialog open=\{heatmapOpen\}/);
  assert.match(temporal, /aria-pressed=\{chosen\}/);
  assert.doesNotMatch(overview, /\.update\(|\.delete\(|\.create\(/);
});

test("PENTE1: per-chart warnings and translations preserve the metric's meaning", async () => {
  const [explorer, availability, downtime, overview, temporal, messages] = await Promise.all([
    source("BiChartExplorer.tsx"),
    source("BiDailyAvailabilityCard.tsx"),
    source("BiDowntimeTrendCard.tsx"),
    source("BiOverviewWorkspace.tsx"),
    source("BiTemporalPatterns.tsx"),
    readFile(new URL("../src/i18n/messages.ts", import.meta.url), "utf8"),
  ]);
  assert.match(explorer, /não demonstram causa ou tendência/);
  assert.match(availability, /não são zero por cento/);
  assert.match(downtime, /podem estar incompletas/);
  assert.match(overview, /Não confundir quantidade de chamados com minutos parados/);
  assert.match(temporal, /não risco horário/);
  for (const key of ["Ampliar análise do gráfico: {0}", "Tabela de dados", "Exportar dados CSV", "Menor valor observado", "Leitura ampliada do mapa de calor"]) {
    assert.ok(messages.includes(`["${key}",`), `Missing PT\/EN\/ZH-TW key: ${key}`);
  }
});
