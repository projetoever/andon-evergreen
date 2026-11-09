import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralMachineSetSettingsPrivilege } from "./centralMachineSetSettingsHttp.js";

// R12-04E / #368: add and edit type catalog metadata only. Do not enable
// the legacy DELETE behavior or change any physical machine/call permission.
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_ASSET_TYPE_CATALOG_FLAG = "ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED";

export function centralAssetTypeCatalogEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_ASSET_TYPE_CATALOG_FLAG] === "1";
}

const ID = "[A-Za-z0-9_-]{1,160}";
const COLLECTIONS = new Set(["/api/machine-set-types", "/api/machine-subset-types"]);

export function centralAssetTypeCatalogTarget(method: string, path: string):
  { kind: "set" | "subset"; typeId?: string } | null {
  if (method === "POST" && COLLECTIONS.has(path))
    return { kind: path === "/api/machine-set-types" ? "set" : "subset" };
  if (method !== "PATCH") return null;
  const match = new RegExp("^/api/(machine-set-types|machine-subset-types)/(" + ID + ")$").exec(path);
  return match ? {
    kind: match[1] === "machine-set-types" ? "set" : "subset",
    typeId: match[2],
  } : null;
}

export function isCentralAssetTypeCatalogMutation(method: string, path: string) {
  return centralAssetTypeCatalogTarget(method, path) !== null;
}
export function isCentralAssetTypeCatalogRead(method: string, path: string) {
  return method === "GET" && COLLECTIONS.has(path);
}

export function markCentralAssetTypeCatalogAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralAssetTypeCatalogEnabled() ||
      !isCentralAssetTypeCatalogMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSetSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralAssetTypeCatalog(request: FastifyRequest) {
  return centralAssetTypeCatalogEnabled() && authorized.has(request);
}
