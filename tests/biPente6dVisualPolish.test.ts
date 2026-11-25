import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { biChartGradientId, biChartPalette, biChartTooltipProps } from "../src/components/bi/biChartVisualTheme.ts";
import { availableBiChartModes, biParetoRows } from "../src/components/bi/biChartModePolicy.ts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("PENTE6-D: gradientes são isolados por instância; paleta define categorias", () => {
  assert.equal(biChartGradientId(":r4:", "bi-inline"), "bi-inline-r4");
  assert.notEqual(biChartGradientId(":r4:", "bi-inline"), biChartGradientId(":r4:", "bi-explorer"));
  assert.equal(new Set(biChartPalette).size, biChartPalette.length);
});

test("PENTE6-D: rosca, disco e Pareto preservam composição e nulos", () => {
  const rows = [{id:"A",label:"A",value:8},{id:"B",label:"B",value:2}];
  assert.deepEqual(availableBiChartModes(rows,"count","categorical"),["bars","pareto","donut","pie"]);
  assert.deepEqual(availableBiChartModes(rows,"percent","categorical"),["bars"]);
  assert.deepEqual(availableBiChartModes([...rows,{id:"C",label:"C",value:null}],"count","categorical"),["bars"]);
  assert.deepEqual(availableBiChartModes(rows,"minutes","temporal"),["bars","line","area"]);
  const original = JSON.stringify(rows);
  const cumulative = biParetoRows(rows);
  assert.equal(cumulative.at(-1)?.cumulativePercent,100);
  assert.equal(cumulative.reduce((sum,row)=>sum+(row.value??0),0),10);
  assert.equal(JSON.stringify(rows),original);
});

test("PENTE6-D: visualizações usam uma identidade única, sem chamadas a serviços ou mudança de API", () => {
  const theme = source("../src/components/bi/biChartVisualTheme.ts");
  for (const component of [
    "../src/components/bi/BiInlineDistributionChart.tsx",
    "../src/components/bi/BiChartAlternative.tsx",
    "../src/components/bi/BiMaintenanceStackedChart.tsx",
    "../src/components/bi/BiChartExplorer.tsx",
    "../src/components/bi/BiDailyAvailabilityCard.tsx",
    "../src/components/bi/BiDowntimeTrendCard.tsx",
    "../src/components/bi/BiTemporalPatterns.tsx",
  ]) {
    const text = source(component);
    assert.match(text, /biChartVisualTheme/, component);
    assert.match(text, /linearGradient|biChartPalette/, component);
    assert.doesNotMatch(text, /fetch\(|axios\(|\bPOST\b|\bPATCH\b|\bDELETE\b/, component);
  }
  assert.match(theme, /--popover/);
  assert.match(theme, /--muted-foreground|--border/);
});

test("PENTE6-D: modo rosca apresenta total central e cores da legenda por categoria", () => {
  const alternative = source("../src/components/bi/BiChartAlternative.tsx");
  const inline = source("../src/components/bi/BiInlineDistributionChart.tsx");
  assert.match(alternative, /mode==="donut"/);
  assert.match(alternative, /<text x="50%" y="48%"/);
  assert.match(alternative, /slices\.reduce/);
  assert.match(alternative, /paddingAngle=\{3\}/);
  assert.match(alternative, /cornerRadius=\{6\}/);
  assert.match(inline, /biChartPalette\[index%biChartPalette\.length\]/);
  assert.match(inline, /value === null \|\| !Number\.isFinite\(value\)/);
  assert.match(inline, /<LabelList/);
});

test("PENTE6-D: linhas não conectam amostras ausentes e mantém valores observados", () => {
  const alternative = source("../src/components/bi/BiChartAlternative.tsx");
  const explorer = source("../src/components/bi/BiChartExplorer.tsx");
  assert.match(alternative, /connectNulls=\{false\}/g);
  assert.match(alternative, /strokeWidth=\{3\}/);
  assert.match(explorer, /csvCell/);
  assert.match(explorer, /onInspectRow\(selected\)/);
  assert.match(explorer, /validRows\.length/);
});

test("PENTE6-D: token de cores e legenda multilíngue ligados ao BI", () => {
  const translations = source("../src/i18n/visualMessages.ts");
  assert.match(translations, /\["Categorias","Categories","分類"\]/);
  assert.match(source("../src/i18n/translate.ts"),/visualMessages/);
});

test("PENTE6-E: texto e rótulos de cada tooltip usam contraste do popover nos dois temas", () => {
  assert.equal(biChartTooltipProps.itemStyle.color, "var(--popover-foreground)");
  assert.equal(biChartTooltipProps.labelStyle.color, "var(--popover-foreground)");
  assert.equal(biChartTooltipProps.contentStyle.background, "var(--popover)");
  const css = source("../src/styles.css");
  assert.match(css, /--popover:\\s*oklch/);
  assert.match(css, /--popover-foreground:\\s*oklch/);
  const charts = [
    "BiChartAlternative", "BiChartExplorer", "BiInlineDistributionChart",
    "BiDailyAvailabilityCard", "BiDowntimeTrendCard", "BiMaintenanceStackedChart",
    "BiTemporalPatterns", "BiOverviewWorkspace",
  ];
  for (const name of charts) {
    const component = source(`../src/components/bi/${name}.tsx`);
    assert.match(component, /biChartTooltipProps/, name);
    const tooltips = component.match(/<Tooltip\\b[\\s\\S]*?\\/>/g) ?? [];
    assert.ok(tooltips.length > 0, name + " must render a chart tooltip");
    for (const tip of tooltips) {
      assert.match(tip, /\\{\\.\\.\\.biChartTooltipProps\\}/, name);
      assert.doesNotMatch(tip, /contentStyle=/, name);
    }
  }
});
