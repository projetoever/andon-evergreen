import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralOperationalSettingsPrivilege } from "./centralOperationalSettingsHttp.js";

/** UX-12 writes are independently gated: default OFF, no generic settings ACL. */
export const CENTRAL_VISUAL_PALETTE_FLAG = "ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED";
const authorized = new WeakSet<FastifyRequest>();

export function centralVisualPaletteWritesEnabled(): boolean {
  return centralAccessEnabled() && process.env[CENTRAL_VISUAL_PALETTE_FLAG] === "1";
}
export function isCentralVisualPaletteMutation(method: string, path: string): boolean {
  return method === "PATCH" && path === "/api/andon-visual-palette";
}

export function markCentralVisualPaletteAuthorized(
  request: FastifyRequest,
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralVisualPaletteWritesEnabled() ||
      !isCentralVisualPaletteMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralOperationalSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralVisualPalette(request: FastifyRequest): boolean {
  return centralVisualPaletteWritesEnabled() && authorized.has(request);
}
