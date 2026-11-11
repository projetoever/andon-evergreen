import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("machine-specific history cards and expanded detail show the immutable opening reason", async () => {
  const source = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url), "utf8",
  );
  assert.match(source, /function callReasonHistoryLabel\(call: AndonCall\)/);
  assert.match(source, /original\.reasonNameSnapshot/);
  assert.match(source, /original\.optionNameSnapshot/);
  assert.match(source, /getCallSubtypeLabel\(call\.subtype\)/);
  assert.equal((source.match(/\{callReasonHistoryLabel\(call\)\}/g) ?? []).length, 2);
});
