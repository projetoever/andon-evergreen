import assert from "node:assert/strict";
import test from "node:test";
import {
  CENTRAL_ROUTE_ACTIONS,
  classifyCentralRouteAction,
  validateCentralActionCatalog,
} from "./centralActionRegistry.js";

test("all classified routes have valid unique permissions or explicitly blocked requirements", () => {
  assert.deepEqual(validateCentralActionCatalog(), []);
  assert(CENTRAL_ROUTE_ACTIONS.length >= 20);
  const pending = CENTRAL_ROUTE_ACTIONS.filter((rule) => rule.permission === null);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.route, "/api/andon-calls/:id/cancel");
  assert.equal(pending[0]?.scope, "needs_call_ownership");
});

test("operational actions distinguish read, creation, maintenance and diagnostic rights", () => {
  assert.equal(classifyCentralRouteAction("GET", "/api/machines")?.permission, "andon.read");
  assert.equal(classifyCentralRouteAction("POST", "/api/andon-calls")?.permission, "calls.open");
  assert.equal(classifyCentralRouteAction("POST", "/api/andon-calls/batch")?.scope, "machine_from_body");
  assert.equal(classifyCentralRouteAction("PATCH", "/api/andon-calls/id-123/attend")?.permission, "calls.attend");
  assert.equal(classifyCentralRouteAction("PATCH", "/api/andon-calls/id-123/finish-maintenance")?.permission, "calls.finishMaintenance");
  assert.equal(classifyCentralRouteAction("PATCH", "/api/andon-calls/id-123/failure-details")?.permission, "diagnosis.edit");
  assert.equal(classifyCentralRouteAction("PATCH", "/api/andon-calls/id-123/cancel")?.permission, null);
});

test("personal workstation settings require own-station scope, not admin rights", () => {
  assert.equal(classifyCentralRouteAction("GET",
    "/api/workstations/ws_00000000-0000-4000-8000-000000000001/runtime-preferences")?.scope,
    "own_workstation");
  assert.equal(classifyCentralRouteAction("PATCH",
    "/api/workstations/ws_00000000-0000-4000-8000-000000000001/screen-lock")?.permission,
    "andon.read");
  assert.equal(classifyCentralRouteAction("PUT",
    "/api/workstations/ws_00000000-0000-4000-8000-000000000001/machine-sound/M37")?.scope,
    "own_workstation_machine");
});

test("BI requires filtered aggregates and priority edits differ from reads", () => {
  assert.equal(classifyCentralRouteAction("GET", "/api/analytics/overview?period=week")?.scope, "aggregate_filter");
  assert.equal(classifyCentralRouteAction("GET", "/api/analytics/filter-options")?.scope, "collection_filter");
  assert.equal(classifyCentralRouteAction("GET", "/api/dashboard-priority/order")?.permission, "priorities.read");
  assert.equal(classifyCentralRouteAction("PUT", "/api/dashboard-priority/order")?.permission, "priorities.write");
});

test("unknown, method-confused or admin routes never inherit a broad permission", () => {
  for (const [method, route] of [
    ["DELETE", "/api/andon-calls/id-123"],
    ["POST", "/api/analytics/overview"],
    ["POST", "/api/andon-calls/id-123/attend"],
    ["GET", "/api/andon-calls/id-123/attend"],
    ["PATCH", "/api/machines/id/status/extra"],
    ["PATCH", "/api/admin-auth/tls-status"],
    ["GET", "/api/admin-auth/tls-status"],
    ["GET", "/api/machines/"],
    ["GET", "/api/analytics/nonexistent"],
    ["POST", "/api/service-auth/token"],
  ]) {
    assert.equal(classifyCentralRouteAction(method, route), null, method + " " + route);
  }
});
