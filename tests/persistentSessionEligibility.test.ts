import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PERSISTENT_OPERATIONAL_ALLOWED_KEYS, persistentSessionIncompatibleGrants, suggestedPersistentProductionGrants } from "../src/services/persistentSessionEligibility";

test("SEC-18: advisory allowlist contains exactly the server persistent grants", async () => {
  const source = await readFile(new URL("../server/src/access/sessions.ts", import.meta.url), "utf8");
  const match = source.match(/const TRUSTED_OPERATIONAL_GRANTS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(match, "server allowlist remains visible for strict comparison");
  const keys = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort();
  assert.deepEqual([...PERSISTENT_OPERATIONAL_ALLOWED_KEYS].sort(), keys);
});

test("SEC-18: restricted production preset is explicit, safe and catalog-bounded", () => {
  const full = [...PERSISTENT_OPERATIONAL_ALLOWED_KEYS, "users.create", "workstations.screen.unlock"];
  const suggested = suggestedPersistentProductionGrants(full);
  assert.deepEqual(suggested, ["andon.read", "history.read", "calls.open", "calls.cancel.own"]);
  assert.deepEqual(persistentSessionIncompatibleGrants(suggested), []);
  assert.deepEqual(persistentSessionIncompatibleGrants([...suggested, "users.create", "diagnosis.edit"]), ["users.create", "diagnosis.edit"]);
  assert.deepEqual(suggestedPersistentProductionGrants(["calls.open"]), ["calls.open"]);
});
