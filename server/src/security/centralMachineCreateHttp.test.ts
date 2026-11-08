import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralMachineCreateEnabled, isCentralMachineCreateMutation,
  markCentralMachineCreateAuthorized, isAuthorizedCentralMachineCreate,
} from "./centralMachineCreateHttp.js";
import { parseCentralMachineCreateBody } from "../access/centralMachineCreate.js";

const token = "a".repeat(64);
const admin: Principal = {
  userId: "admin1", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session1",
  workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "POST", url: "/api/machines",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (run: () => unknown, code: string) =>
  assert.throws(run, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("REFINE 11 machine create is opt-in and restricted to exact POST path", () => {
  const oldCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldFlag = process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "0";
    assert.equal(centralMachineCreateEnabled(), false);
    denied(() => markCentralMachineCreateAuthorized(req(), admin, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "1";
    assert.equal(centralMachineCreateEnabled(), true);
    assert.equal(isCentralMachineCreateMutation("POST", "/api/machines"), true);
    for (const [method, path] of [
      ["PATCH", "/api/machines"], ["POST", "/api/machines/37"],
      ["POST", "/api/machines/37/status"], ["POST", "/api/technicians"],
      ["DELETE", "/api/machines"],
    ]) assert.equal(isCentralMachineCreateMutation(method, path), false);
    const approved = req();
    markCentralMachineCreateAuthorized(approved, admin, station);
    assert.equal(isAuthorizedCentralMachineCreate(approved), true);

    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...admin, roleLabel, isPrimaryAdmin: false,
        machineScope: "selected", machineIds: ["1"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      const request = req();
      markCentralMachineCreateAuthorized(request, delegate, station);
      assert.equal(isAuthorizedCentralMachineCreate(request), true);
      denied(() => markCentralMachineCreateAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "permission_denied");
      denied(() => markCentralMachineCreateAuthorized(req(), {
        ...delegate, permissions: ["andon.settings.open"],
      }, station), "permission_denied");
      denied(() => markCentralMachineCreateAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralMachineCreateAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "permission_denied");
      denied(() => markCentralMachineCreateAuthorized(req("0".repeat(64)),
        delegate, station), "csrf_denied");
    }
    process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralMachineCreate(approved), false);
  } finally {
    if (oldCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldCentral;
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = oldFlag;
  }
});

test("REFINE 11 machine catalog create accepts only safe identity and metadata", () => {
  assert.deepEqual(parseCentralMachineCreateBody({
    id: "37", name: "  Máquina 37  ", productionMode: "not_scheduled",
    requireWorkOrderAtOpen: true,
  }), {
    id: "37", name: "Máquina 37",
    productionMode: "not_scheduled", requireWorkOrderAtOpen: true,
  });
  assert.deepEqual(parseCentralMachineCreateBody({ id: "CI-NEW" }), {
    id: "CI-NEW", name: "Máquina CI-NEW",
    productionMode: "scheduled", requireWorkOrderAtOpen: false,
  });
  assert.equal(parseCentralMachineCreateBody({ id: "38", productionMode: "production" }).productionMode,
    "scheduled", "legacy production alias preserved");
  for (const payload of [
    null, [], {}, { id: "" }, { id: "bad space" }, { id: "37/status" },
    { id: "1".repeat(161) }, { id: 37 }, { id: "37", name: "" },
    { id: "37", name: "x".repeat(121) },
    { id: "37", name: "Unsafe\nName" },
    { id: "37", requireWorkOrderAtOpen: "true" },
    { id: "37", machineStatus: "stopped" },
    { id: "37", andonStatus: "normal" }, { id: "37", isActive: false },
    { id: "37", currentCallId: "x" }, { id: "37", displayOrder: 1 },
    { id: "37", priorityOrder: 1 }, { id: "37", createdBy: "admin" },
    { id: "37", productionMode: "running" },
    { id: "37", productionMode: false },
  ]) assert.throws(() => parseCentralMachineCreateBody(payload));
});
