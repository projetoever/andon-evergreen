import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("S3-B4 history uses immutable opening labels and legacy fallback, never live catalog rename", async () => {
  const [route, table, types] = await Promise.all([
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/history/HistoryTable.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/types/andon.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /callReasonSnapshot:\s*\{/);
  assert.match(route, /reasonNameSnapshot: true/);
  assert.match(route, /optionNameSnapshot: true/);
  assert.match(table, /call\.callReasonSnapshot\?\.reasonNameSnapshot/);
  assert.match(table, /call\.callReasonSnapshot\?\.optionNameSnapshot/);
  assert.match(table, /getCallSubtypeLabel\(call\.subtype\)/);
  assert.match(types, /callReasonSnapshot\?:/);
  assert.doesNotMatch(table, /getCallReasonsCatalog\(/);
});
