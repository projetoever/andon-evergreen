import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("BI-12 possui endpoint temporal read-only com filtros coerentes com overview", async () => {
  const [route, analytics, types, client] = await Promise.all([
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/analytics/temporal.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/types/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiService.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /"\/api\/analytics\/temporal"/);
  assert.match(route, /buildTemporalPatterns/);
  assert.match(route, /loadOverviewDataset\(period\.start, period\.end, effectiveEnd, filters, false\)/);
  assert.match(route, /31 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(analytics, /mergedPhysicalIntervals/);
  assert.match(analytics, /linkedCallIsSystemTest/);
  assert.match(analytics, /timeZone/);
  assert.match(analytics, /localPosition/);
  assert.match(analytics, /openedAt/);
  assert.match(types, /AnalyticsTemporalPatterns/);
  assert.match(client, /loadTemporalPatterns/);
  assert.match(client, /\/api\/analytics\/temporal/);
  assert.doesNotMatch(analytics, /prisma\..*\.(create|delete|update)\(/);
});

test("BI-12 mantém cinco áreas, com modo temporal somente dentro de Falhas", async () => {
  const [shell, workspace, chart, navigation] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiFailureWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiTemporalPatterns.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiWorkspaceTabs.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /temporalRequested/);
  assert.match(shell, /activeTab !== "failures"/);
  assert.match(shell, /loadTemporalPatterns/);
  assert.match(shell, /onTemporalSelected/);
  assert.match(shell, /h-dvh overflow-hidden/);
  assert.match(workspace, /Padrões temporais/);
  assert.match(workspace, /mode === "temporal"/);
  assert.match(workspace, /BiTemporalPatterns/);
  assert.match(chart, /Mapa de calor por dia e hora/);
  assert.match(chart, /Chamados/);
  assert.match(chart, /Tempo de parada/);
  assert.match(chart, /horários de abertura e de parada|Horários de abertura e de parada/);
  assert.match(chart, /ResponsiveContainer/);
  assert.match(chart, /aria-label=\{tip\}/);
  assert.equal((navigation.match(/id: "(overview|reliability|failures|maintenance|data-quality)"/g)??[]).length,5);
});

test("BI-12 analítico integra testes de fuso e união física no CI",async()=>{
  const src=await readFile(new URL("../server/package.json", import.meta.url), "utf8");
  const pkg=JSON.parse(src);
  assert.match(pkg.scripts["test:analytics"], /temporal\.test\.ts/);
  assert.match(pkg.scripts["test:ui"], /biTemporalPatterns\.test\.ts/);
});
