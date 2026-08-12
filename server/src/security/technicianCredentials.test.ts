import assert from "node:assert/strict";
import test from "node:test";

import {
  hashCredential,
  normalizeCredential,
  normalizePin,
  normalizeTag,
  verifyCredential,
} from "./technicianCredentials.js";

test("protege e valida PIN sem armazenar o valor original", async () => {
  const hash = await hashCredential("4821");
  assert.equal(hash.includes("4821"), false);
  assert.equal(await verifyCredential("4821", hash), true);
  assert.equal(await verifyCredential("4822", hash), false);
});

test("normaliza PIN e tag conforme o contrato", () => {
  assert.equal(normalizePin(" 1234 "), "1234");
  assert.equal(normalizePin("123"), null);
  assert.equal(normalizeTag(" ab-cd "), "AB-CD");
  assert.deepEqual(normalizeCredential("rfid", " tag-01 "), {
    method: "rfid",
    value: "TAG-01",
  });
});
