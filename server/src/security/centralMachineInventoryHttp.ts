import type { FastifyRequest } from "fastify";
import { centralAccessEnabled } from "../access/http.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralMachineSettingsPrivilege } from "./centralMachineSettingsHttp.js";

/**
 * H2: this query exposes ONLY static machine inventory metadata.
 * Never reuse the operational GET /api/machines, which embeds live state,
 * call IDs, priority and production history.
 */
export const CENTRAL_MACHINE_INVENTORY_FLAG = "ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED";
const authorized = new WeakSet<FastifyRequest>();

export function centralMachineInventoryEnabled(): boolean {
  return centralAccessEnabled() && process.env[CENTRAL_MACHINE_INVENTORY_FLAG] === "1";
}
export function isCentralMachineInventoryRead(method: string, path: string): boolean {
  return method === "GET" && path === "/api/andon-settings/machines";
}
export function markCentralMachineInventoryAuthorized(
  request: FastifyRequest, principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineInventoryEnabled() ||
      !isCentralMachineInventoryRead(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertCentralMachineSettingsPrivilege(principal);
  authorized.add(request);
}
export function isAuthorizedCentralMachineInventory(request: FastifyRequest): boolean {
  return centralMachineInventoryEnabled() && authorized.has(request);
}
