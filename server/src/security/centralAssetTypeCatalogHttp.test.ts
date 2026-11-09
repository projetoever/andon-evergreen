import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralAssetTypeCatalogEnabled, centralAssetTypeCatalogTarget,
  isCentralAssetTypeCatalogMutation, isCentralAssetTypeCatalogRead,
  markCentralAssetTypeCatalogAuthorized, isAuthorizedCentralAssetTypeCatalog,
} from "./centralAssetTypeCatalogHttp.js";
import { parseCentralAssetTypePatch } from "../access/centralAssetTypeCatalog.js";

const token = "7".repeat(64);
const base: Principal = {
  userId: "u", login: "u", displayName: "User", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "session",
  workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
function req(method = "POST", url = "/api/machine-set-types", csrf = csrfToken(token)) {
  return { method, url, headers: {
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
  }} as unknown as FastifyRequest;
}
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (error: unknown) => error instanceof AccessError && error.code === code);

test("R12-04E: both type catalogs OFF by default, DELETE and arbitrary routes still denied", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "0";
    assert.equal(centralAssetTypeCatalogEnabled(), false);
    denied(() => markCentralAssetTypeCatalogAuthorized(req(), base, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "1";
    const approved = req();
    markCentralAssetTypeCatalogAuthorized(approved, base, station);
    assert.equal(isAuthorizedCentralAssetTypeCatalog(approved), true);
    assert.deepEqual(centralAssetTypeCatalogTarget("PATCH", "/api/machine-subset-types/abc-01"), {
      kind: "subset", typeId: "abc-01",
    });
    for (const path of ["/api/machine-set-types", "/api/machine-subset-types"]) {
      assert.equal(isCentralAssetTypeCatalogMutation("POST", path), true);
      assert.equal(isCentralAssetTypeCatalogRead("GET", path), true);
      assert.equal(isCentralAssetTypeCatalogMutation("DELETE", path + "/abc"), false);
      assert.equal(isCentralAssetTypeCatalogMutation("PATCH", path + "/abc"), true);
    }
    for (const [method, path] of [
      ["POST", "/api/machine-sets"],
      ["PATCH", "/api/machine-sets/abc"],
      ["PATCH", "/api/machine-subsets/abc"],
      ["PUT", "/api/machine-set-types/abc"],
      ["POST", "/api/machine-set-types/abc"],
      ["PATCH", "/api/machine-subset-types/a.dot"],
      ["PATCH", "/api/machine-set-types/abc/extra"],
    ]) assert.equal(isCentralAssetTypeCatalogMutation(method, path), false);
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralAssetTypeCatalog(approved), false);
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = old[1];
  }
});

test("R12-04E: any human profile with andon.settings.open, but no kiosk or role-based escalation", () => {
  const old = [process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED];
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gerente", "Customizado"]) {
      const delegate: Principal = {
        ...base, isPrimaryAdmin: false, roleLabel,
        machineScope: "selected", machineIds: ["M37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      markCentralAssetTypeCatalogAuthorized(req(), delegate, station);
      markCentralAssetTypeCatalogAuthorized(
        req("PATCH", "/api/machine-subset-types/abc"), delegate, station);
      denied(() => markCentralAssetTypeCatalogAuthorized(req(), {
        ...delegate, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralAssetTypeCatalogAuthorized(req(), {
        ...delegate, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralAssetTypeCatalogAuthorized(req(), {
        ...delegate, purpose: "password_change",
      }, station), "password_change_required");
      denied(() => markCentralAssetTypeCatalogAuthorized(
        req("POST", "/api/machine-set-types", "0".repeat(64)), delegate, station),
      "csrf_denied");
    }
    markCentralAssetTypeCatalogAuthorized(req(), {
      ...base, isPrimaryAdmin: false,
      permissions: ["andon.read", "catalog.assets.manage"],
    }, station);
  } finally {
    if (old[0] === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = old[0];
    if (old[1] === undefined) delete process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = old[1];
  }
});

test("R12-04E: legacy type fields only, no IDs, secrets or physical machine changes", () => {
  assert.deepEqual(parseCentralAssetTypePatch({
    name: " Sistema Elétrico ", code: " Sistema elétrico ",
    description: " Cadastro ", isActive: true, displayOrder: 3,
  }, "create"), {
    name: "Sistema Elétrico", code: "sistema_eletrico",
    description: "Cadastro", isActive: true, displayOrder: 3,
  });
  assert.deepEqual(parseCentralAssetTypePatch({ name: "Motor A" }, "create"),
    { name: "Motor A", code: "motor_a" });
  assert.deepEqual(parseCentralAssetTypePatch({ description: null, displayOrder: 4 }, "update"),
    { description: null, displayOrder: 4 });
  for (const invalid of [
    null, [], {}, { code: "electric" }, { name: " " },
    { name: "X", id: "user-id" }, { name: "X", machineId: "M37" },
    { name: "X", categoryGroup: "maintenance" },
    { name: "X", pinHash: "bad" }, { name: "X", code: "!!" },
    { name: "X", isActive: "true" }, { name: "X", displayOrder: -1 },
    { name: "X", description: [] },
  ]) assert.throws(() => parseCentralAssetTypePatch(invalid, "create"), AccessError);
  for (const invalid of [
    null, [], {}, { code: "%^%" }, { isActive: "false" },
    { displayOrder: null }, { name: "" }, { parentId: "x" },
  ]) assert.throws(() => parseCentralAssetTypePatch(invalid, "update"), AccessError);
});

test("R12-04E: existing type panel routes use central audit adapters only for POST/PATCH", async () => {
  const [admin, workstation, route, frontend] = await Promise.all([
    readFile(new URL("./adminAuthorization.ts", import.meta.url), "utf8"),
    readFile(new URL("./workstationAccess.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/machineCatalogs.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../src/api/andonApiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /isAuthorizedCentralAssetTypeCatalog\(request\)/);
  assert.match(workstation, /markCentralAssetTypeCatalogAuthorized\(request, principal, workstation\)/);
  assert.match(route, /createCentralAssetType\(prisma/);
  assert.match(route, /updateCentralAssetType\(prisma/);
  assert.match(route, /app\.delete/);
  assert(frontend.includes('path === "/api/machine-set-types"'));
  assert(frontend.includes("machine-(?:set|subset)-types"));
});
