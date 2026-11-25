import assert from "node:assert/strict";
import test from "node:test";
import { auditCsv, auditCsvCell, auditWhere, isSafeAuditPage, MAX_AUDIT_EXPORT_ROWS } from "../routes/accessAudit.js";
import { AccessError, assertPermission, type Principal } from "./policy.js";

const principal: Principal = {
  userId: "operator-1", login: "operador", displayName: "Operador",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"], permissions: [],
  sessionId: "session-1", workstationId: "station-1", purpose: "normal",
  authenticatedAt: new Date("2026-11-25T10:00:00.000Z"),
};

test("PENTE 6: audit read/export require independent explicit grants (Admin bypass)", () => {
  assert.throws(() => assertPermission(principal, "audit.read"), AccessError);
  assert.throws(() => assertPermission(principal, "audit.export"), AccessError);
  assert.doesNotThrow(() => assertPermission({
    ...principal, permissions: ["audit.read"],
  }, "audit.read"));
  assert.throws(() => assertPermission({
    ...principal, permissions: ["audit.read"],
  }, "audit.export"), AccessError);
  assert.doesNotThrow(() => assertPermission({
    ...principal, isPrimaryAdmin: true,
  }, "audit.read"));
  assert.doesNotThrow(() => assertPermission({
    ...principal, isPrimaryAdmin: true,
  }, "audit.export"));
  assert.throws(() => assertPermission({
    ...principal, isPrimaryAdmin: true, purpose: "password_change",
  }, "audit.read"), AccessError);
});

test("PENTE 6: audit filters use validated UTC half-open day boundaries", () => {
  assert.deepEqual(auditWhere({ from: "2026-11-23", to: "2026-11-25", action: "calls" }), {
    occurredAt: {
      gte: new Date("2026-11-23T00:00:00.000Z"),
      lt: new Date("2026-11-26T00:00:00.000Z"),
    },
    action: { contains: "calls", mode: "insensitive" },
  });
  assert.throws(() => auditWhere({ from: "2026-02-30" }), /invalid_input/);
  assert.throws(() => auditWhere({ from: "2026-11-25", to: "2026-11-24" }), /invalid_input/);
});

test("PENTE 6: audit telemetry cannot store arbitrary URLs, parameters or user values", () => {
  assert.equal(isSafeAuditPage("/hub"), true);
  assert.equal(isSafeAuditPage("/hub/admin"), true);
  assert.equal(isSafeAuditPage("/machines/37/call-history"), true);
  for (const unsafe of [
    "/hub?password=secret", "/api/access/users", "/admin", "https://example.org/",
    "/machines/37/../../access", "/anything", "/hub/admin/secret",
  ]) assert.equal(isSafeAuditPage(unsafe), false, unsafe);
});

test("PENTE 6: spreadsheet-safe UTF-8 CSV with formula escaping", () => {
  assert.equal(auditCsvCell("=SUM(1,2)"), "\"'=SUM(1,2)\"");
  assert.equal(auditCsvCell("+VLOOKUP(A1)"), "\"'+VLOOKUP(A1)\"");
  assert.equal(auditCsvCell("normal"), "\"normal\"");
  assert.equal(auditCsvCell('foo"bar'), '"foo""bar"');
  const csv = auditCsv([{ occurredAt: new Date("2026-11-25T13:00:00.000Z"),
    actorLogin: "=IMPORTXML()", action: "audit.view" }]);
  assert.ok(csv.startsWith("\ufeffoccurredAt;id;actorType"));
  assert.ok(csv.includes('"2026-11-25T13:00:00.000Z"'));
  assert.ok(csv.includes('"\'=IMPORTXML()"'));
  assert.equal(MAX_AUDIT_EXPORT_ROWS, 20000);
});
