import assert from "node:assert/strict";
import test from "node:test";
import { assertPermission, assertFullMachineScope, AccessError, type Principal } from "./policy.js";
import {
  checkCsrf,
  csrfToken,
  hashAccessPassword,
  normalizeLogin,
  temporaryPassword,
  validatePersonalPassword,
  verifyAccessPassword,
} from "./credentials.js";
import { redactAudit } from "./audit.js";
const principal: Principal = {
  userId: "a",
  login: "leader",
  displayName: "Leader",
  roleLabel: "Líder",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: "selected",
  machineIds: ["37"],
  permissions: ["calls.open"],
  sessionId: "session",
  workstationId: "ws",
  purpose: "normal",
  authenticatedAt: new Date(),
};
test("authorization denies unknown actions, missing grants and out-of-scope resources", () => {
  assert.doesNotThrow(() => assertPermission(principal, "calls.open", "37"));
  for (const check of [
    () => assertPermission(principal, "invented", "37"),
    () => assertPermission(principal, "audit.read", "37"),
    () => assertPermission(principal, "calls.open", "38"),
    () => assertPermission({ ...principal, purpose: "password_change" }, "calls.open", "37"),
    () => assertFullMachineScope(principal),
  ])
    assert.throws(check, AccessError);
});
test("secret filtering applies recursively to audit snapshots", () => {
  assert.deepEqual(
    redactAudit({
      name: "User",
      nested: { passwordHash: "bad", token: "bad", pin: "1234", state: "active" },
      credentials: "bad",
      session: [{ cookie: "bad", id: "public" }],
    }),
    { name: "User", nested: { state: "active" }, session: [{ id: "public" }] },
  );
});
test("password policy preserves spaces and accepts long passphrases", () => {
  assert.equal(normalizeLogin(" Leader.One "), "leader.one");
  assert.throws(() => normalizeLogin("bad user"));
  assert.doesNotThrow(() => validatePersonalPassword("Uma frase de acesso longa"));
  assert.throws(() => validatePersonalPassword("123456"));
  assert.throws(() => validatePersonalPassword("passwordpassword"));
  assert.match(temporaryPassword(), /^[a-f0-9]{20}$/);
});
test("CSRF proof is bound to the session secret", () => {
  const token = "a".repeat(64);
  assert.equal(checkCsrf(token, csrfToken(token)), true);
  assert.equal(checkCsrf("b".repeat(64), csrfToken(token)), false);
  assert.equal(checkCsrf(token, "broken"), false);
});
test("versioned hashes verify exact passwords and reject malformed encodings", async () => {
  const password = "  Uma frase de acesso longa  ";
  const hash = await hashAccessPassword(password);
  assert.equal(await verifyAccessPassword(password, hash), true);
  assert.equal(await verifyAccessPassword(password.trim(), hash), false);
  assert.equal(await verifyAccessPassword(password, "andon-scrypt-v1$bad$hash"), false);
});
