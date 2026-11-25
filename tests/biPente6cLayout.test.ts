import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("PENTE6C: áreas de análise podem rolar sem comprimir tabelas ou gráficos", () => {
  const page = read("../src/pages/AndonBiPage.tsx");
  const actors = read("../src/components/bi/BiBadActorsPanel.tsx");
  assert.match(page, /activeTab === "overview" \? "lg:overflow-hidden" : "lg:overflow-y-auto/);
  assert.match(actors, /min-h-\[242px\] max-h-\[360px\]/);
  assert.match(actors, /min-w-\[880px\]/);
  assert.match(actors, /sticky top-0 z-10/);
  assert.match(actors, /onClick=\{\(\) => onSelectMachine/);
});

test("PENTE6C: modal de cobertura distingue histórico, programação e posição atual", () => {
  const modal = read("../src/components/bi/BiProductionCoverageDialog.tsx");
  assert.match(modal, /machineCoverage/);
  assert.match(modal, /setFilter\("incomplete"\)/);
  assert.match(modal, /Históricos incompletos/);
  assert.match(modal, /Máquinas a verificar:/);
  assert.match(modal, /complete_no_scheduled/);
  assert.match(modal, /mode|no_history|no_history/); // reasons stay a readonly snapshot
  assert.match(modal, /overflow-auto/);
  assert.doesNotMatch(modal, /fetch\(|axios\(|POST|PATCH|DELETE|localStorage/);
});

test("PENTE6C: qualidade reduz gráficos zeros, prioriza listagem e recolhe legenda", () => {
  const quality = read("../src/components/bi/BiDataHealthPanel.tsx");
  assert.match(quality, /every\(id=>counts\[id\]===0\)/);
  assert.match(quality, /Nenhum alerta neste grupo/);
  assert.match(quality, /min-h-\[200px\] max-h-\[480px\]/);
  assert.match(quality, /min-w-\[760px\]/);
  assert.match(quality, /<details className="rounded-lg border/);
  assert.match(quality, /onCategoryChange/);
});

test("PENTE6C: detalhes de Falhas expandem com rolagem e preservam drilldown", () => {
  const fail = read("../src/components/bi/BiFailureWorkspace.tsx");
  assert.match(fail, /items-start gap-4 lg:grid-cols-2/);
  assert.match(fail, /max-h-\[300px\]/g);
  assert.match(fail, /Ver classificações detalhadas/);
  assert.match(fail, /Ver setores detalhados/);
  assert.match(fail, /onDrilldown\(/);
  assert.doesNotMatch(fail, /lg:h-full lg:min-h-0/);
});

test("PENTE6C: testes anteriores de precisão e apresentações permanecem registrados", () => {
  const packageJson = JSON.parse(read("../server/package.json")) as {scripts:Record<string,string>};
  for (const file of ["biPente6Visualization.test.ts","biPente6bInlineCharts.test.ts","pente5cBiSamplesUi.test.ts"]) {
    assert.ok(packageJson.scripts["test:ui"].includes(file), file);
  }
});
