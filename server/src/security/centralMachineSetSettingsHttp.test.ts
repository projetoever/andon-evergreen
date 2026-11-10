import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralMachineSetSettingsEnabled, isCentralMachineSetSettingsMutation,
  isCentralMachineSetSettingsRead, markCentralMachineSetSettingsAuthorized,
  isAuthorizedCentralMachineSetSettings, authorizeCentralMachineSetSettingsRead,
} from "./centralMachineSetSettingsHttp.js";
import { parseCentralSetBody } from "../access/centralMachineSetSettings.js";

const token = "e".repeat(64);
const base: Principal = {
  userId: "u", login: "u", displayName: "User", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session",
  workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
function req(method = "POST", url = "/api/machines/M37/sets", csrf = csrfToken(token)) {
  return { method, url, headers: {
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
  }} as unknown as FastifyRequest;
}
const denied = (action: () => unknown, code: string) =>
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);

test("R12-04D1 machine-set create/update only under independent OFF-by-default flag", () => {
  const old = [
    process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED,
  ];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(centralMachineSetSettingsEnabled(), false);
    denied(() => markCentralMachineSetSettingsAuthorized(req(), base, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "1";
    const accepted = req();
    markCentralMachineSetSettingsAuthorized(accepted, base, station);
    assert.equal(isAuthorizedCentralMachineSetSettings(accepted), true);
    assert.equal(isCentralMachineSetSettingsMutation("POST", "/api/machines/M37/sets"), true);
    assert.equal(isCentralMachineSetSettingsMutation("PATCH", "/api/machine-sets/set_001"), true);
    assert.equal(isCentralMachineSetSettingsRead("GET", "/api/machines/M37/sets"), true);
    assert.equal(isCentralMachineSetSettingsRead("GET", "/api/machine-sets/set_001"), true);
    for (const [method, path] of [
      ["DELETE", "/api/machine-sets/set_001"], ["PATCH", "/api/machine-subsets/sub_1"],
      ["POST", "/api/machine-sets/set_001/subsets"], ["PATCH", "/api/machines/M37/status"],
      ["PATCH", "/api/machine-sets"], ["POST", "/api/machines/M37/sets/rewrite"],
      ["PATCH", "/api/machine-sets/a.dot"], ["POST", "/api/machines/a.dot/sets"],
    ]) assert.equal(isCentralMachineSetSettingsMutation(method, path), false);
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralMachineSetSettings(accepted), false);
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = old[1];
  }
});

test("R12-04D1 all human role labels with settings grant can edit only asset configuration", () => {
  const old = [
    process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED,
  ];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...base, isPrimaryAdmin: false, roleLabel,
        machineScope: "selected", machineIds: ["M37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralMachineSetSettingsAuthorized(req(), delegate, station);
      markCentralMachineSetSettingsAuthorized(
        req("PATCH", "/api/machine-sets/set_001"), delegate, station);
      authorizeCentralMachineSetSettingsRead(delegate, station);
      denied(() => markCentralMachineSetSettingsAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralMachineSetSettingsAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralMachineSetSettingsAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "password_change_required");
      denied(() => markCentralMachineSetSettingsAuthorized(
        req("POST", "/api/machines/M37/sets", "0".repeat(64)), delegate, station),
        "csrf_denied");
    }
    const catalogOnly: Principal = {
      ...base, isPrimaryAdmin: false,
      permissions: ["andon.read", "catalog.assets.manage"],
    };
    markCentralMachineSetSettingsAuthorized(req(), catalogOnly, station);
    denied(() => markCentralMachineSetSettingsAuthorized(req(), {
      ...catalogOnly, machineScope: "selected",
    }, station), "scoped_query_required");
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = old[1];
  }
});

test("R12-04D1 strict fields, type and reparenting are not permitted", () => {
  assert.deepEqual(parseCentralSetBody({
    name: " Eixo Motor ", typeId: "spindle", code: " Eixo motor ",
    description: null, isActive: true, displayOrder: 4,
  }, "create"), {
    name: "Eixo Motor", typeId: "spindle", code: "eixo_motor",
    description: null, isActive: true, displayOrder: 4,
  });
  assert.deepEqual(parseCentralSetBody({
    description: " revisão ", displayOrder: null,
  }, "update"), { description: "revisão", displayOrder: null });
  assert.deepEqual(parseCentralSetBody({
    name: " Motor A ", typeId: "spindle",
  }, "create"), { name: "Motor A", typeId: "spindle", code: "motor_a" });
  for (const invalid of [
    null, [], {}, { name: "Motor" }, { typeId: "motor" },
    { name: "X", typeId: "motor", machineId: "M38" },
    { name: "X", typeId: "motor", type: "old" },
    { name: "X", typeId: "motor", identityVerified: true },
    { name: "X", typeId: "motor", isActive: "false" },
    { name: "X", typeId: "motor", displayOrder: -1 },
    { name: "X", typeId: "motor", code: "   " },
    { name: "X", typeId: "motor", description: {} },
  ]) assert.throws(() => parseCentralSetBody(invalid, "create"), AccessError);
  for (const invalid of [
    {}, { machineId: "M39" }, { code: "%^%" }, { isActive: "false" },
    { type: "legacy" }, { displayOrder: 100000 }, { name: "" },
  ]) assert.throws(() => parseCentralSetBody(invalid, "update"), AccessError);
});

test("R12-04D1 legacy Admin bypass and CSRF apply only after authorized central marker", async () => {
  const [admin, workstation, route, frontend] = await Promise.all([
    readFile(new URL("./adminAuthorization.ts", import.meta.url), "utf8"),
    readFile(new URL("./workstationAccess.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/machineSets.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /if \(isAuthorizedCentralMachineSetSettings\(request\)\) return;/);
  assert.match(workstation, /markCentralMachineSetSettingsAuthorized\(request, principal, workstation\)/);
  assert.match(route, /createCentralMachineSet\(prisma/);
  assert.match(route, /updateCentralMachineSet\(prisma/);
  assert.match(route, /app\.delete/);
  assert(frontend.includes("machine-sets") && frontend.includes('method === "PATCH"'));
});
