import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("SEC-04/2B.3: central global catalog transaction preserves security order and audit", async () => {
  const source = await readFile(new URL("./centralGlobalCatalogTransaction.ts", import.meta.url), "utf8");
  const steps = [
    "tokenHash(input.token)", "lockUser(tx, session.userId)",
    "lockWorkstationFlow(tx, input.workstationId)",
    "pg_advisory_xact_lock", "resolveSession(tx, request)",
    "const action = preflightCentralGlobalCatalogWrite", "applyReviewedDomainMutation(tx)",
    "appendAudit(tx",
  ];
  let last = -1;
  for (const step of steps) {
    const position = source.indexOf(step);
    assert(position > last, "missing or incorrectly ordered secure step: " + step);
    last = position;
  }
  assert(source.includes("return db.$transaction(async (tx) =>"));
  assert(source.indexOf("appendAudit(tx") < source.indexOf("return result.value"));
});
test("SEC-04/2B.3: the live central HTTP write gate remains closed", async () => {
  const source = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(source, /central_action_not_supported/);
  assert.match(source, /!\["GET",\s*"HEAD"\]\.includes\(request\.method\)/);
});
