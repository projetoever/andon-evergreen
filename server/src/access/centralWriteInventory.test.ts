import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { CENTRAL_ROUTE_ACTIONS, classifyCentralRouteAction } from "./centralActionRegistry.js";
import { UNMIGRATED_WRITE_ROUTES } from "./centralWriteInventory.js";

/**
 * Explicit audit boundary: currently registered operational, catalog,
 * device, credential and priority route files. No runtime authorization
 * uses this scanner. Add newly registered route modules during security review.
 */
const AUDITED_ROUTE_FILES = [
  "andonCalls.ts",
  "machines.ts",
  "dashboardPriority.ts",
  "failureEvents.ts",
  "technicians.ts",
  "machineSets.ts",
  "machineSubsets.ts",
  "machineCatalogs.ts",
  "andonCategories.ts",
  "failureClassifications.ts",
  "shifts.ts",
  "systemSettings.ts",
  "visualPalette.ts",
  "workstations.ts",
  "modules.ts",
  "moduleCredentials.ts"
] as const;
const key = (method: string, route: string) => method + " " + route;
const declaration = /\bapp\.(post|put|patch|delete)(?:<[\s\S]*?>)?\s*\(\s*["'](\/api\/[^"']+)["']/g;

test("SEC-04: every declared write in the audited modules is catalogued or explicitly blocked", async () => {
  const catalog = new Set(CENTRAL_ROUTE_ACTIONS.filter((x) => x.method !== "GET").map(x => key(x.method, x.route)));
  const pending = new Map(UNMIGRATED_WRITE_ROUTES.map(x => [key(x.method, x.route), x]));
  assert.equal(pending.size, UNMIGRATED_WRITE_ROUTES.length, "duplicate pending route");
  for (const item of UNMIGRATED_WRITE_ROUTES) {
    assert(!catalog.has(key(item.method, item.route)), "pending route already catalogued: " + item.route);
    assert(item.reason.trim().length > 30, "missing migration risk rationale: " + item.route);
    // Every gap must still fail closed: the planning catalogue must return null.
    assert.equal(classifyCentralRouteAction(item.method, item.route), null);
  }
  const observed = new Map<string, string>();
  for (const file of AUDITED_ROUTE_FILES) {
    const source = await readFile(new URL("../routes/" + file, import.meta.url), "utf8");
    const routes = [...source.matchAll(declaration)].map(x => ({ method: x[1].toUpperCase(), route: x[2] }));
    assert(routes.length > 0, "audited source appears to have changed registration style: " + file);
    for (const route of routes) {
      const action = key(route.method, route.route);
      assert(!observed.has(action), "ambiguous duplicate mutation declaration: " + action);
      observed.set(action, file);
      assert(catalog.has(action) || pending.has(action), "UNINVENTORIED CENTRAL WRITE: " + action + " in " + file);
      const blocked = pending.get(action);
      if (blocked) assert.equal(blocked.source, file, "stale route owner: " + action);
    }
  }
  for (const [action, item] of pending)
    assert.equal(observed.get(action), item.source, "stale inventory route: " + action);
});

test("SEC-04: the central gate is still fail-closed for every mutation", async () => {
  const source = await readFile(new URL("../security/workstationAccess.ts", import.meta.url), "utf8");
  assert.match(source, /!\["GET",\s*"HEAD"\]\.includes\(request\.method\)/);
  assert.match(source, /central_action_not_supported/);
});
