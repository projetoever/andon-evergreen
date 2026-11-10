import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralMachineSubsetSettingsEnabled, isCentralMachineSubsetSettingsMutation,
  isCentralMachineSubsetSettingsRead, markCentralMachineSubsetSettingsAuthorized,
  isAuthorizedCentralMachineSubsetSettings, authorizeCentralMachineSubsetSettingsRead,
} from "./centralMachineSubsetSettingsHttp.js";
import { parseCentralSubsetBody } from "../access/centralMachineSubsetSettings.js";

const token = "f".repeat(64);
const base: Principal = {
  userId: "u", login: "u", displayName: "User", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session",
  workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
function req(method = "POST", url = "/api/machine-sets/set_1/subsets",
  csrf = csrfToken(token)) {
  return { method, url, headers: {
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
  }} as unknown as FastifyRequest;
}
const denied = (run: () => unknown, code: string) =>
  assert.throws(run, (error: unknown) => error instanceof AccessError && error.code === code);

test("R12-04D2 subset POST/PATCH are default-off independent from set config, never DELETE", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(centralMachineSubsetSettingsEnabled(), false);
    denied(() => markCentralMachineSubsetSettingsAuthorized(req(), base, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "1";
    const approved = req();
    markCentralMachineSubsetSettingsAuthorized(approved, base, station);
    assert.equal(isAuthorizedCentralMachineSubsetSettings(approved), true);
    assert.equal(isCentralMachineSubsetSettingsMutation(
      "POST", "/api/machine-sets/set_1/subsets"), true);
    assert.equal(isCentralMachineSubsetSettingsMutation(
      "PATCH", "/api/machine-subsets/sub_1"), true);
    assert.equal(isCentralMachineSubsetSettingsRead(
      "GET", "/api/machine-sets/set_1/subsets"), true);
    assert.equal(isCentralMachineSubsetSettingsRead(
      "GET", "/api/machine-subsets/sub_1"), true);
    for (const [method, path] of [
      ["DELETE", "/api/machine-subsets/sub_1"],
      ["POST", "/api/machines/M37/sets"],
      ["PATCH", "/api/machine-sets/set_1"],
      ["PATCH", "/api/machine-subsets"],
      ["PATCH", "/api/machine-subsets/a.dot"],
    ]) assert.equal(isCentralMachineSubsetSettingsMutation(method, path), false);
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralMachineSubsetSettings(approved), false);
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = old[1];
  }
});

test("R12-04D2 any human role explicitly delegated to ANDON settings can configure global subsets", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...base, isPrimaryAdmin: false, roleLabel, machineScope: "selected",
        machineIds: ["M37"], permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralMachineSubsetSettingsAuthorized(req(), delegate, station);
      markCentralMachineSubsetSettingsAuthorized(
        req("PATCH", "/api/machine-subsets/sub_1"), delegate, station);
      authorizeCentralMachineSubsetSettingsRead(delegate, station);
      denied(() => markCentralMachineSubsetSettingsAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralMachineSubsetSettingsAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralMachineSubsetSettingsAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "password_change_required");
      denied(() => markCentralMachineSubsetSettingsAuthorized(
        req("POST", "/api/machine-sets/set_1/subsets", "0".repeat(64)),
        delegate, station), "csrf_denied");
    }
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = old[1];
  }
});

test("R12-04D2 strict body cannot forge parent, credentials or machine state", () => {
  assert.deepEqual(parseCentralSubsetBody({
    name: " Rolamento A ", typeId: "bearing", code: " Rolamento A ",
    assetTag: "EQ-001", description: null, isActive: true,
  }, "create"), {
    name: "Rolamento A", typeId: "bearing", code: "rolamento_a",
    assetTag: "EQ-001", description: null, isActive: true,
  });
  assert.deepEqual(parseCentralSubsetBody({
    description: " Updated ", manufacturer: "Maker", displayOrder: null,
  }, "update"), {
    description: "Updated", manufacturer: "Maker", displayOrder: null,
  });
  for (const invalid of [
    {}, null, [], { name: "X" }, { typeId: "bearing" },
    { name: "X", typeId: "bearing", machineSetId: "other" },
    { name: "X", typeId: "bearing", machineId: "M38" },
    { name: "X", typeId: "bearing", identityVerified: true },
    { name: "X", typeId: "bearing", type: "legacy" },
    { name: "X", typeId: "bearing", code: "%^%" },
    { name: "X", typeId: "bearing", assetTag: {} },
    { name: "X", typeId: "bearing", isActive: "true" },
    { name: "X", typeId: "bearing", displayOrder: -1 },
  ]) assert.throws(() => parseCentralSubsetBody(invalid, "create"), AccessError);
  for (const invalid of [
    {}, { machineSetId: "other" }, { manufacturer: 123 },
    { code: "%^%" }, { isActive: "false" }, { name: " " },
  ]) assert.throws(() => parseCentralSubsetBody(invalid, "update"), AccessError);
});

test("R12-04D2 central auth marker and API CSRF do not unlock legacy Admin broadly", async () => {
  const [admin, workstation, route, frontend] = await Promise.all([
    readFile(new URL("./adminAuthorization.ts", import.meta.url), "utf8"),
    readFile(new URL("./workstationAccess.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/machineSubsets.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /isAuthorizedCentralMachineSubsetSettings\(request\)/);
  assert.match(workstation, /markCentralMachineSubsetSettingsAuthorized\(request, principal, workstation\)/);
  assert.match(route, /createCentralMachineSubset\(prisma/);
  assert.match(route, /updateCentralMachineSubset\(prisma/);
  assert.match(route, /app\.delete/);
  assert(frontend.includes("machine-subsets") && frontend.includes('method === "PATCH"'));
});
