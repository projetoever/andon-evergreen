import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralTechnicianUpdateEnabled, isCentralTechnicianUpdateMutation,
  markCentralTechnicianUpdateAuthorized, isAuthorizedCentralTechnicianUpdate,
} from "./centralTechnicianCatalogUpdateHttp.js";
import { parseCentralTechnicianUpdateBody } from "../access/centralTechnicianCatalogUpdate.js";

const secret = "f".repeat(64);
const workstationId = "ws_00000000-0000-4000-8000-000000000001";
const base: Principal = {
  userId: "admin", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session",
  workstationId, purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const request = (csrf = csrfToken(secret)) => ({
  method: "PATCH", url: "/api/technicians/tech_123",
  headers: { cookie: "__Host-andon-access=" + secret, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (action: () => unknown, code: string) =>
  assert.throws(action, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("R12-04A: central technician PATCH is OFF by default, exact path only", () => {
  const oldCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldUpdate = process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "0";
    assert.equal(centralTechnicianUpdateEnabled(), false);
    denied(() => markCentralTechnicianUpdateAuthorized(request(), base, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianUpdateEnabled(), true);
    assert.equal(isCentralTechnicianUpdateMutation("PATCH", "/api/technicians/tech_123"), true);
    for (const [method, path] of [
      ["POST", "/api/technicians/tech_123"], ["PATCH", "/api/technicians"],
      ["PATCH", "/api/technicians/tech_123/pin"], ["PATCH", "/api/technicians/a.b"],
      ["DELETE", "/api/technicians/tech_123"],
    ]) assert.equal(isCentralTechnicianUpdateMutation(method, path), false);
    const approved = request();
    markCentralTechnicianUpdateAuthorized(approved, base, station);
    assert.equal(isAuthorizedCentralTechnicianUpdate(approved), true);
    process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralTechnicianUpdate(approved), false);
  } finally {
    if (oldCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldCentral;
    if (oldUpdate === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = oldUpdate;
  }
});

test("R12-04A: ALL human roles with explicit andon.settings.open edit global catalog; no Hub/BI grants", () => {
  const oldCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldUpdate = process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const actor: Principal = {
        ...base, userId: "delegate", login: "delegate", roleLabel,
        isPrimaryAdmin: false, machineScope: "selected", machineIds: ["M37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralTechnicianUpdateAuthorized(request(), actor, station);
      denied(() => markCentralTechnicianUpdateAuthorized(request(), {
        ...actor, permissions: ["andon.read"],
      }, station), "permission_denied");
      denied(() => markCentralTechnicianUpdateAuthorized(request(), {
        ...actor, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralTechnicianUpdateAuthorized(request("0".repeat(64)),
        actor, station), "csrf_denied");
    }
    markCentralTechnicianUpdateAuthorized(request(), {
      ...base, isPrimaryAdmin: false, roleLabel: "Customizado",
      permissions: ["andon.read", "catalog.technicians.manage"],
    }, station);
    denied(() => markCentralTechnicianUpdateAuthorized(request(), {
      ...base, isPrimaryAdmin: false, permissions: ["andon.read", "catalog.technicians.manage"],
      machineScope: "selected",
    }, station), "scoped_query_required");
  } finally {
    if (oldCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldCentral;
    if (oldUpdate === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = oldUpdate;
  }
});

test("R12-04A: allowlist, credential edit and technical-area validation", () => {
  assert.deepEqual(parseCentralTechnicianUpdateBody({
    name: " Test Mechanic ", employeeId: " EMP  0008 ",
    technicalArea: "mechanical", technicalAreas: ["mechanical"],
    active: false, pin: "1234", tag: "",
  }), {
    name: "Test Mechanic", employeeId: "EMP 0008",
    technicalAreas: ["mechanical"], active: false, pin: "1234", tag: null,
  });
  for (const invalid of [
    {}, null, [], { id: "other" }, { pinHash: "fake" }, { identityVerified: true },
    { machineId: "M37" }, { active: "false" }, { name: " " },
    { pin: "123" }, { tag: "a" }, { technicalAreas: [] },
    { technicalArea: "mechanical", technicalAreas: ["electrical"] },
    { technicalAreas: ["mechanical", "MECHANICAL"] },
    { name: "new\u0000name" },
  ]) denied(() => parseCentralTechnicianUpdateBody(invalid),
    invalid && typeof invalid === "object" &&
      ("technicalAreas" in invalid || "technicalArea" in invalid)
      ? "invalid_technical_areas"
      : invalid && typeof invalid === "object" && ("pin" in invalid || "tag" in invalid)
        ? "invalid_technician_credential"
        : "invalid_input");
});
