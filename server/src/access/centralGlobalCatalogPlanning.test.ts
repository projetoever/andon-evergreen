import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { classifyCentralRouteAction } from "./centralActionRegistry.js";
import { UNMIGRATED_WRITE_ROUTES } from "./centralWriteInventory.js";

const EXPECTED = [
  ["POST", "/api/machine-set-types", "catalog.assets.manage"],
  ["PATCH", "/api/machine-set-types/:id", "catalog.assets.manage"],
  ["DELETE", "/api/machine-set-types/:id", "catalog.assets.manage"],
  ["POST", "/api/machine-subset-types", "catalog.assets.manage"],
  ["PATCH", "/api/machine-subset-types/:id", "catalog.assets.manage"],
  ["DELETE", "/api/machine-subset-types/:id", "catalog.assets.manage"],
  ["POST", "/api/andon-categories", "catalog.reasons.manage"],
  ["PATCH", "/api/andon-categories/:id", "catalog.reasons.manage"],
  ["DELETE", "/api/andon-categories/:id", "catalog.reasons.manage"],
  ["POST", "/api/failure-classifications", "catalog.classifications.manage"],
  ["PATCH", "/api/failure-classifications/:id", "catalog.classifications.manage"],
] as const;

test("SEC-04/2B.2: eleven global catalog operations are planning-only and properly separated", () => {
  assert.equal(EXPECTED.length, 11);
  for (const [method, route, permission] of EXPECTED) {
    const resolved = classifyCentralRouteAction(method, route.replace(":id", "synthetic-id"));
    assert(resolved, method + " " + route);
    assert.equal(resolved.permission, permission);
    assert.equal(resolved.scope, "module_global");
    assert.equal(resolved.module, "operational");
    assert(!UNMIGRATED_WRITE_ROUTES.some(x => x.method === method && x.route === route));
  }
  assert.equal(classifyCentralRouteAction("DELETE", "/api/failure-classifications/synthetic-id"), null);
});

test("SEC-04/2B.2: central mutations remain disabled at HTTP gate", async () => {
  const source = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(source, /!\["GET",\s*"HEAD"\]\.includes\(request\.method\)/);
  assert.match(source, /central_action_not_supported/);
});
