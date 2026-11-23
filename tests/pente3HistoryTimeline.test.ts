import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translateLabel } from "../src/i18n/translate";
const src = (p: string) => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");

test("PENTE 3-D: stop intervals appear as distinct real events, not summed or inferred", async () => {
  const [detail, schema] = await Promise.all([
    src("components/history/GlobalHistoryDetailSections.tsx"),
    src("services/globalHistoryService.ts"),
  ]);
  assert.match(detail, /call\.impactIntervals \|\| \[\]/);
  assert.match(detail, /id: "impact-start-" \+ interval\.id/);
  assert.match(detail, /id: "impact-end-" \+ interval\.id/);
  assert.match(detail, /if \(interval\.endedAt\)/);
  assert.match(detail, /label: ui\("Início de impacto de parada"\)/);
  assert.match(detail, /label: ui\("Fim de impacto de parada"\)/);
  assert.match(detail, /return entries[\s\S]*\.sort\(/);
  assert.match(detail, /Os intervalos podem se sobrepor/);
  assert.match(schema, /impactIntervals: GlobalHistoryImpactInterval\[\]/);
});

test("PENTE 3-D: impact timestamps translate in all languages", () => {
  for (const label of ["Início de impacto de parada", "Fim de impacto de parada"])
    for (const language of ["en", "zh-TW"] as const)
      assert.notEqual(translateLabel(language, label), label);
});
