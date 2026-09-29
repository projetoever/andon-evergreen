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

export function assertWorkstationCanStartAttendance(context: WorkstationRestrictionContext) {
  if (!context.restricted) return;
  if (!context.currentWorkstationId || context.currentWorkstationActive === null) {
    throw new Error(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
  }
  if (!context.currentWorkstationActive) throw new Error(WORKSTATION_INACTIVE_MESSAGE);
}

export function assertWorkstationCanCompleteMaintenance(
  sessions: TechnicianAttendanceSession[],
  context: WorkstationRestrictionContext,
) {
  if (!context.restricted) return;

  const activeSessions = sessions.filter((session) => !session.endedAt);
  const authorizedIds = new Set(
    activeSessions
      .map((session) => session.workstationId)
      .filter((id): id is string => Boolean(id)),
  );

  if (authorizedIds.size === 0) {
    const hasKnownHistoricalWorkstation = sessions.some((session) => session.workstationId);
    if (activeSessions.length > 0 || !hasKnownHistoricalWorkstation) return;
    throw new Error(WORKSTATION_COMPLETION_RESTRICTED_MESSAGE);
  }

  if (!context.currentWorkstationId || context.currentWorkstationActive === null) {
    throw new Error(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
  }
  if (!context.currentWorkstationActive) throw new Error(WORKSTATION_INACTIVE_MESSAGE);
  if (!authorizedIds.has(context.currentWorkstationId)) {
    throw new Error(WORKSTATION_COMPLETION_RESTRICTED_MESSAGE);
  }
}
