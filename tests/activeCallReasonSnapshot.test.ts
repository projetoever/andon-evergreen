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

test("active call snapshot labels remain translated in PT, EN and ZH-TW", async () => {
  const messages = await readFile(new URL("../src/i18n/messages.ts", import.meta.url), "utf8");
  for (const triple of [
    '["Motivo do chamado","Call reason","通報原因"]',
    '["Especialidade","Specialty","專業類別"]',
    '["Conclusão do atendimento técnico","Technical service completed","技術服務完成"]',
  ]) {
    assert.ok(messages.includes(triple), `Missing complete translation: ${triple}`);
  }
});
