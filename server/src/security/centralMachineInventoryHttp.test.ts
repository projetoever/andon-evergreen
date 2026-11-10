import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { FastifyRequest } from "fastify";
import { AccessError, type Principal } from "../access/policy.js";
import { parseCentralMachineInventoryQuery } from "../access/centralMachineInventory.js";
import {
  centralMachineInventoryEnabled, isCentralMachineInventoryRead,
  isAuthorizedCentralMachineInventory, markCentralMachineInventoryAuthorized,
} from "./centralMachineInventoryHttp.js";

const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const delegated: Principal = {
  userId: "person-1", login: "production", displayName: "Production",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"], permissions: [
    "andon.read", "andon.settings.open",
  ], sessionId: "s1", workstationId: "ws",
  purpose: "normal", authenticatedAt: new Date(),
};
const req = (method = "GET", url = "/api/andon-settings/machines") =>
  ({ method, url }) as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);
const withFlags = (fn: () => void) => {
  const original = [process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED];
  try { fn(); } finally {
    for (const [i, name] of ["ANDON_CENTRAL_ACCESS_ENABLED",
      "ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED"].entries()) {
      const value = original[i];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test("R12-04H2: inventory GET-only, separate flag OFF and no privileged aliases", () => withFlags(() => {
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "0";
  assert.equal(centralMachineInventoryEnabled(), false);
  denied(() => markCentralMachineInventoryAuthorized(req(), delegated, station),
    "central_action_not_supported");
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "1";
  assert.equal(isCentralMachineInventoryRead("GET", "/api/andon-settings/machines"), true);
  for (const [method, path] of [
    ["HEAD", "/api/andon-settings/machines"],
    ["POST", "/api/andon-settings/machines"],
    ["PATCH", "/api/andon-settings/machines"],
    ["GET", "/api/machines"], ["GET", "/api/machines/37"],
    ["GET", "/api/andon-settings/machines/37"],
    ["GET", "/api/andon-settings/machines?limit=1"],
  ]) assert.equal(isCentralMachineInventoryRead(method, path), false);
  const r = req();
  markCentralMachineInventoryAuthorized(r, delegated, station);
  assert.equal(isAuthorizedCentralMachineInventory(r), true);
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "0";
  assert.equal(isAuthorizedCentralMachineInventory(r), false);
}));

test("R12-04H2: role-agnostic grants never enable operational or kiosk reads", () => withFlags(() => {
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "1";
  for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"])
    markCentralMachineInventoryAuthorized(req(), { ...delegated, roleLabel }, station);
  denied(() => markCentralMachineInventoryAuthorized(req(), {
    ...delegated, permissions: ["andon.read"],
  }, station), "permission_denied");
  denied(() => markCentralMachineInventoryAuthorized(req(), {
    ...delegated, permissions: ["andon.settings.open"],
  }, station), "permission_denied");
  denied(() => markCentralMachineInventoryAuthorized(req(), {
    ...delegated, accountType: "kiosk",
  }, station), "permission_denied");
  denied(() => markCentralMachineInventoryAuthorized(req(), {
    ...delegated, purpose: "password_change",
  }, station), "password_change_required");
  markCentralMachineInventoryAuthorized(req(), {
    ...delegated, isPrimaryAdmin: true, machineScope: "all",
    permissions: ["andon.read"],
  }, station);
  denied(() => markCentralMachineInventoryAuthorized(req(), {
    ...delegated, isPrimaryAdmin: true, machineScope: "selected",
  }, station), "scoped_query_required");
}));

test("R12-04H2: strict pagination, no arbitrary filters that can reveal operations", () => {
  assert.deepEqual(parseCentralMachineInventoryQuery({}),
    { cursor: undefined, limit: 100 });
  assert.deepEqual(parseCentralMachineInventoryQuery({ cursor: "M37", limit: "200" }),
    { cursor: "M37", limit: 200 });
  for (const value of [
    null, [], "", { limit: "0" }, { limit: "201" }, { limit: "NaN" },
    { limit: 50 }, { limit: "-1" }, { cursor: "." }, { cursor: "../calls" },
    { cursor: ["M37"] }, { includeCalls: true }, { includeInactive: true },
    { fields: "productionEvents" }, { cursor: "M37", limit: "10", status: "running" },
  ]) assert.throws(() => parseCentralMachineInventoryQuery(value), AccessError);
});

test("R12-04H2: code never copies operational machineSelect into inventory", async () => {
  const [read, route, UI, service] = await Promise.all([
    readFile(new URL("../access/centralMachineInventory.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/machines.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/components/settings/MachineConfigurationInventoryCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../src/services/machineConfigurationInventoryService.ts", import.meta.url), "utf8"),
  ]);
  assert.match(read, /id: true, name: true/);
  assert.match(read, /requireWorkOrderAtOpen: true, isActive: true/);
  assert.doesNotMatch(read, /currentCallId|productionEvents|failureEvents|priorityOrder|machineStatus|andonStatus/);
  assert.match(route, /readCentralMachineInventory\(prisma/);
  assert.match(route, /if \(!result\.canReadOperational\)/);
  assert.match(UI, /MachineConfigurationInventoryItem/);
  assert.doesNotMatch(UI, /currentCallId|productionEvents|priorityOrder|machineStatus/);
  assert.match(service, /\/api\/andon-settings\/machines/);
  assert.doesNotMatch(service, /client\.get[^;]*\/api\/machines/);
});
