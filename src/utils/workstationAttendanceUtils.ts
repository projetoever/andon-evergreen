import type { TechnicianAttendanceSession } from "@/types/andon";

export const WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE =
  "Não foi possível identificar esta workstation. Atualize a página e tente novamente.";
export const WORKSTATION_INACTIVE_MESSAGE =
  "Esta workstation está desativada para operações do ANDON.";
export const WORKSTATION_COMPLETION_RESTRICTED_MESSAGE =
  "Este atendimento deve ser concluído em uma workstation onde o atendimento foi iniciado.";

export interface WorkstationRestrictionContext {
  restricted: boolean;
  currentWorkstationId: string | null;
  currentWorkstationActive: boolean | null;
}

export type MaintenanceCompletionAuthorization =
  | {
      allowed: true;
      kind: "restriction_off" | "authorized" | "legacy";
      message: null;
    }
  | {
      allowed: false;
      kind: "unidentified" | "inactive" | "different_workstation";
      message: string;
    };

export function assertWorkstationCanStartAttendance(context: WorkstationRestrictionContext) {
  if (!context.restricted) return;
  if (!context.currentWorkstationId || context.currentWorkstationActive === null) {
    throw new Error(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
  }
  if (!context.currentWorkstationActive) throw new Error(WORKSTATION_INACTIVE_MESSAGE);
}

export function evaluateMaintenanceCompletionAuthorization(
  sessions: TechnicianAttendanceSession[],
  context: WorkstationRestrictionContext,
): MaintenanceCompletionAuthorization {
  if (!context.restricted) {
    return { allowed: true, kind: "restriction_off", message: null };
  }

  // Only the latest maintenance cycle grants completion authority. If everybody
  // ended their individual participation, keep that cycle's recorded stations.
  const maintenance = sessions.filter((session) => session.phase !== "follow_up");
  const latestCycle = Math.max(1, ...maintenance.map((session) => session.cycleIndex ?? 1));
  const currentCycle = maintenance.filter((session) => (session.cycleIndex ?? 1) === latestCycle);
  const activeSessions = currentCycle.filter((session) => !session.endedAt);
  const relevantSessions = activeSessions.length ? activeSessions : currentCycle;
  const authorizedIds = new Set(
    relevantSessions
      .map((session) => session.workstationId)
      .filter((id): id is string => Boolean(id)),
  );
  if (authorizedIds.size === 0) {
    return { allowed: true, kind: "legacy", message: null };
  }

  if (!context.currentWorkstationId || context.currentWorkstationActive === null) {
    return {
      allowed: false,
      kind: "unidentified",
      message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
    };
  }
  if (!context.currentWorkstationActive) {
    return {
      allowed: false,
      kind: "inactive",
      message: WORKSTATION_INACTIVE_MESSAGE,
    };
  }
  if (!authorizedIds.has(context.currentWorkstationId)) {
    return {
      allowed: false,
      kind: "different_workstation",
      message: WORKSTATION_COMPLETION_RESTRICTED_MESSAGE,
    };
  }

  return { allowed: true, kind: "authorized", message: null };
}

export function assertWorkstationCanCompleteMaintenance(
  sessions: TechnicianAttendanceSession[],
  context: WorkstationRestrictionContext,
) {
  const authorization = evaluateMaintenanceCompletionAuthorization(sessions, context);
  if (!authorization.allowed) throw new Error(authorization.message);
}
