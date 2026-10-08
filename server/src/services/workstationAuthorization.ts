import type { Prisma } from "@prisma/client";

import { lockWorkstationFlow } from "../db/workstationFlowLock.js";

import { GLOBAL_SYSTEM_SETTINGS_ID } from "./systemSettings.js";

export const WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE =
  "Não foi possível identificar esta workstation. Atualize a página e tente novamente.";
export const WORKSTATION_INACTIVE_MESSAGE =
  "Esta workstation está desativada para operações do ANDON.";
export const WORKSTATION_COMPLETION_RESTRICTED_MESSAGE =
  "Este atendimento deve ser concluído em uma workstation onde o atendimento foi iniciado.";

const WORKSTATION_ID_PATTERN =
  /^ws_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WorkstationAuthorizationError extends Error {}

export function parseWorkstationId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return WORKSTATION_ID_PATTERN.test(id) ? id.toLowerCase() : undefined;
}

async function isRestrictionEnabled(tx: Prisma.TransactionClient) {
  const settings = await tx.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { restrictMaintenanceCompletionToAttendanceWorkstation: true },
  });

  return settings?.restrictMaintenanceCompletionToAttendanceWorkstation ?? false;
}

export async function resolveAttendanceWorkstationId(
  tx: Prisma.TransactionClient,
  params: { workstationHeader: unknown; isSystemTest: boolean },
) {
  const workstationId = parseWorkstationId(params.workstationHeader);
  const restricted = !params.isSystemTest && (await isRestrictionEnabled(tx));

  if (!workstationId) {
    if (restricted) {
      throw new WorkstationAuthorizationError(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
    }
    return null;
  }

  await lockWorkstationFlow(tx, workstationId);

  const workstation = await tx.workstation.findUnique({
    where: { id: workstationId },
    select: { id: true, active: true },
  });

  if (!workstation) {
    if (restricted) {
      throw new WorkstationAuthorizationError(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
    }
    return null;
  }

  if (!workstation.active) {
    if (restricted) {
      throw new WorkstationAuthorizationError(WORKSTATION_INACTIVE_MESSAGE);
    }
    return null;
  }

  return workstation.id;
}

export async function assertMaintenanceCompletionWorkstation(
  tx: Prisma.TransactionClient,
  params: { callId: string; workstationHeader: unknown; isSystemTest: boolean },
) {
  if (params.isSystemTest || !(await isRestrictionEnabled(tx))) return;

  const sessions = await tx.technicianSession.findMany({
    where: { callId: params.callId },
    select: {
      workstationId: true,
      endedAt: true,
      workstation: { select: { name: true } },
    },
  });
  const activeSessions = sessions.filter((session) => session.endedAt === null);
  const authorizedSessions = activeSessions.filter(
    (session): session is typeof session & { workstationId: string } =>
      Boolean(session.workstationId),
  );

  if (authorizedSessions.length === 0) {
    const hasKnownHistoricalWorkstation = sessions.some((session) => session.workstationId);
    if (activeSessions.length > 0 || !hasKnownHistoricalWorkstation) {
      return;
    }
    throw new WorkstationAuthorizationError(WORKSTATION_COMPLETION_RESTRICTED_MESSAGE);
  }

  const workstationId = parseWorkstationId(params.workstationHeader);
  if (!workstationId) {
    throw new WorkstationAuthorizationError(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
  }

  const currentWorkstation = await tx.workstation.findUnique({
    where: { id: workstationId },
    select: { id: true, active: true },
  });
  if (!currentWorkstation) {
    throw new WorkstationAuthorizationError(WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE);
  }
  if (!currentWorkstation.active) {
    throw new WorkstationAuthorizationError(WORKSTATION_INACTIVE_MESSAGE);
  }

  if (authorizedSessions.some((session) => session.workstationId === workstationId)) return;

  const authorizedNames = Array.from(
    new Set(
      authorizedSessions
        .map((session) => session.workstation?.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );
  if (authorizedNames.length === 1) {
    throw new WorkstationAuthorizationError(
      `Conclua este atendimento na workstation "${authorizedNames[0]}".`,
    );
  }

  throw new WorkstationAuthorizationError(WORKSTATION_COMPLETION_RESTRICTED_MESSAGE);
}
