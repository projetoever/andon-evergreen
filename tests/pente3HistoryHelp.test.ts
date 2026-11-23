import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translateLabel } from "../src/i18n/translate";
const src = (file: string) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("PENTE 3-E: help distinguishes server audited export and page-only CSV", async () => {
 const [page,csv] = await Promise.all([
  src("pages/GlobalCallHistoryPage.tsx"),
  src("services/globalHistoryPageCsv.ts"),
 ]);
 assert.match(page, /<details className/);
 assert.match(page, /Como interpretar o Histórico Global e suas exportações/);
 assert.match(page, /CSV da página exporta até 25 chamados exibidos/);
 assert.match(page, /CSV filtrado consulta o servidor/);
 assert.match(page, /getAuditedGlobalHistoryExport\(requested\)/);
 assert.match(page, /payload\.maxRows !== 500/);
 assert.match(csv, /items\.length > 25/);
 assert.match(csv, /items\.length > maxRows/);
 assert.match(csv, /\[=\+\\-@\]/);
});

test("PENTE 3-E: contextual text is translated in three languages", () => {
 const keys = [
  "Como interpretar o Histórico Global e suas exportações",
  "CSV da página exporta até 25 chamados exibidos e não equivale a uma exportação auditada no servidor.",
  "CSV filtrado consulta o servidor, registra a exportação e permite até 500 chamados autorizados. Acima do limite, refine os filtros.",
 ];
 for(const key of keys)
  for(const lang of ["en", "zh-TW"] as const)
   assert.notEqual(translateLabel(lang,key),key);
});
