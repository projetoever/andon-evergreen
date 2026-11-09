import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralCategorySettingsEnabled, isCentralCategorySettingsMutation,
  markCentralCategorySettingsAuthorized, isAuthorizedCentralCategorySettings,
} from "./centralCategorySettingsHttp.js";
import {
  parseCentralCategoryCreate, parseCentralCategoryPatch,
} from "../access/centralCategorySettings.js";

const token = "d".repeat(64);
const base: Principal = {
  userId: "u", login: "u", displayName: "User", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"],
  sessionId: "session", workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (method = "POST", url = "/api/andon-categories", csrf = csrfToken(token)) => ({
  method, url, headers: {
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
  },
}) as unknown as FastifyRequest;
const denied = (run: () => unknown, code: string) =>
  assert.throws(run, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("R12-04C: category creation/edit OFF by default, DELETE always excluded", () => {
  const oldC = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldF = process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(centralCategorySettingsEnabled(), false);
    denied(() => markCentralCategorySettingsAuthorized(req(), base, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "1";
    const approved = req();
    markCentralCategorySettingsAuthorized(approved, base, station);
    assert.equal(isAuthorizedCentralCategorySettings(approved), true);
    assert.equal(isCentralCategorySettingsMutation("POST", "/api/andon-categories"), true);
    assert.equal(isCentralCategorySettingsMutation("PATCH", "/api/andon-categories/electric"), true);
    for (const [method, path] of [
      ["DELETE", "/api/andon-categories/electric"], ["POST", "/api/andon-categories/x"],
      ["PATCH", "/api/andon-categories"], ["PATCH", "/api/andon-categories/bad.dot"],
      ["PATCH", "/api/andon-categories/electric/subtype"],
    ]) assert.equal(isCentralCategorySettingsMutation(method, path), false);
    process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralCategorySettings(approved), false);
  } finally {
    if (oldC === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldC;
    if (oldF === undefined) delete process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = oldF;
  }
});

test("R12-04C: any human role with explicit ANDON settings grant, scoped globally only on these routes", () => {
  const oldC = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldF = process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...base, isPrimaryAdmin: false, machineScope: "selected", machineIds: ["M37"],
        roleLabel, permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralCategorySettingsAuthorized(req(), delegate, station);
      markCentralCategorySettingsAuthorized(
        req("PATCH", "/api/andon-categories/electric"), delegate, station);
      denied(() => markCentralCategorySettingsAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralCategorySettingsAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralCategorySettingsAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "permission_denied");
      denied(() => markCentralCategorySettingsAuthorized(
        req("POST", "/api/andon-categories", "0".repeat(64)), delegate, station),
      "csrf_denied");
    }
    const catalogOnly: Principal = {
      ...base, isPrimaryAdmin: false, roleLabel: "Customizado",
      permissions: ["andon.read", "catalog.reasons.manage"],
    };
    markCentralCategorySettingsAuthorized(req(), catalogOnly, station);
    denied(() => markCentralCategorySettingsAuthorized(req(), {
      ...catalogOnly, machineScope: "selected",
    }, station), "scoped_query_required");
  } finally {
    if (oldC === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldC;
    if (oldF === undefined) delete process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = oldF;
  }
});

test("R12-04C: strict category body, only technical area fields and valid colors", () => {
  assert.deepEqual(parseCentralCategoryCreate({
    id: "mechanical", displayName: " Mecânica ",
    categoryGroup: "maintenance", color: "#aabbcc",
  }), {
    id: "mechanical", displayName: "Mecânica",
    categoryGroup: "maintenance", color: "#AABBCC",
    active: true, displayOrder: 0,
  });
  assert.deepEqual(parseCentralCategoryPatch({
    displayName: " Processo ", active: false, displayOrder: 5,
  }), { displayName: "Processo", active: false, displayOrder: 5 });
  for (const invalid of [
    {}, null, [], { id: "m" }, { id: "a.b", displayName: "X", categoryGroup: "maintenance", color: "#AA0000" },
    { id: "x", displayName: "X", categoryGroup: "maintenance", color: "#AA0000" },
    { id: "ok", displayName: "X", categoryGroup: "quality", color: "#AA0000" },
    { id: "ok", displayName: "X", categoryGroup: "maintenance", color: "red" },
    { id: "ok", displayName: " ", categoryGroup: "maintenance", color: "#AA0000" },
    { id: "ok", displayName: "X", categoryGroup: "maintenance", color: "#AA0000", isSystemTest: true },
  ]) assert.throws(() => parseCentralCategoryCreate(invalid), AccessError);
  for (const invalid of [
    null, [], {}, { id: "fictitious" }, { color: "#000" },
    { active: "false" }, { displayOrder: -1 },
    { categoryGroup: "quality" }, { displayName: "\u0000" },
  ]) assert.throws(() => parseCentralCategoryPatch(invalid), AccessError);
});

test("R12-04C: central POST/PATCH markers remain separate from legacy admin and the DELETE route", async () => {
  const [admin, workstation, route, frontend] = await Promise.all([
    readFile(new URL("./adminAuthorization.ts", import.meta.url), "utf8"),
    readFile(new URL("./workstationAccess.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/andonCategories.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /isAuthorizedCentralCategorySettings\(request\)/);
  assert.match(workstation, /markCentralCategorySettingsAuthorized\(request, principal, workstation\)/);
  assert.match(route, /createCentralCategory\(prisma/);
  assert.match(route, /updateCentralCategory\(prisma/);
  assert.match(route, /app\.delete/);
  assert(frontend.includes('path === "/api/andon-categories"'));
});
