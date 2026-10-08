import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminSession,
  isAdminProtectedMutation,
  readAdminSession,
  revokeAdminSession,
} from "./adminAuthorization.js";

test("protege somente mutações administrativas", () => {
  const protectedRoutes: Array<[string, string]> = [
    ["PATCH", "/api/system-settings"],
    ["PUT", "/api/dashboard-priority/credentials"],
    ["PUT", "/api/admin-auth/password"],
    ["POST", "/api/admin-auth/recovery-code"],
    ["POST", "/api/technicians"],
    ["PATCH", "/api/technicians/tech-1"],
    ["POST", "/api/andon-categories"],
    ["PATCH", "/api/andon-categories/electrical"],
    ["DELETE", "/api/andon-categories/electrical"],
    ["POST", "/api/machines"],
    ["PATCH", "/api/machines/9"],
    ["PATCH", "/api/machines/9/active"],
    ["POST", "/api/failure-classifications"],
    ["PATCH", "/api/failure-classifications/f1"],
    ["PATCH", "/api/workstations/ws_1"],
    ["POST", "/api/machine-set-types"],
    ["PATCH", "/api/machine-set-types/type-1"],
    ["DELETE", "/api/machine-set-types/type-1"],
    ["POST", "/api/machine-subset-types"],
    ["PATCH", "/api/machine-subset-types/type-2"],
    ["DELETE", "/api/machine-subset-types/type-2"],
    ["POST", "/api/machines/9/sets"],
    ["PATCH", "/api/machine-sets/set-1"],
    ["DELETE", "/api/machine-sets/set-1"],
    ["POST", "/api/machine-sets/set-1/subsets"],
    ["PATCH", "/api/machine-subsets/subset-1"],
    ["DELETE", "/api/machine-subsets/subset-1"],
  ];

  for (const [method, path] of protectedRoutes) {
    assert.equal(isAdminProtectedMutation(method, path), true, `${method} ${path}`);
  }
});

test("mantém fluxos operacionais fora do bloqueio administrativo", () => {
  const operationalRoutes: Array<[string, string]> = [
    ["GET", "/api/system-settings"],
    ["PATCH", "/api/dashboard-sound-state"],
    ["POST", "/api/technicians/identify"],
    ["GET", "/api/technicians"],
    ["GET", "/api/machines"],
    ["GET", "/api/machines/9"],
    ["PATCH", "/api/machines/9/status"],
    ["PATCH", "/api/machines/9/production-mode"],
    ["POST", "/api/andon-calls"],
    ["PATCH", "/api/andon-calls/call-1"],
    ["POST", "/api/failure-events"],
    ["PATCH", "/api/failure-events/failure-1"],
    ["POST", "/api/dashboard-priority/login"],
    ["GET", "/api/dashboard-priority/order"],
    ["PUT", "/api/dashboard-priority/order"],
    ["POST", "/api/admin-auth/login"],
    ["POST", "/api/admin-auth/recover"],
  ];

  for (const [method, path] of operationalRoutes) {
    assert.equal(isAdminProtectedMutation(method, path), false, `${method} ${path}`);
  }
});

test("sessão administrativa emitida pelo servidor pode ser validada e revogada", () => {
  const session = createAdminSession("admin");
  assert.ok(session.token);
  assert.equal(session.username, "admin");

  const request = {
    headers: { authorization: `Bearer ${session.token}` },
  } as never;

  const active = readAdminSession(request);
  assert.equal(active?.session.username, "admin");

  revokeAdminSession(session.token);
  assert.equal(readAdminSession(request), null);
});
