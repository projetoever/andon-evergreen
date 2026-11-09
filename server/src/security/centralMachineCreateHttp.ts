import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralMachineSettingsPrivilege } from "./centralMachineSettingsHttp.js";

const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_MACHINE_CREATE_FLAG = "ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED";

/** Explicitly opt-in machine inventory creation, never control or activation. */
export function centralMachineCreateEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_MACHINE_CREATE_FLAG] === "1";
}
export function isCentralMachineCreateMutation(method: string, path: string) {
  return method === "POST" && path === "/api/machines";
}
export function markCentralMachineCreateAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineCreateEnabled() ||
      !isCentralMachineCreateMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  // This is an ANDON inventory setting, not a physical machine write.
  assertCentralMachineSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralMachineCreate(request: FastifyRequest) {
  return centralMachineCreateEnabled() && authorized.has(request);
}
