import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  isCentralMachineSettingsMutation, centralMachineSettingsEnabled,
  markCentralMachineSettingsAuthorized, isAuthorizedCentralMachineSettings,
} from "./centralMachineSettingsHttp.js";
import { parseCentralMachineMetadataPatch } from "../access/centralMachineSettings.js";

const token = "a".repeat(64);
const admin: Principal = {
  userId: "admin-1", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "s",
  workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "PATCH", url: "/api/machines/37",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (err: unknown) => err instanceof AccessError && err.code === code);

test("R10-09 B1: feature flag OFF, route metadata only, CSRF, and role-independent grants", () => {
  const oldCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldFlag = process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(centralMachineSettingsEnabled(), false);
    denied(() => markCentralMachineSettingsAuthorized(req(), admin, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "1";
    assert.equal(centralMachineSettingsEnabled(), true);
    assert.equal(isCentralMachineSettingsMutation("PATCH", "/api/machines/37"), true);
    for (const path of [
      "/api/machines/37/status", "/api/machines/37/active",
      "/api/machines/37/production-mode", "/api/machines",
    ]) assert.equal(isCentralMachineSettingsMutation("PATCH", path), false);
    const r = req();
    markCentralMachineSettingsAuthorized(r, admin, station);
    assert.equal(isAuthorizedCentralMachineSettings(r), true);
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegated: Principal = {
        ...admin, roleLabel, isPrimaryAdmin: false, machineScope: "selected",
        machineIds: ["other"], permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralMachineSettingsAuthorized(req(), delegated, station);
      denied(() => markCentralMachineSettingsAuthorized(req(), {
        ...delegated, permissions: ["andon.read"],
      }, station), "permission_denied");
      denied(() => markCentralMachineSettingsAuthorized(req(), {
        ...delegated, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralMachineSettingsAuthorized(req("0".repeat(64)), delegated, station),
        "csrf_denied");
    }
    process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralMachineSettings(r), false);
  } finally {
    if (oldCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldCentral;
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = oldFlag;
  }
});

test("R10-09 B1: metadata body cannot alter status, priority, downtime or credentials", () => {
  assert.deepEqual(parseCentralMachineMetadataPatch({
    name: "  Máquina 37  ", requireWorkOrderAtOpen: true,
  }), { name: "Máquina 37", requireWorkOrderAtOpen: true });
  for (const body of [
    {}, null, [], { name: "" }, { name: "a".repeat(121) },
    { requireWorkOrderAtOpen: "true" }, { machineStatus: "stopped" },
    { andonStatus: "normal" }, { currentCallId: null }, { isActive: false },
    { productionMode: "not_scheduled" }, { displayOrder: 1 }, { priorityOrder: 1 },
    { id: "38" }, { name: "Malicious\nName" },
    { name: "Good", requireWorkOrderAtOpen: true, adminPasswordHash: "x" },
  ]) assert.throws(() => parseCentralMachineMetadataPatch(body));
});
