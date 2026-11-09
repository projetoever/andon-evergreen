import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralShiftUpdateEnabled, isCentralShiftUpdateMutation,
  markCentralShiftUpdateAuthorized, isAuthorizedCentralShiftUpdate,
} from "./centralShiftSettingsHttp.js";
import { parseCentralShiftPatch } from "../access/centralShiftSettingsUpdate.js";

const token = "a".repeat(64);
const base: Principal = {
  userId: "u", login: "u", displayName: "U", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"],
  sessionId: "sess", workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "PATCH", url: "/api/shifts/morning",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (action: () => unknown, code: string) =>
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);

test("R12-04B: Shift settings are OFF by default and only PATCH exact shift ID", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED, process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "0";
    assert.equal(centralShiftUpdateEnabled(), false);
    denied(() => markCentralShiftUpdateAuthorized(req(), base, station), "central_action_not_supported");
    process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "1";
    const allowed = req();
    markCentralShiftUpdateAuthorized(allowed, base, station);
    assert.equal(isAuthorizedCentralShiftUpdate(allowed), true);
    assert.equal(isCentralShiftUpdateMutation("PATCH", "/api/shifts/morning"), true);
    for (const [method, path] of [
      ["POST", "/api/shifts/morning"], ["PATCH", "/api/shifts"],
      ["DELETE", "/api/shifts/morning"], ["PATCH", "/api/shifts/morning/end"],
      ["PATCH", "/api/shifts/bad.dot"],
    ]) assert.equal(isCentralShiftUpdateMutation(method, path), false);
    process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralShiftUpdate(allowed), false);
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = old[1];
  }
});

test("R12-04B: any explicitly delegated HUMAN role can edit global shift, not service/kiosk or arbitrary schedule user", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED, process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const actor: Principal = { ...base, isPrimaryAdmin: false,
        roleLabel, machineScope: "selected", machineIds: ["M37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralShiftUpdateAuthorized(req(), actor, station);
      denied(() => markCentralShiftUpdateAuthorized(req(), {
        ...actor, permissions: ["andon.read", "production.schedule.write"],
      }, station), "permission_denied");
      denied(() => markCentralShiftUpdateAuthorized(req(), {
        ...actor, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralShiftUpdateAuthorized(req("0".repeat(64)),
        actor, station), "csrf_denied");
    }
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = old[1];
  }
});

test("R12-04B: only shift display, schedule and active are allowed, overnight remains valid", () => {
  assert.deepEqual(parseCentralShiftPatch({
    name: " Noite ", startTime: "22:00", endTime: "06:00", active: true,
  }), { name: "Noite", startTime: "22:00", endTime: "06:00", active: true });
  for (const invalid of [
    null, [], {}, { id: "new" }, { machineId: "M37" },
    { startTime: "25:00" }, { endTime: "00:60" },
    { active: "false" }, { name: " " }, { password: "hello" },
  ]) denied(() => parseCentralShiftPatch(invalid), "invalid_input");
});

test("R12-04B: legacy admin bypass is restricted to central marked shifts", async () => {
  const [admin, workstation, route, client] = await Promise.all([
    readFile(new URL("./adminAuthorization.ts", import.meta.url), "utf8"),
    readFile(new URL("./workstationAccess.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/shifts.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /if \(isAuthorizedCentralShiftUpdate\(request\)\) return;/);
  assert.match(workstation, /markCentralShiftUpdateAuthorized\(request, principal, workstation\)/);
  assert.match(route, /isAuthorizedCentralShiftUpdate\(request\)/);
  assert(client.includes("shifts") && client.includes('method === "PATCH"'));
});
