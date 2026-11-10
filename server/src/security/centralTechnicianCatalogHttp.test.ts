import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralTechnicianCreateEnabled, isCentralTechnicianCreateMutation,
  markCentralTechnicianCreateAuthorized, isAuthorizedCentralTechnicianCreate,
} from "./centralTechnicianCatalogHttp.js";
import { parseCentralTechnicianCreateBody } from "../access/centralTechnicianCatalogCreate.js";

const token = "a".repeat(64);
const admin: Principal = {
  userId: "admin", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session",
  workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "POST", url: "/api/technicians",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (run: () => unknown, code: string) =>
  assert.throws(run, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("REFINE 11 technician creation is human-only, exact and OFF by default", () => {
  const oldCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldFlag = process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "0";
    assert.equal(centralTechnicianCreateEnabled(), false);
    denied(() => markCentralTechnicianCreateAuthorized(req(), admin, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianCreateEnabled(), true);
    assert.equal(isCentralTechnicianCreateMutation("POST", "/api/technicians"), true);
    for (const [method, path] of [
      ["PATCH", "/api/technicians"], ["POST", "/api/technicians/identify"],
      ["PATCH", "/api/technicians/1"], ["DELETE", "/api/technicians"],
      ["POST", "/api/technicians/1"],
    ]) assert.equal(isCentralTechnicianCreateMutation(method, path), false);
    const approved = req();
    markCentralTechnicianCreateAuthorized(approved, admin, station);
    assert.equal(isAuthorizedCentralTechnicianCreate(approved), true);

    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...admin, isPrimaryAdmin: false, roleLabel,
        machineScope: "selected", machineIds: ["M37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralTechnicianCreateAuthorized(req(), delegate, station);
      denied(() => markCentralTechnicianCreateAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "permission_denied");
      denied(() => markCentralTechnicianCreateAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralTechnicianCreateAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "password_change_required");
      denied(() => markCentralTechnicianCreateAuthorized(req("0".repeat(64)),
        delegate, station), "csrf_denied");
    }
    const catalogOnly: Principal = {
      ...admin, isPrimaryAdmin: false, roleLabel: "custom", machineScope: "all",
      permissions: ["andon.read", "catalog.technicians.manage"],
    };
    markCentralTechnicianCreateAuthorized(req(), catalogOnly, station);
    denied(() => markCentralTechnicianCreateAuthorized(req(), {
      ...catalogOnly, machineScope: "selected",
    }, station), "scoped_query_required");
    process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralTechnicianCreate(approved), false);
  } finally {
    if (oldCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldCentral;
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = oldFlag;
  }
});

test("REFINE 11 technician creation rejects extra fields and invalid identities", () => {
  const base = {
    name: "  Test Technician  ", employeeId: "  123  45  ",
    technicalArea: "electrical", technicalAreas: ["electrical"],
    shiftId: "shift-1", active: true, pin: "1234", tag: "abcde",
  };
  assert.deepEqual(parseCentralTechnicianCreateBody(base), {
    name: "Test Technician", employeeId: "123 45",
    technicalAreas: ["electrical"], shiftId: "shift-1",
    active: true, pin: "1234", tag: "ABCDE",
  });
  assert.equal(parseCentralTechnicianCreateBody({
    ...base, active: false, tag: "",
  }).tag, null);
  for (const input of [
    null, [], {}, { ...base, passwordHash: "unsafe" },
    { ...base, pinHash: "unsafe" }, { ...base, linkedAccessUserId: "admin" },
    { ...base, name: "" }, { ...base, name: "a".repeat(121) },
    { ...base, employeeId: "" }, { ...base, employeeId: "e".repeat(81) },
    { ...base, shiftId: "" }, { ...base, pin: "12" },
    { ...base, pin: "test-1234" }, { ...base, tag: "ab" },
    { ...base, active: "true" }, { ...base, technicalAreas: [] },
    { ...base, technicalAreas: ["electrical", "electrical"] },
    { ...base, technicalArea: "mechanical" },
    { ...base, technicalAreas: ["a".repeat(161)] },
  ]) assert.throws(() => parseCentralTechnicianCreateBody(input));
});
