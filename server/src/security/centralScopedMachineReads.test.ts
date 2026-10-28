import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import type { Principal } from "../access/policy.js";
import {
  bindAuthorizedMachineReadPrincipal,
  isScopedMachineReadRoute,
  scopedMachineReadIds,
} from "./centralScopedMachineReads.js";

const principal = (machineScope: "all" | "selected", machineIds: string[] = []): Principal => ({
  userId: "u1",
  login: "maintenance.person",
  displayName: "Maintenance person",
  roleLabel: "Manutenção",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope,
  machineIds,
  permissions: ["andon.read"],
  sessionId: "s1",
  workstationId: "w1",
  purpose: "normal",
  authenticatedAt: new Date(),
});

const mockRequest = () => ({}) as FastifyRequest;

test("only explicit machine GET routes are eligible for scoped central reads", () => {
  assert(isScopedMachineReadRoute("GET", "/api/machines"));
  assert(isScopedMachineReadRoute("GET", "/api/machines/37"));
  assert(isScopedMachineReadRoute("GET", "/api/andon-calls"));
  assert(isScopedMachineReadRoute("GET", "/api/andon-calls/history"));
  assert(isScopedMachineReadRoute("GET", "/api/dashboard-priority/order"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/filter-options"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/machine-360"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/drilldown"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/drilldown"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/drilldown"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/machine-360"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/machine-360"));
  assert(isScopedMachineReadRoute("HEAD", "/api/dashboard-priority/order"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/filter-options"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/overview"));
  assert(!isScopedMachineReadRoute("PUT", "/api/dashboard-priority/order"));
  assert(!isScopedMachineReadRoute("GET", "/api/andon-calls/details"));
  assert(!isScopedMachineReadRoute("GET", "/api/andon-calls/123"));
  assert(!isScopedMachineReadRoute("GET", "/api/machines/37/status"));
  assert(!isScopedMachineReadRoute("POST", "/api/machines"));
  assert(!isScopedMachineReadRoute("PATCH", "/api/machines/37"));
  assert(!isScopedMachineReadRoute("GET", "/api/machines/"));
  assert(isScopedMachineReadRoute("HEAD", "/api/machines"));
  assert(isScopedMachineReadRoute("HEAD", "/api/andon-calls"));
  assert(isScopedMachineReadRoute("HEAD", "/api/andon-calls/history"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/overview"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/overview"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/maintenance"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/maintenance"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/maintenance"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/reliability"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/reliability"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/reliability"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/temporal"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/temporal"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/temporal"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/data-quality-details"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/data-quality-details"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/data-quality-details"));
  assert(isScopedMachineReadRoute("GET", "/api/analytics/failure-intelligence"));
  assert(isScopedMachineReadRoute("HEAD", "/api/analytics/failure-intelligence"));
  assert(!isScopedMachineReadRoute("POST", "/api/analytics/failure-intelligence"));
});

test("central-mode scope is unavailable without an authorized server-side binding", () => {
  const before = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    assert.throws(() => scopedMachineReadIds(mockRequest()), /central_read_context_required/);
    const restricted = mockRequest();
    bindAuthorizedMachineReadPrincipal(restricted, principal("selected", ["37", "39"]));
    assert.deepEqual(scopedMachineReadIds(restricted), ["37", "39"]);
    const none = mockRequest();
    bindAuthorizedMachineReadPrincipal(none, principal("selected", []));
    assert.deepEqual(scopedMachineReadIds(none), []);
    const full = mockRequest();
    bindAuthorizedMachineReadPrincipal(full, principal("all"));
    assert.equal(scopedMachineReadIds(full), null);
    assert.throws(
      () => bindAuthorizedMachineReadPrincipal(mockRequest(), { ...principal("selected"), purpose: "password_change" }),
      /password_change_required/,
    );
  } finally {
    if (before === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = before;
  }
});

test("legacy transport never applies new selected-machine filtering", () => {
  const before = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    assert.equal(scopedMachineReadIds(mockRequest()), null);
  } finally {
    if (before === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = before;
  }
});
