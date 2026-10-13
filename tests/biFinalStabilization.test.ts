import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("BI-13: refresh and filter changes clear previous-period dashboard and modal data", async () => {
  const source = await readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8");
  const loading = source.slice(source.indexOf("const loadOverview = useCallback"), source.indexOf("useEffect(() => loadOverview()"));
  assert.match(loading, /setLoading\(true\);/);
  assert.match(loading, /setOverview\(null\);/);
  assert.match(loading, /setMachineSelection\(null\);/);
  assert.match(loading, /setDrillSelection\(null\);/);
  assert.match(loading, /setQualityDetails\(null\);/);
  assert.ok(loading.indexOf("setOverview(null)") < loading.indexOf("loadExecutiveOverview(filters)"));
  assert.match(source, /disabled=\{loading\}/);
  assert.match(source, /Atualizando…/);
});

test("BI-13: hour-of-day peak respects tied hours and long continuous physical stops", async () => {
  const [analytics, ui, types, regression] = await Promise.all([
    readFile(new URL("../server/src/analytics/temporal.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiTemporalPatterns.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/types/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/analytics/temporal.test.ts", import.meta.url), "utf8"),
  ]);
  assert.match(analytics, /peakCallHours\.length === 1/);
  assert.match(analytics, /peakPhysicalHours\.length === 1/);
  assert.match(types, /peakPhysicalHours: number\[\]/);
  assert.match(ui, /Empate/);
  assert.match(ui, /horários empatados/);
  assert.match(regression, /picos empatados não inventam um horário mais crítico/);
});

test("BI-13: modal pagination is measured after switching views and Escape remains available", async () => {
  const overlay = await readFile(new URL("../src/components/bi/BiMachine360Overlay.tsx", import.meta.url), "utf8");
  assert.match(overlay, /observer\.observe\(viewport\)/);
  assert.match(overlay, /\[data, activeView\]/);
  assert.match(overlay, /event\.key !== "Escape"/);
  assert.match(overlay, /onClose\(\)/);
});

test("BI-13: PDF hidden iframe does not remain after cancelled or failed print", async () => {
  const report = await readFile(new URL("../src/services/andonBiPdfReport.ts", import.meta.url), "utf8");
  assert.match(report, /inner\.addEventListener\("afterprint", dispose/);
  assert.match(report, /cleanupTimer = window\.setTimeout\(dispose, 120_000\)/);
  assert.match(report, /window\.clearTimeout\(cleanupTimer\)/);
  assert.match(report, /\.catch\(dispose\)/);
  assert.match(report, /frame\.onload = null/);
});

test("BI-13: stabilization stays within current five-tab UI and does not change write operations", async () => {
  const [page, tabs, uiScript] = await Promise.all([
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiWorkspaceTabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /h-dvh overflow-hidden/);
  assert.equal((tabs.match(/id: "(overview|reliability|failures|maintenance|data-quality)"/g) ?? []).length, 5);
  assert.match(JSON.parse(uiScript).scripts["test:ui"], /biFinalStabilization\.test\.ts/);
});

test("BI-13: não apresenta duração final de zero para chamados ainda ativos", async () => {
  const [route, drill] = await Promise.all([
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiAnalyticsDrillDown.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /durationMinutes: call\.finishedAt/);
  assert.match(drill, /item\.kind === "call" && !item\.endedAt/);
  assert.match(drill, /Em aberto/);
  assert.match(drill, /duração final consolidada/);
});
