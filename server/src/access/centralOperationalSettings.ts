import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule } from "./policy.js";
import { assertCentralOperationalSettingsPrivilege } from "../security/centralOperationalSettingsHttp.js";
import { GLOBAL_SYSTEM_SETTINGS_ID } from "../services/systemSettings.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

/** Only non-siren, non-credential operational policy fields, never generic JSON. */
export const CENTRAL_OPERATIONAL_SETTINGS_FIELDS = [
  "clientName", "clientUnit", "allowWholeSetCalls",
  "virtualKeyboardEnabled", "requireWorkOrderAtOpen",
  "restrictMaintenanceCompletionToAttendanceWorkstation",
  "dashboardMachineOrderMode", "attendanceMode",
  "rfidReaderMode", "rfidInputTerminator", "rfidCodeLength",
  "filterTechniciansByCurrentShift",
] as const;
type EditableKey = typeof CENTRAL_OPERATIONAL_SETTINGS_FIELDS[number];
const allowed = new Set<string>(CENTRAL_OPERATIONAL_SETTINGS_FIELDS);
const booleanFields = new Set<string>([
  "allowWholeSetCalls", "virtualKeyboardEnabled", "requireWorkOrderAtOpen",
  "restrictMaintenanceCompletionToAttendanceWorkstation",
  "filterTechniciansByCurrentShift",
]);

export function parseCentralOperationalSettingsPatch(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const entries = Object.entries(body);
  if (!entries.length || entries.length > CENTRAL_OPERATIONAL_SETTINGS_FIELDS.length ||
      entries.some(([key]) => !allowed.has(key)))
    throw new AccessError("invalid_input", 400);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (booleanFields.has(key)) {
      if (typeof value !== "boolean") throw new AccessError("invalid_input", 400);
      patch[key] = value;
    } else if (key === "clientName" || key === "clientUnit") {
      if (typeof value !== "string" || /[\x00-\x1F\x7F]/.test(value))
        throw new AccessError("invalid_input", 400);
      const trimmed = value.trim();
      if (trimmed.length > 100 || (key === "clientName" && trimmed.length < 2))
        throw new AccessError("invalid_input", 400);
      patch[key] = trimmed;
    } else if (key === "dashboardMachineOrderMode") {
      if (value !== "default" && value !== "priority")
        throw new AccessError("invalid_input", 400);
      patch[key] = value;
    } else if (key === "attendanceMode") {
      // Name-only is never an authenticated technician identity in central mode.
      if (value !== "pin" && value !== "rfid")
        throw new AccessError("central_credential_required", 400);
      patch[key] = value;
    } else if (key === "rfidReaderMode") {
      if (value !== "keyboard_hid") throw new AccessError("invalid_input", 400);
      patch[key] = value;
    } else if (key === "rfidInputTerminator") {
      if (!["enter", "tab", "fixed_length"].includes(String(value)) ||
          typeof value !== "string")
        throw new AccessError("invalid_input", 400);
      patch[key] = value;
    } else if (key === "rfidCodeLength") {
      if (value !== null &&
          (!Number.isInteger(value) || Number(value) < 4 || Number(value) > 64))
        throw new AccessError("invalid_input", 400);
      patch[key] = value;
    } else {
      throw new AccessError("invalid_input", 400);
    }
  }
  return patch as Pick<Prisma.SystemSettingsUpdateInput, EditableKey>;
}

export function runCentralOperationalSettingsUpdate(
  db: Pick<PrismaClient, "$transaction">,
  input: { token: string; workstationId: string; patch: unknown;
    requestId?: string; ipAddress?: string },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  const patch = parseCentralOperationalSettingsPatch(input.patch);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralOperationalSettingsPrivilege(principal);

    // Lock global policy row, then revalidate session/grants immediately
    // before mutating a setting that affects every machine/workstation.
    await tx.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      update: {}, create: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    });
    await tx.$queryRaw`SELECT id FROM system_settings WHERE id = ${GLOBAL_SYSTEM_SETTINGS_ID} FOR UPDATE`;
    const latest = await resolveSession(tx, request);
    const fresh = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!fresh?.active || fresh.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, fresh, "operational");
    assertCentralOperationalSettingsPrivilege(latest);

    const before = await tx.systemSettings.findUniqueOrThrow({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    });
    const changedKeys = Object.keys(patch).filter(key =>
      (before as unknown as Record<string, unknown>)[key] !==
      (patch as Record<string, unknown>)[key]);
    const result = changedKeys.length
      ? await tx.systemSettings.update({
          where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
          data: patch,
        })
      : before;
    if (changedKeys.length) {
      const beforeValues = Object.fromEntries(changedKeys.map(key =>
        [key, (before as unknown as Record<string, unknown>)[key]]));
      const afterValues = Object.fromEntries(changedKeys.map(key =>
        [key, (result as unknown as Record<string, unknown>)[key]]));
      await appendAudit(tx, {
        ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
        requestId: input.requestId,
      }, {
        action: "system.operational_settings.update",
        resourceType: "system_settings",
        resourceId: GLOBAL_SYSTEM_SETTINGS_ID,
        before: { changedKeys, values: beforeValues },
        after: { changedKeys, values: afterValues },
      });
    }
    return result;
  });
}
