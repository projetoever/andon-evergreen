import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("active call panel shows immutable original reason/specialty without re-reading editable catalog", async () => {
  const [panel, type] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/types/andon.ts", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /call\.callReasonSnapshot\?\.reasonNameSnapshot/);
  assert.match(panel, /call\.callReasonSnapshot\?\.optionNameSnapshot/);
  assert.match(panel, /call\.category === "maintenance" \? t\("Manutenção"\) : t\("Produção"\)/);
  assert.match(panel, /getCallSubtypeLabel\(call\.subtype\)/);
  assert.match(panel, /call\.callReasonSnapshot\?\.nature === "planned_setup"/);
  assert.match(panel, /call\.callReasonSnapshot\?\.nature === "production_support"/);
  assert.doesNotMatch(panel, /getCallReasonsCatalog\(/);
  assert.match(type, /callReasonSnapshot\?:/);
});
