import assert from "node:assert/strict";
import test from "node:test";
import { COMMON_REJECTED_PASSWORDS, personalPasswordHint } from "../src/services/personalPasswordHint";
import { validatePersonalPassword } from "../server/src/access/credentials";

test("R10-08: common weak passwords are refused by the server and explained without echoing secrets", () => {
  for (const password of COMMON_REJECTED_PASSWORDS) {
    assert.throws(() => validatePersonalPassword(password), /password_policy_failed/);
    const reason = personalPasswordHint(password);
    assert(reason, "a denied password should have a local explanation");
    assert(!reason!.includes(password), "never reflect the password inside a message");
  }
});

test("R10-08: distinguish predictable numeric and repeated-character passwords", () => {
  assert.match(personalPasswordHint("12345678") ?? "", /sequência numérica/);
  assert.match(personalPasswordHint("111111111") ?? "", /mesmo caractere/);
  assert.match(personalPasswordHint("aaaaaaaa") ?? "", /mesmo caractere/);
  assert.match(personalPasswordHint("abc") ?? "", /pelo menos 8/);
  assert.match(personalPasswordHint("x".repeat(129)) ?? "", /no máximo 128/);
});

test("R10-08: strong passphrases remain accepted; client hint never overrides server authority", () => {
  for (const good of ["A6@rX2p!", "Uma frase de acesso longa", "Outono na fábrica 2026!"]) {
    assert.equal(personalPasswordHint(good), null);
    assert.doesNotThrow(() => validatePersonalPassword(good));
  }
  assert.equal(personalPasswordHint(""), null, "empty input is handled by required field");
});
