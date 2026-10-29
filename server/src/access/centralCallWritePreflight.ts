import { classifyCentralRouteAction } from "./centralActionRegistry.js";
import {
  AccessError,
  assertModule,
  assertPermission,
  type Permission,
  type Principal,
} from "./policy.js";

/**
 * SEC-04/2A.1 — Preflight for a deliberately small subset of call writes.
 *
 * This is NOT a route hook and never enables central mutations. The global
 * workstationAccess guard continues to deny all central-mode writes. A future
 * handler must resolve and RECHECK the same resource under its transaction
 * lock, preserve attendance/workstation rules, and append an audited action.
 */
type CentralCallWrite = "open" | "open_batch" | "attend";

type CentralCallWriteRequest = {
  method: string;
  path: string;
  body?: unknown;
  /** Only for :id actions; must come from the matched server route params. */
  callId?: string;
};

type WorkstationContext = {
  id: string;
  active: boolean;
  allowOperational: boolean;
  allowBi: boolean;
  allowPriorities: boolean;
};

export type CentralCallWritePreflightInput = {
  principal: Principal;
  workstation: WorkstationContext;
  request: CentralCallWriteRequest;
  /** Must load call.machineId from the database, never from the request body. */
  resolveCallMachineId?: (callId: string) => Promise<string | null>;
};

export type CentralCallWritePreflightResult = {
  operation: CentralCallWrite;
  machineId: string;
  permission: Permission;
};

const SUPPORTED_WRITES: Readonly<Record<string, { operation: CentralCallWrite; permission: Permission }>> = {
  "POST /api/andon-calls": { operation: "open", permission: "calls.open" },
  "POST /api/andon-calls/batch": { operation: "open_batch", permission: "calls.open" },
  "PATCH /api/andon-calls/:id/attend": { operation: "attend", permission: "calls.attend" },
};

function bodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AccessError("invalid_action_resource", 400);
  }
  return body as Record<string, unknown>;
}

function machineIdFromBody(body: unknown): string {
  const value = bodyRecord(body).machineId;
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new AccessError("invalid_action_resource", 400);
  }
  return value;
}

function rejectUntrustedHumanOrigin(body: unknown) {
  const values = bodyRecord(body);
  // The normal UI must not be able to impersonate the installer, a system
  // test, or an arbitrary creator. Service identities use another guard.
  if (values.isSystemTest !== undefined || values.createdBy !== undefined ||
      (values.origin !== undefined && values.origin !== "kiosk")) {
    throw new AccessError("reserved_call_origin", 403);
  }
}

function callIdFromAttendingPath(path: string, suppliedCallId?: string): string {
  const match = /^\/api\/andon-calls\/([^/?]+)\/attend(?:\?.*)?$/.exec(path);
  if (!match || typeof suppliedCallId !== "string" || !suppliedCallId ||
      match[1] !== encodeURIComponent(suppliedCallId)) {
    throw new AccessError("invalid_action_resource", 400);
  }
  return suppliedCallId;
}

export async function preflightCentralCallWrite({
  principal,
  workstation,
  request,
  resolveCallMachineId,
}: CentralCallWritePreflightInput): Promise<CentralCallWritePreflightResult> {
  const rule = classifyCentralRouteAction(request.method, request.path);
  const supported = rule ? SUPPORTED_WRITES[`${rule.method} ${rule.route}`] : undefined;
  if (!rule || !supported || rule.permission !== supported.permission) {
    throw new AccessError("central_action_not_supported");
  }

  if (!workstation.active) throw new AccessError("workstation_inactive");
  if (!principal.workstationId || principal.workstationId !== workstation.id) {
    throw new AccessError("workstation_session_mismatch");
  }

  // Read visibility and the operation-specific permission are both required;
  // passing module checks alone never grants a mutation.
  assertModule(principal, workstation, "operational");
  assertPermission(principal, supported.permission);

  let machineId: string;
  if (supported.operation === "attend") {
    const callId = callIdFromAttendingPath(request.path, request.callId);
    if (!resolveCallMachineId) throw new AccessError("call_resolver_required");
    const fromRecord = await resolveCallMachineId(callId);
    if (!fromRecord) throw new AccessError("call_not_found", 404);
    machineId = fromRecord;
    // Do not leak the presence of a call on a machine outside the scope.
    if (principal.machineScope !== "all" && !principal.machineIds.includes(machineId)) {
      throw new AccessError("call_not_found", 404);
    }
  } else {
    machineId = machineIdFromBody(request.body);
    if (supported.operation === "open") rejectUntrustedHumanOrigin(request.body);
    assertPermission(principal, supported.permission, machineId);
  }

  return { operation: supported.operation, machineId, permission: supported.permission };
}
