import assert from "node:assert/strict";
import test from "node:test";

import { canOpenWithWorkOrder, normalizeWorkOrderNumber } from "../src/utils/workOrderUtils";

test("normaliza a OS sem converter o valor em número", () => {
  assert.equal(normalizeWorkOrderNumber("  000123   A  "), "000123 A");
  assert.equal(normalizeWorkOrderNumber("OS-ABC-9"), "OS-ABC-9");
  assert.equal(normalizeWorkOrderNumber("   "), "");
});

test("bloqueia a abertura somente quando a regra está ativa e a OS está vazia", () => {
  assert.equal(canOpenWithWorkOrder(true, "   "), false);
  assert.equal(canOpenWithWorkOrder(true, "123"), true);
  assert.equal(canOpenWithWorkOrder(false, ""), true);
});
