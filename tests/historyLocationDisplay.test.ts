import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("oculta somente a localização na abertura no histórico", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(history, /Localização na abertura/);
  assert.doesNotMatch(history, /openingAssetLocation/);
  assert.doesNotMatch(history, /getOpeningAssetLocationLabel/);

  assert.match(history, /Localização efetiva/);
  assert.match(history, /Localização confirmada/);
  assert.match(history, /Confirmação do ativo/);
  assert.match(history, /Confirmado por/);
  assert.match(history, /Confirmado em/);
  assert.match(history, /Justificativa da correção/);
  assert.match(history, /<CallIdLabel callId=\{call\.id\}/);
  assert.match(history, /Justificativa do cancelamento/);
  assert.match(history, /\{call\.cancelReason\}/);
});

test("preserva os dados internos da localização na abertura", async () => {
  const [types, schema, route, locationUtils] = await Promise.all([
    readFile(new URL("../src/types/andon.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/utils/assetLocationUtils.ts", import.meta.url), "utf8"),
  ]);

  for (const source of [types, schema]) {
    assert.match(source, /machineSetCodeSnapshot/);
    assert.match(source, /machineSetNameSnapshot/);
    assert.match(source, /machineSubsetCodeSnapshot/);
    assert.match(source, /machineSubsetNameSnapshot/);
  }

  assert.match(route, /const openingSetKey = assetSnapshotKey/);
  assert.match(route, /const openingSubsetKey = assetSnapshotKey/);
  assert.match(locationUtils, /export function getOpeningAssetLocation\(/);
  assert.match(locationUtils, /call\.machineSetCodeSnapshot/);
  assert.match(locationUtils, /call\.machineSubsetCodeSnapshot/);
});
