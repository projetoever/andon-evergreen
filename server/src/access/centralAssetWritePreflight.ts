import type { Prisma } from "@prisma/client";
import { classifyCentralRouteAction } from "./centralActionRegistry.js";
import {
  AccessError, assertModule, assertPermission, type Principal,
} from "./policy.js";

export type AssetWriteOperation =
  | "set.create" | "set.update" | "set.delete"
  | "subset.create" | "subset.update" | "subset.delete";

export type CentralAssetWritePreflightInput = {
  tx: Pick<Prisma.TransactionClient, "machine" | "machineSet" | "machineSubset">;
  principal: Principal;
  workstation: {
    id: string; active: boolean; pendingApproval?: boolean;
    allowOperational: boolean; allowBi: boolean; allowPriorities: boolean;
  };
  request: { method: string; path: string; body?: unknown };
};

const ASSET_ACTIONS = {
  "POST /api/machines/:machineId/sets": "set.create",
  "PATCH /api/machine-sets/:id": "set.update",
  "DELETE /api/machine-sets/:id": "set.delete",
  "POST /api/machine-sets/:machineSetId/subsets": "subset.create",
  "PATCH /api/machine-subsets/:id": "subset.update",
  "DELETE /api/machine-subsets/:id": "subset.delete",
} as const satisfies Record<string, AssetWriteOperation>;

function strictPathParam(path: string, route: string): string {
  const template = route.split("/");
  const supplied = path.split("?", 1)[0].split("/");
  if (template.length !== supplied.length) throw new AccessError("invalid_action_resource", 400);
  const index = template.findIndex((part) => part.startsWith(":"));
  if (index < 0) throw new AccessError("invalid_action_resource", 400);
  const value = supplied[index];
  if (!value || value.length > 160 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new AccessError("invalid_action_resource", 400);
  return value;
}

function rejectUntrustedReparent(operation: AssetWriteOperation, body: unknown) {
  if (body === undefined && operation.endsWith("delete")) return;
  if (body === undefined && operation.endsWith("update")) return;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_action_resource", 400);
  const supplied = body as Record<string, unknown>;
  // A client may never provide an alternate machine/parent alongside the
  // resource path. Catalog handler already rejects the same legacy fields.
  if ("machineId" in supplied || "machineSetId" in supplied)
    throw new AccessError("asset_reparent_denied", 403);
}

/**
 * SEC-04/2B.1: read-only authorization planning for six asset writes.
 *
 * This is NOT a route hook and does not grant mutation. A future write must
 * recheck the resolved owner inside one transaction with advisory machine
 * lock, secure session, domain constraints and append-only action audit.
 */
export async function preflightCentralAssetWrite(input: CentralAssetWritePreflightInput):
  Promise<{ operation: AssetWriteOperation; machineId: string; permission: "catalog.assets.manage" }> {
  const { tx, principal, workstation, request } = input;
  const rule = classifyCentralRouteAction(request.method, request.path);
  const operation = rule ? ASSET_ACTIONS[
    `${rule.method} ${rule.route}` as keyof typeof ASSET_ACTIONS
  ] : undefined;
  if (!rule || !operation || rule.permission !== "catalog.assets.manage" ||
      rule.module !== "operational")
    throw new AccessError("central_action_not_supported");

  // Fail authorization BEFORE probing resource ownership, so foreign IDs
  // cannot be used as a catalogue enumeration oracle.
  if (!workstation.active || workstation.pendingApproval)
    throw new AccessError("workstation_inactive");
  if (!principal.workstationId || principal.workstationId !== workstation.id)
    throw new AccessError("workstation_session_mismatch");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "catalog.assets.manage");

  rejectUntrustedReparent(operation, request.body);
  const id = strictPathParam(request.path, rule.route);
  let machineId: string | undefined;
  if (operation === "set.create") {
    machineId = id;
  } else if (operation === "set.update" || operation === "set.delete" ||
             operation === "subset.create") {
    const set = await tx.machineSet.findUnique({
      where: { id }, select: { machineId: true, isActive: true },
    });
    if (!set) throw new AccessError("asset_not_found", 404);
    if (operation === "subset.create" && !set.isActive)
      throw new AccessError("asset_parent_inactive", 409);
    machineId = set.machineId;
  } else {
    const subset = await tx.machineSubset.findUnique({
      where: { id },
      select: { machineSet: { select: { machineId: true } } },
    });
    if (!subset) throw new AccessError("asset_not_found", 404);
    machineId = subset.machineSet.machineId;
  }

  if (!machineId) throw new AccessError("asset_not_found", 404);

  // Mask the existence of other machines and their asset IDs from a
  // machine-scoped principal. The body must never determine the owner.
  if (principal.machineScope !== "all" && !principal.machineIds.includes(machineId))
    throw new AccessError("asset_not_found", 404);
  const machine = await tx.machine.findUnique({
    where: { id: machineId }, select: { isActive: true },
  });
  if (!machine) throw new AccessError("asset_not_found", 404);
  if (!machine.isActive) throw new AccessError("machine_inactive", 409);
  assertPermission(principal, "catalog.assets.manage", machineId);

  return { operation, machineId, permission: "catalog.assets.manage" };
}
