import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { AccessError } from "./policy.js";
import { runCentralFailureClassificationWrite } from "./centralFailureClassificationWrite.js";

test("SEC-04/2B.6: invalid update IDs and create ID collisions fail before any database work", () => {
  const unreachableDb = { $transaction: async () => { throw Error("database must not be called"); } } as never;
  assert.throws(
    () => runCentralFailureClassificationWrite(unreachableDb, {
      token: "a".repeat(64), workstationId: "station", operation: "update",
      classificationId: "../escape", body: { label: "new" },
    }),
    (e: unknown) => e instanceof AccessError && e.code === "invalid_action_resource",
  );
  assert.throws(
    () => runCentralFailureClassificationWrite(unreachableDb, {
      token: "a".repeat(64), workstationId: "station", operation: "create",
      classificationId: "client-chosen-id", body: { label: "new", value: "new" },
    }),
    (e: unknown) => e instanceof AccessError && e.code === "invalid_action_resource",
  );
});
test("SEC-04/2B.6: adapter gets current classification from transaction before validating updates", async () => {
  const source = await readFile(new URL("./centralFailureClassificationWrite.ts", import.meta.url), "utf8");
  assert.match(source, /runCentralGlobalCatalogTransaction\(db/);
  assert.match(source, /tx\.failureClassification\.findUnique/);
  assert.match(source, /validateCentralClassificationUpdate\(current, input\.body\)/);
  assert.match(source, /tx\.failureClassification\.update/);
  assert.match(source, /before: current, after: updated/);
  const gate = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(gate, /central_action_not_supported/);
});
