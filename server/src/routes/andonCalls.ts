import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { lockMachineFlow } from "../db/machineFlowLock.js";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { prisma } from "../db/prisma.js";
import {
  allowsWholeSetCalls,
  getAttendanceMode,
  requiresWorkOrderAtOpen,
} from "../services/systemSettings.js";
import {
  getTechnicianTechnicalAreas,
  identifyTechnician,
  resolveTechniciansByNames,
  type IdentifiedTechnician,
} from "../services/technicianIdentity.js";
import {
  assertMaintenanceCompletionWorkstation,
  resolveAttendanceWorkstationId,
  WorkstationAuthorizationError,
} from "../services/workstationAuthorization.js";
import { badRequest, notFound, parseDate, parseLimit } from "./routeUtils.js";

type AndonCallQuery = {
  machineId?: string;
  status?: string;
  criticality?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
};

type OpenAndonCallBody = {
  machineId?: unknown;
  machineSetId?: unknown;
  machineSubsetId?: unknown;
  category?: unknown;
  subtype?: unknown;
  criticality?: unknown;
  description?: unknown;
  createdBy?: unknown;
  origin?: unknown;
  isSystemTest?: unknown;
  machineCondition?: unknown;
  workOrderNumber?: unknown;
  operatorNote?: unknown;
};

type AttendAndonCallBody = {
  technicianName?: unknown;
  technicianNames?: unknown;
  technicianArea?: unknown;
  credentials?: unknown;
};

type AddTechnicianBody = {
  technicianName?: unknown;
  technicianNames?: unknown;
  technicianArea?: unknown;
  credentials?: unknown;
};

type BatchOpenAndonCallsBody = {
  machineId?: unknown;
  subtypes?: unknown;
  criticality?: unknown;
  machineCondition?: unknown;
  workOrderNumber?: unknown;
  operatorNote?: unknown;
};

type EndTechnicianBody = {
  reason?: unknown;
  notes?: unknown;
  technicianName?: unknown;
  credential?: TechnicianCredentialBody;
};

type NotesBody = {
  notes?: unknown;
  followUpSessionIds?: unknown;
};

type ReturnToMaintenanceBody = {
  reason?: unknown;
};

type FinishAndonCallBody = {
  notes?: unknown;
  failureClassification?: unknown;
  failureDescription?: unknown;
  machineStatus?: unknown;
  impactCallIds?: unknown;
  confirmedMachineSetId?: unknown;
  confirmedMachineSubsetId?: unknown;
  assetChangeReason?: unknown;
};

type EditFailureDetailsBody = {
  failureClassification?: unknown;
  failureDescription?: unknown;
};

type CancelAndonCallBody = {
  reason?: unknown;
  cancelledBy?: unknown;
};

type MachineSetSnapshot = {
  id: string;
  code: string;
  name: string;
  type: string | null;
};

type MachineSubsetSnapshot = {
  id: string;
  code: string;
  name: string;
  type: string | null;
};

type CallAssetSnapshotRow = {
  id: string;
  machineSetId: string | null;
  machineSetCodeSnapshot: string | null;
  machineSetNameSnapshot: string | null;
  machineSetTypeSnapshot: string | null;
  machineSubsetId: string | null;
  machineSubsetCodeSnapshot: string | null;
  machineSubsetNameSnapshot: string | null;
  machineSubsetTypeSnapshot: string | null;
};

const CALL_CATEGORIES = new Set(["maintenance", "production"]);
const CALL_CRITICALITIES = new Set(["low", "medium", "high", "critical"]);
const CALL_ORIGINS = new Set(["kiosk", "installer_health_check"]);
const INSTALLER_HEALTH_ORIGIN = "installer_health_check";
const INSTALLER_HEALTH_CREATED_BY = "installer-health";
const MACHINE_STATUSES = new Set(["running", "stopped"]);
const OPEN_CALL_STATUSES = ["open", "in_progress", "post_maintenance"];
const GENERIC_FAILURE_CLASSIFICATIONS = new Set([
  "unclassified",
  "unidentified_stop",
  "real_machine_failure",
]);
type TechnicianCredentialBody = {
  method?: unknown;
  value?: unknown;
};

const andonCallInclude = {
  technicianSessions: { orderBy: { startedAt: "asc" } },
  technicianTimeAllocations: { orderBy: { startedAt: "asc" } },
  impactIntervals: { orderBy: { startedAt: "asc" } },
} satisfies Prisma.AndonCallInclude;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

const MAX_WORK_ORDER_NUMBER_LENGTH = 100;
const MAX_OPERATOR_NOTE_LENGTH = 500;

function normalizeWorkOrderNumber(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function normalizeOperatorNote(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized || undefined;
}


function uniqueNames(names: Array<string | undefined>) {
  return Array.from(new Set(names.filter((name): name is string => Boolean(name))));
}

function parseCredentialBodies(value: unknown): TechnicianCredentialBody[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TechnicianCredentialBody => Boolean(item) && typeof item === "object",
  );
}

class AndonCallValidationError extends Error {}

async function lockMachineCallFlow(tx: Prisma.TransactionClient, machineId: string) {
  await lockMachineFlow(tx, machineId);
}

async function findDuplicateActiveSectorCall(
  tx: Prisma.TransactionClient,
  machineId: string,
  subtype: string,
) {
  return tx.andonCall.findFirst({
    where: {
      machineId,
      subtype,
      isSystemTest: false,
      status: { in: OPEN_CALL_STATUSES },
    },
    select: { id: true },
  });
}

async function syncMachineOperationalState(tx: Prisma.TransactionClient, machineId: string) {
  const referenceCall = await tx.andonCall.findFirst({
    where: {
      machineId,
      isSystemTest: false,
      status: { in: OPEN_CALL_STATUSES },
    },
    orderBy: [{ openedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, status: true },
  });

  await tx.machine.update({
    where: { id: machineId },
    data: {
      currentCallId: referenceCall?.id ?? null,
      andonStatus: referenceCall?.status ?? "normal",
    },
  });
}

async function resolveAttendanceTechnicians(
  tx: Prisma.TransactionClient,
  call: { category: string; subtype: string | null },
  body: AttendAndonCallBody | AddTechnicianBody,
) {
  if (call.category !== "maintenance") return [];

  const credentialBodies = parseCredentialBodies(body.credentials);
  const requestedNames = uniqueNames([
    optionalString(body.technicianName),
    ...(Array.isArray(body.technicianNames)
      ? body.technicianNames.map(optionalString).filter((name): name is string => Boolean(name))
      : []),
  ]);
  const attendanceMode = await getAttendanceMode();
  const technicians: IdentifiedTechnician[] = [];

  if (credentialBodies.length) {
    for (const credential of credentialBodies) {
      const technician = await identifyTechnician(credential, tx);
      if (!technician) {
        throw new AndonCallValidationError("PIN ou tag não reconhecido para um mantenedor ativo");
      }
      technicians.push(technician);
    }
  } else if (attendanceMode === "name") {
    technicians.push(...(await resolveTechniciansByNames(requestedNames, tx)));
    if (technicians.length !== requestedNames.length) {
      throw new AndonCallValidationError(
        "Um ou mais mantenedores não foram encontrados ou estão inativos",
      );
    }
  } else {
    throw new AndonCallValidationError("Identifique o mantenedor por PIN ou tag");
  }

  const uniqueTechnicians = Array.from(
    new Map(technicians.map((technician) => [technician.id, technician])).values(),
  );
  if (!uniqueTechnicians.length) {
    throw new AndonCallValidationError("Identifique pelo menos um mantenedor");
  }

  const incompatible = uniqueTechnicians.find(
    (technician) =>
      !call.subtype || !getTechnicianTechnicalAreas(technician).includes(call.subtype),
  );
  if (incompatible) {
    throw new AndonCallValidationError(`${incompatible.name} não pertence à área deste chamado`);
  }

  return uniqueTechnicians;
}

function diffMinutes(start?: Date | null, end = new Date()) {
  if (!start) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function diffPreciseMinutes(start?: Date | null, end = new Date()) {
  if (!start) {
    return 0;
  }

  return Math.max(0, (end.getTime() - start.getTime()) / 60000);
}

function diffSeconds(start: Date, end = new Date()) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

async function calculateStoppedMinutesForPeriod(
  tx: Prisma.TransactionClient,
  machineId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  const events = await tx.failureEvent.findMany({
    where: {
      machineId,
      startedAt: { lt: periodEnd },
      OR: [{ endedAt: null }, { endedAt: { gt: periodStart } }],
    },
    select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "asc" },
  });

  const intervals = events
    .map((event) => ({
      start: Math.max(periodStart.getTime(), event.startedAt.getTime()),
      end: Math.min(periodEnd.getTime(), (event.endedAt ?? periodEnd).getTime()),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((current, next) => current.start - next.start);

  let totalMilliseconds = 0;
  let activeStart: number | null = null;
  let activeEnd: number | null = null;

  for (const interval of intervals) {
    if (activeStart === null || activeEnd === null) {
      activeStart = interval.start;
      activeEnd = interval.end;
      continue;
    }

    if (interval.start <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.end);
      continue;
    }

    totalMilliseconds += activeEnd - activeStart;
    activeStart = interval.start;
    activeEnd = interval.end;
  }

  if (activeStart !== null && activeEnd !== null) {
    totalMilliseconds += activeEnd - activeStart;
  }

  return Math.max(0, Math.round(totalMilliseconds / 60000));
}

async function calculateCallImpactMinutes(
  tx: Prisma.TransactionClient,
  callId: string,
  periodEnd: Date,
) {
  const intervals = await tx.callImpactInterval.findMany({
    where: { callId, startedAt: { lt: periodEnd } },
    select: { startedAt: true, endedAt: true },
    orderBy: { startedAt: "asc" },
  });

  const normalized = intervals
    .map((interval) => ({
      start: interval.startedAt.getTime(),
      end: Math.min(periodEnd.getTime(), (interval.endedAt ?? periodEnd).getTime()),
    }))
    .filter((interval) => interval.end > interval.start);

  let totalMilliseconds = 0;
  let activeStart: number | null = null;
  let activeEnd: number | null = null;

  for (const interval of normalized) {
    if (activeStart === null || activeEnd === null) {
      activeStart = interval.start;
      activeEnd = interval.end;
    } else if (interval.start <= activeEnd) {
      activeEnd = Math.max(activeEnd, interval.end);
    } else {
      totalMilliseconds += activeEnd - activeStart;
      activeStart = interval.start;
      activeEnd = interval.end;
    }
  }

  if (activeStart !== null && activeEnd !== null) {
    totalMilliseconds += activeEnd - activeStart;
  }

  return Math.max(0, Math.round(totalMilliseconds / 60000));
}

async function closeImpactIntervals(
  tx: Prisma.TransactionClient,
  where: Prisma.CallImpactIntervalWhereInput,
  endedAt: Date,
) {
  const openIntervals = await tx.callImpactInterval.findMany({
    where: { ...where, endedAt: null },
    select: { id: true, startedAt: true },
  });

  for (const interval of openIntervals) {
    await tx.callImpactInterval.update({
      where: { id: interval.id },
      data: {
        endedAt,
        durationSeconds: diffSeconds(interval.startedAt, endedAt),
      },
    });
  }
}

async function ensureOpenCallImpactInterval(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    machineId: string;
    startedAt: Date;
    source: string;
    assignedByCallId?: string | null;
    notes?: string | null;
  },
) {
  const existing = await tx.callImpactInterval.findFirst({
    where: { callId: params.callId, endedAt: null },
    select: { id: true },
  });
  if (existing) return existing;

  return tx.callImpactInterval.create({
    data: params,
    select: { id: true },
  });
}

type OpenFailureEvent = {
  id: string;
  callId: string | null;
  startedAt: Date;
  notes: string | null;
};

async function getOpenFailureState(tx: Prisma.TransactionClient, machineId: string) {
  const openEvents: OpenFailureEvent[] = await tx.failureEvent.findMany({
    where: { machineId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      callId: true,
      startedAt: true,
      notes: true,
    },
  });
  const ownerCallIds = openEvents
    .map((event) => event.callId)
    .filter((callId): callId is string => Boolean(callId));
  const activeOwners = ownerCallIds.length
    ? await tx.andonCall.findMany({
        where: {
          id: { in: ownerCallIds },
          machineId,
          isSystemTest: false,
          status: { in: OPEN_CALL_STATUSES },
        },
        select: { id: true },
      })
    : [];
  const activeOwnerIds = new Set(activeOwners.map((call) => call.id));

  return {
    openEvents,
    activeOwnerEvent:
      openEvents.find((event) => event.callId && activeOwnerIds.has(event.callId)) ?? null,
  };
}

async function closeOpenFailureEventsForRecovery(
  tx: Prisma.TransactionClient,
  events: OpenFailureEvent[],
  finishedAt: Date,
) {
  for (const event of events) {
    await tx.failureEvent.update({
      where: { id: event.id },
      data: {
        endedAt: finishedAt,
        durationSeconds: diffSeconds(event.startedAt, finishedAt),
        machineStatus: "running",
        notes: appendNote(
          event.notes,
          "Condição informada como pronta para rodar na abertura de um novo chamado",
          "Retomada",
        ),
      },
    });
  }
}

async function resumeMachineWhenFinishingOwnedStop(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    machineId: string;
    currentMachineStatus: string;
    finishedAt: Date;
    requestedMachineStatus?: string | null;
    requestedImpactCallIds?: string[];
    requireStatusConfirmation?: boolean;
  },
) {
  await closeImpactIntervals(tx, { callId: params.callId }, params.finishedAt);

  if (params.currentMachineStatus !== "stopped") {
    return params.currentMachineStatus;
  }

  const ownedOpenEvent = await tx.failureEvent.findFirst({
    where: {
      machineId: params.machineId,
      callId: params.callId,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
  });

  if (!ownedOpenEvent) {
    return params.currentMachineStatus;
  }

  const remainingCalls = await tx.andonCall.findMany({
    where: {
      id: { not: params.callId },
      machineId: params.machineId,
      isSystemTest: false,
      status: { in: OPEN_CALL_STATUSES },
    },
    orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    select: { id: true, subtype: true },
  });

  if (remainingCalls.length) {
    if (params.requireStatusConfirmation && !params.requestedMachineStatus) {
      throw new FinishCallValidationError(
        "Informe se a máquina continua em falha antes de finalizar este chamado",
      );
    }

    if (params.requestedMachineStatus === "stopped") {
      const requestedIds = Array.from(new Set(params.requestedImpactCallIds ?? []));
      const remainingIds = new Set(remainingCalls.map((call) => call.id));
      if (!requestedIds.length) {
        throw new FinishCallValidationError(
          "Selecione ao menos um chamado responsável se a máquina continua em falha",
        );
      }
      if (requestedIds.some((callId) => !remainingIds.has(callId))) {
        throw new FinishCallValidationError(
          "Um ou mais chamados selecionados não estão ativos nesta máquina",
        );
      }

      await closeImpactIntervals(
        tx,
        { machineId: params.machineId, callId: { notIn: requestedIds } },
        params.finishedAt,
      );

      for (const callId of requestedIds) {
        await ensureOpenCallImpactInterval(tx, {
          callId,
          machineId: params.machineId,
          startedAt: params.finishedAt,
          source: "failure_handoff",
          assignedByCallId: params.callId,
          notes: "Impacto atribuído na continuidade da falha",
        });
      }

      const primaryCallId =
        remainingCalls.find((call) => requestedIds.includes(call.id))?.id ?? requestedIds[0];
      const selectedCalls = remainingCalls.filter((call) => requestedIds.includes(call.id));
      const selectedSubtypeIds = selectedCalls
        .map((call) => call.subtype)
        .filter((subtype): subtype is string => Boolean(subtype));
      const selectedCategories = selectedSubtypeIds.length
        ? await tx.andonCategory.findMany({
            where: { id: { in: selectedSubtypeIds } },
            select: { id: true, displayName: true },
          })
        : [];
      const categoryNameById = new Map(
        selectedCategories.map((category) => [category.id, category.displayName]),
      );
      const selectedCategoryNames = Array.from(
        new Set(
          selectedCalls
            .map((call) => (call.subtype ? categoryNameById.get(call.subtype) : undefined))
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const transferDescription = selectedCategoryNames.length
        ? `Máquina permaneceu parada. Impacto transferido para: ${selectedCategoryNames.join(", ")}.`
        : requestedIds.length === 1
          ? "Máquina permaneceu parada. Impacto transferido para outro chamado ativo."
          : `Máquina permaneceu parada. Impacto transferido para ${requestedIds.length} chamados ativos.`;
      await tx.failureEvent.update({
        where: { id: ownedOpenEvent.id },
        data: {
          callId: primaryCallId,
          notes: appendNote(
            ownedOpenEvent.notes,
            transferDescription,
            "Continuidade da falha",
          ),
        },
      });

      return "stopped";
    }

    if (!params.requireStatusConfirmation && !params.requestedMachineStatus) {
      const existingImpact = await tx.callImpactInterval.findFirst({
        where: {
          machineId: params.machineId,
          callId: { in: remainingCalls.map((call) => call.id) },
          endedAt: null,
        },
        orderBy: { startedAt: "asc" },
      });
      if (existingImpact) {
        await tx.failureEvent.update({
          where: { id: ownedOpenEvent.id },
          data: { callId: existingImpact.callId },
        });
        return "stopped";
      }
    }
  }

  await closeImpactIntervals(tx, { machineId: params.machineId }, params.finishedAt);

  await tx.failureEvent.update({
    where: { id: ownedOpenEvent.id },
    data: {
      endedAt: params.finishedAt,
      durationSeconds: diffSeconds(ownedOpenEvent.startedAt, params.finishedAt),
      machineStatus: "running",
      notes: ownedOpenEvent.notes,
    },
  });

  await tx.machine.update({
    where: { id: params.machineId },
    data: {
      machineStatus: "running",
      lastStatusChangedAt: params.finishedAt,
    },
  });

  return "running";
}

function appendNote(currentNotes: string | null, note: string | undefined, prefix: string) {
  if (!note) {
    return currentNotes;
  }

  const entry = `${prefix}: ${note}`;
  return currentNotes ? `${currentNotes}\n${entry}` : entry;
}

function mergeFinalDescription(
  currentNotes: string | null,
  finalDescription: string | null | undefined,
) {
  const description = finalDescription?.trim();
  if (!description) {
    return currentNotes;
  }
  if (!currentNotes) {
    return description;
  }

  const normalize = (value: string) =>
    value
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .join("\n")
      .trim()
      .toLocaleLowerCase("pt-BR");
  const normalizedNotes = normalize(currentNotes);
  const normalizedDescription = normalize(description);
  const alreadyPresent =
    normalizedNotes === normalizedDescription ||
    normalizedNotes.startsWith(`${normalizedDescription}\n`) ||
    normalizedNotes.endsWith(`\n${normalizedDescription}`) ||
    normalizedNotes.includes(`\n${normalizedDescription}\n`);

  return alreadyPresent ? currentNotes : `${currentNotes}\n${description}`;
}

function attachAssetSnapshots(
  call: unknown,
  machineSet: MachineSetSnapshot | null,
  machineSubset: MachineSubsetSnapshot | null,
) {
  if (!call || typeof call !== "object") {
    return call;
  }

  return {
    ...call,
    machineSetId: machineSet?.id ?? null,
    machineSetCodeSnapshot: machineSet?.code ?? null,
    machineSetNameSnapshot: machineSet?.name ?? null,
    machineSetTypeSnapshot: machineSet?.type ?? null,
    machineSubsetId: machineSubset?.id ?? null,
    machineSubsetCodeSnapshot: machineSubset?.code ?? null,
    machineSubsetNameSnapshot: machineSubset?.name ?? null,
    machineSubsetTypeSnapshot: machineSubset?.type ?? null,
  };
}

async function enrichCallsWithAssetSnapshots(calls: unknown[]) {
  const callIds = calls
    .map((call) => (call && typeof call === "object" && "id" in call ? String(call.id) : undefined))
    .filter((id): id is string => Boolean(id));

  if (!callIds.length) {
    return calls;
  }

  const rows = await prisma.$queryRaw<CallAssetSnapshotRow[]>(Prisma.sql`
    SELECT
      "id",
      "machineSetId",
      "machineSetCodeSnapshot",
      "machineSetNameSnapshot",
      "machineSetTypeSnapshot",
      "machineSubsetId",
      "machineSubsetCodeSnapshot",
      "machineSubsetNameSnapshot",
      "machineSubsetTypeSnapshot"
    FROM "andon_calls"
    WHERE "id" IN (${Prisma.join(callIds)})
  `);

  const snapshotsByCallId = new Map(rows.map((row) => [row.id, row]));

  return calls.map((call) => {
    if (!call || typeof call !== "object" || !("id" in call)) {
      return call;
    }

    const snapshot = snapshotsByCallId.get(String(call.id));
    return {
      ...call,
      machineSetId: snapshot?.machineSetId ?? null,
      machineSetCodeSnapshot: snapshot?.machineSetCodeSnapshot ?? null,
      machineSetNameSnapshot: snapshot?.machineSetNameSnapshot ?? null,
      machineSetTypeSnapshot: snapshot?.machineSetTypeSnapshot ?? null,
      machineSubsetId: snapshot?.machineSubsetId ?? null,
      machineSubsetCodeSnapshot: snapshot?.machineSubsetCodeSnapshot ?? null,
      machineSubsetNameSnapshot: snapshot?.machineSubsetNameSnapshot ?? null,
      machineSubsetTypeSnapshot: snapshot?.machineSubsetTypeSnapshot ?? null,
    };
  });
}

async function findActiveMachineSetForCall(machineId: string, machineSetId: string) {
  const rows = await prisma.$queryRaw<MachineSetSnapshot[]>(Prisma.sql`
    SELECT "id", "code", "name", "type"
    FROM "machine_sets"
    WHERE "id" = ${machineSetId}
      AND "machineId" = ${machineId}
      AND "isActive" = true
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function findActiveMachineSubsetForCall(machineSetId: string, machineSubsetId: string) {
  const rows = await prisma.$queryRaw<MachineSubsetSnapshot[]>(Prisma.sql`
    SELECT
      subset."id",
      subset."code",
      subset."name",
      subset_type."code" AS "type"
    FROM "machine_subsets" AS subset
    INNER JOIN "machine_subset_types" AS subset_type
      ON subset_type."id" = subset."typeId"
    WHERE subset."id" = ${machineSubsetId}
      AND subset."machineSetId" = ${machineSetId}
      AND subset."isActive" = true
      AND subset_type."isActive" = true
    LIMIT 1
  `);

  return rows[0] ?? null;
}

class FinishCallValidationError extends Error {}

class FinishCallNotFoundError extends Error {}

class ActiveTechnicianSessionNotFoundError extends Error {}

type AssetConfirmationResponsibleCall = {
  category: string;
  technicianName: string | null;
  technicianNames: string[];
  technicianSessions: Array<{
    technicianName: string;
    endedAt: Date | null;
  }>;
};

function uniqueRegisteredTechnicianNames(names: Array<string | null | undefined>) {
  return Array.from(
    new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))),
  );
}

function resolveAutomaticAssetConfirmedBy(call: AssetConfirmationResponsibleCall) {
  const activeSessionNames = uniqueRegisteredTechnicianNames(
    call.technicianSessions
      .filter((session) => !session.endedAt)
      .map((session) => session.technicianName),
  );

  const allSessionNames = uniqueRegisteredTechnicianNames(
    call.technicianSessions.map((session) => session.technicianName),
  );

  const legacyNames = uniqueRegisteredTechnicianNames([
    ...call.technicianNames,
    call.technicianName,
  ]);

  const responsibleNames = activeSessionNames.length
    ? activeSessionNames
    : allSessionNames.length
      ? allSessionNames
      : legacyNames;

  if (call.category === "maintenance" && responsibleNames.length === 0) {
    throw new FinishCallValidationError("O chamado de manutenção não possui mantenedor registrado");
  }

  return responsibleNames.length ? responsibleNames.join(", ") : "Operação";
}

function resolveAssetChangeReason(locationChanged: boolean, reason: string | undefined) {
  if (!locationChanged) {
    return null;
  }

  return reason?.trim() || "Não justificado";
}

function assetSnapshotKey(
  id: string | null,
  code: string | null,
  name: string | null,
  type: string | null,
) {
  if (id) {
    return `id:${id}`;
  }

  const snapshotParts = [code?.trim() ?? "", name?.trim() ?? "", type?.trim() ?? ""];

  return snapshotParts.some(Boolean) ? `snapshot:${snapshotParts.join("|")}` : null;
}

async function findMachineSetForConfirmation(
  tx: Prisma.TransactionClient,
  machineId: string,
  machineSetId: string,
  openingMachineSetId: string | null,
) {
  const rows = await tx.$queryRaw<MachineSetSnapshot[]>(Prisma.sql`
    SELECT "id", "code", "name", "type"
    FROM "machine_sets"
    WHERE "id" = ${machineSetId}
      AND "machineId" = ${machineId}
      AND (
        "isActive" = true
        OR "id" = ${openingMachineSetId}
      )
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function findMachineSubsetForConfirmation(
  tx: Prisma.TransactionClient,
  machineSetId: string,
  machineSubsetId: string,
  openingMachineSubsetId: string | null,
) {
  const rows = await tx.$queryRaw<MachineSubsetSnapshot[]>(Prisma.sql`
    SELECT
      subset."id",
      subset."code",
      subset."name",
      subset_type."code" AS "type"
    FROM "machine_subsets" AS subset
    LEFT JOIN "machine_subset_types" AS subset_type
      ON subset_type."id" = subset."typeId"
    WHERE subset."id" = ${machineSubsetId}
      AND subset."machineSetId" = ${machineSetId}
      AND (
        (
          subset."isActive" = true
          AND subset_type."isActive" = true
        )
        OR subset."id" = ${openingMachineSubsetId}
      )
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function machineHasActiveSets(tx: Prisma.TransactionClient, machineId: string) {
  const activeSetCount = await tx.machineSet.count({
    where: {
      machineId,
      isActive: true,
    },
  });

  return activeSetCount > 0;
}
async function findCallWithSessions(tx: Prisma.TransactionClient, callId: string) {
  return tx.andonCall.findUnique({
    where: { id: callId },
    include: andonCallInclude,
  });
}

async function endActiveTechnicianSession(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    technicianId?: string;
    technicianName?: string;
    reason?: string;
    notes?: string;
  },
) {
  const callReference = await tx.andonCall.findUnique({
    where: { id: params.callId },
    select: { machineId: true },
  });
  if (!callReference) throw new FinishCallNotFoundError("Chamado não encontrado");

  await lockMachineCallFlow(tx, callReference.machineId);
  const call = await tx.andonCall.findUnique({
    where: { id: params.callId },
    include: { machine: true },
  });
  if (!call) throw new FinishCallNotFoundError("Chamado não encontrado");

  if (params.technicianId) {
    await lockTechnicianSessionFlow(tx, params.technicianId);
  }

  let activeSession = await tx.technicianSession.findFirst({
    where: {
      callId: call.id,
      endedAt: null,
      ...(params.technicianId
        ? { technicianId: params.technicianId }
        : { technicianName: { equals: params.technicianName, mode: "insensitive" } }),
    },
    orderBy: { startedAt: "desc" },
  });
  if (!activeSession) {
    throw new ActiveTechnicianSessionNotFoundError(
      "Este mantenedor não possui atendimento ativo neste chamado",
    );
  }
  if (!params.technicianId && activeSession.technicianId) {
    await lockTechnicianSessionFlow(tx, activeSession.technicianId);
    activeSession = await tx.technicianSession.findFirst({
      where: {
        id: activeSession.id,
        callId: call.id,
        technicianId: activeSession.technicianId,
        endedAt: null,
      },
    });
    if (!activeSession) {
      throw new ActiveTechnicianSessionNotFoundError(
        "Este mantenedor não possui atendimento ativo neste chamado",
      );
    }
  }

  const transitionAt = new Date();

  const updated = await tx.technicianSession.updateMany({
    where: { id: activeSession.id, endedAt: null },
    data: {
      endedAt: transitionAt,
      endReason:
        params.reason ?? (activeSession.phase === "follow_up" ? "follow_up_finished" : "manual"),
      notes: params.notes ?? activeSession.notes,
      productionModeAtEnd: call.machine.productionMode,
      machineStatusAtEnd: call.machine.machineStatus,
    },
  });
  if (updated.count !== 1) {
    throw new ActiveTechnicianSessionNotFoundError(
      "Este mantenedor não possui atendimento ativo neste chamado",
    );
  }

  return findCallWithSessions(tx, call.id);
}

async function lockAndFindMissingActiveTechnicians(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    technicians: IdentifiedTechnician[];
  },
) {
  if (!params.technicians.length) {
    return [];
  }

  const technicians = Array.from(
    new Map(params.technicians.map((technician) => [technician.id, technician])).values(),
  );
  const technicianIds = technicians.map((technician) => technician.id).sort();
  const names = technicians.map((technician) => technician.name);

  for (const technicianId of technicianIds) {
    await lockTechnicianSessionFlow(tx, technicianId);
  }

  const stillActiveTechnicians = await tx.technician.findMany({
    where: {
      id: { in: technicianIds },
      active: true,
    },
    select: { id: true },
  });
  const stillActiveIds = new Set(stillActiveTechnicians.map((technician) => technician.id));
  const inactiveTechnician = technicians.find(
    (technician) => !stillActiveIds.has(technician.id),
  );
  if (inactiveTechnician) {
    throw new AndonCallValidationError(
      `Mantenedor ${inactiveTechnician.name} está inativo`,
    );
  }

  const activeSessions = await tx.technicianSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { technicianId: { in: technicianIds } },
        ...names.map((name) => ({
          technicianId: null,
          technicianName: { equals: name, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      callId: true,
      machineId: true,
      technicianId: true,
      technicianName: true,
    },
  });

  const missingTechnicians = technicians.filter((technician) => {
    const technicianSessions = activeSessions.filter(
      (session) =>
        session.technicianId === technician.id ||
        (session.technicianId === null &&
          session.technicianName.toLocaleLowerCase("pt-BR") ===
            technician.name.toLocaleLowerCase("pt-BR")),
    );
    const activeInAnotherCall = technicianSessions.find(
      (session) => session.callId !== params.callId,
    );

    if (activeInAnotherCall) {
      throw new AndonCallValidationError(
        `Mantenedor ${technician.name} já possui atendimento ativo em outro chamado ` +
          `(máquina ${activeInAnotherCall.machineId})`,
      );
    }

    return !technicianSessions.some((session) => session.callId === params.callId);
  });

  if (!missingTechnicians.length) {
    return [];
  }

  return missingTechnicians;
}

async function createTechnicianSessions(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    machineId: string;
    technicians: IdentifiedTechnician[];
    startedAt: Date;
    productionModeAtStart?: string | null;
    machineStatusAtStart?: string | null;
    workstationId?: string | null;
    technicalArea?: string | null;
    phase: "maintenance" | "follow_up";
    cycleIndex: number;
  },
) {
  if (!params.technicians.length) return;

  await tx.technicianSession.createMany({
    data: params.technicians.map((technician) => ({
      callId: params.callId,
      machineId: params.machineId,
      technicianId: technician.id,
      technicianName: technician.name,
      technicalArea: params.technicalArea ?? technician.technicalArea,
      shiftId: technician.shiftId,
      shiftName: technician.shift?.name ?? undefined,
      workstationId: params.workstationId ?? undefined,
      phase: params.phase,
      cycleIndex: params.cycleIndex,
      startedAt: params.startedAt,
      productionModeAtStart: params.productionModeAtStart ?? undefined,
      machineStatusAtStart: params.machineStatusAtStart ?? undefined,
    })),
  });
}

async function ensureOpenFailureEventForStoppedCall(
  tx: Prisma.TransactionClient,
  params: {
    machineId: string;
    callId: string;
    startedAt: Date;
    productionMode?: string | null;
    existingEventId?: string | null;
    claimExistingEvent?: boolean;
  },
) {
  const openEvents = await tx.failureEvent.findMany({
    where: {
      machineId: params.machineId,
      endedAt: null,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  const activeEvent =
    openEvents.find((event) => event.id === params.existingEventId) ?? openEvents[0];

  if (activeEvent) {
    if (params.claimExistingEvent || !activeEvent.callId) {
      await tx.failureEvent.update({
        where: { id: activeEvent.id },
        data: { callId: params.callId },
      });
    }

    return activeEvent.startedAt;
  }

  await tx.failureEvent.create({
    data: {
      machineId: params.machineId,
      callId: params.callId,
      startedAt: params.startedAt,
      classification: "unidentified_stop",
      source: "manual",
      productionMode: params.productionMode ?? undefined,
      machineStatus: "stopped",
      notes: "Falha registrada na abertura do ANDON",
    },
  });

  return params.startedAt;
}

export async function registerAndonCallRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AndonCallQuery }>("/api/andon-calls", async (request) => {
    const { machineId, status, criticality } = request.query;
    const where: Prisma.AndonCallWhereInput = {
      ...(machineId ? { machineId } : {}),
      ...(status ? { status } : {}),
      ...(criticality ? { criticality } : {}),
    };

    const calls = await prisma.andonCall.findMany({
      where,
      include: andonCallInclude,
      orderBy: { openedAt: "desc" },
      take: parseLimit(request.query.limit),
    });

    return enrichCallsWithAssetSnapshots(calls);
  });

  app.get<{ Querystring: AndonCallQuery }>("/api/andon-calls/history", async (request) => {
    const { machineId } = request.query;
    const startDate = parseDate(request.query.startDate);
    const endDate = parseDate(request.query.endDate);
    const where: Prisma.AndonCallWhereInput = {
      finishedAt: { not: null },
      ...(machineId ? { machineId } : {}),
      ...(startDate || endDate
        ? {
            finishedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const calls = await prisma.andonCall.findMany({
      where,
      include: andonCallInclude,
      orderBy: [{ finishedAt: "desc" }, { openedAt: "desc" }],
      take: parseLimit(request.query.limit),
    });

    return enrichCallsWithAssetSnapshots(calls);
  });

  app.post<{ Body: OpenAndonCallBody }>("/api/andon-calls", async (request, reply) => {
    const body = request.body ?? {};
    const machineId = body.machineId === undefined ? undefined : String(body.machineId);
    const machineSetId = optionalString(body.machineSetId);
    const machineSubsetId = optionalString(body.machineSubsetId);
    const category = optionalString(body.category);
    const subtype = optionalString(body.subtype);
    const criticality = optionalString(body.criticality) ?? "medium";
    const description = optionalString(body.description);
    const createdBy = optionalString(body.createdBy);
    const origin = optionalString(body.origin) ?? "kiosk";
    const isSystemTest = body.isSystemTest === true;
    const machineCondition = optionalString(body.machineCondition);
    const workOrderNumber = normalizeWorkOrderNumber(body.workOrderNumber);
    const operatorNote = normalizeOperatorNote(body.operatorNote);

    if (!machineId) return badRequest(reply, "Campo machineId é obrigatório");
    if (!category) return badRequest(reply, "Campo category é obrigatório");
    if (!CALL_CATEGORIES.has(category)) return badRequest(reply, "Categoria inválida");
    if (!subtype) return badRequest(reply, "Tipo de chamado inválido");
    if (!CALL_CRITICALITIES.has(criticality)) return badRequest(reply, "Criticidade inválida");
    if (!CALL_ORIGINS.has(origin)) return badRequest(reply, "Origem do chamado inválida");

    const usesInstallerHealthMetadata = origin === INSTALLER_HEALTH_ORIGIN || isSystemTest;

    const hasValidInstallerHealthMetadata =
      origin === INSTALLER_HEALTH_ORIGIN &&
      isSystemTest &&
      createdBy === INSTALLER_HEALTH_CREATED_BY;

    if (usesInstallerHealthMetadata && !hasValidInstallerHealthMetadata) {
      return badRequest(reply, "Metadados de teste automático inválidos");
    }
    if (machineCondition && !MACHINE_STATUSES.has(machineCondition))
      return badRequest(reply, "Condição da máquina inválida");
    if (workOrderNumber && workOrderNumber.length > MAX_WORK_ORDER_NUMBER_LENGTH) {
      return badRequest(reply, "Número da OS deve ter no máximo 100 caracteres");
    }
    if (operatorNote && operatorNote.length > MAX_OPERATOR_NOTE_LENGTH) {
      return badRequest(reply, "Informação do operador deve ter no máximo 500 caracteres");
    }
    const configuredCategory = await prisma.andonCategory.findUnique({ where: { id: subtype } });
    if (!configuredCategory || (!configuredCategory.active && !isSystemTest)) {
      return badRequest(reply, "Setor inválido ou inativo");
    }
    if (configuredCategory.categoryGroup !== category) {
      return badRequest(reply, "Setor incompatível com a categoria");
    }

    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) return notFound(reply, "Máquina não encontrada");
    if (machineSubsetId && !machineSetId) {
      return badRequest(reply, "machineSetId é obrigatório quando machineSubsetId for informado");
    }

    const machineSet = machineSetId
      ? await findActiveMachineSetForCall(machineId, machineSetId)
      : null;

    if (machineSetId && !machineSet) {
      return badRequest(reply, "Conjunto inválido ou inativo para esta máquina");
    }

    const machineSubset =
      machineSetId && machineSubsetId
        ? await findActiveMachineSubsetForCall(machineSetId, machineSubsetId)
        : null;

    if (machineSubsetId && !machineSubset) {
      return badRequest(
        reply,
        "Subconjunto inválido, inativo ou não pertence ao conjunto selecionado",
      );
    }

    if (!isSystemTest && machineSet && !machineSubset && !(await allowsWholeSetCalls())) {
      const activeSubsetCount = await prisma.machineSubset.count({
        where: {
          machineSetId: machineSet.id,
          isActive: true,
          subsetType: { isActive: true },
        },
      });

      if (activeSubsetCount > 0) {
        return badRequest(
          reply,
          "Selecione um subconjunto ou equipamento para abrir o ANDON neste conjunto",
        );
      }
    }

    const now = new Date();
    try {
      const call = await prisma.$transaction(async (tx) => {
        await lockMachineCallFlow(tx, machineId);
        const lockedMachine = await tx.machine.findUnique({ where: { id: machineId } });
        if (!lockedMachine) throw new AndonCallValidationError("Máquina não encontrada");
        if (!isSystemTest && !lockedMachine.isActive) {
          throw new AndonCallValidationError("Máquina inativa para abertura de chamados");
        }
        if (
          !isSystemTest &&
          (await requiresWorkOrderAtOpen(lockedMachine.requireWorkOrderAtOpen)) &&
          !workOrderNumber
        ) {
          throw new AndonCallValidationError("Informe o número da OS para abrir o chamado");
        }
        if (!isSystemTest && (await findDuplicateActiveSectorCall(tx, machineId, subtype))) {
          throw new AndonCallValidationError(
            "Já existe um chamado ativo deste setor para a máquina",
          );
        }

        const failureState = !isSystemTest
          ? await getOpenFailureState(tx, machineId)
          : { openEvents: [], activeOwnerEvent: null };
        const mustInheritActiveStop = Boolean(
          lockedMachine.machineStatus === "stopped" && failureState.activeOwnerEvent,
        );

        const effectiveMachineCondition = mustInheritActiveStop
          ? "stopped"
          : (machineCondition ?? lockedMachine.machineStatus);

        if (
          !isSystemTest &&
          lockedMachine.machineStatus === "stopped" &&
          !failureState.activeOwnerEvent &&
          effectiveMachineCondition === "running"
        ) {
          await closeOpenFailureEventsForRecovery(tx, failureState.openEvents, now);
        }

        const createdCall = await tx.andonCall.create({
          data: {
            machineId,
            category,
            subtype,
            workOrderNumber: workOrderNumber ?? null,
            operatorNote: isSystemTest ? null : (operatorNote ?? null),
            status: "open",
            criticality,
            machineCondition: effectiveMachineCondition,
            openedAt: now,
            callWaitingMinutes: 0,
            attendanceMinutes: 0,
            postMaintenanceMinutes: 0,
            totalCallMinutes: 0,
            machineStoppedMinutes: 0,
            impactTrackingVersion: isSystemTest ? null : 1,
            notes: description ?? null,
            createdBy,
            origin,
            isSystemTest,
            productionModeAtOpen: lockedMachine.productionMode,
            machineStatusAtOpen: effectiveMachineCondition,
          },
        });

        if (machineSet) {
          await tx.$executeRaw(Prisma.sql`
          UPDATE "andon_calls"
          SET
            "machineSetId" = ${machineSet.id},
            "machineSetCodeSnapshot" = ${machineSet.code},
            "machineSetNameSnapshot" = ${machineSet.name},
            "machineSetTypeSnapshot" = ${machineSet.type},
            "machineSubsetId" = ${machineSubset?.id ?? null},
            "machineSubsetCodeSnapshot" = ${machineSubset?.code ?? null},
            "machineSubsetNameSnapshot" = ${machineSubset?.name ?? null},
            "machineSubsetTypeSnapshot" = ${machineSubset?.type ?? null}
          WHERE "id" = ${createdCall.id}
        `);
        }

        const failureStartedAt =
          !isSystemTest && effectiveMachineCondition === "stopped"
            ? await ensureOpenFailureEventForStoppedCall(tx, {
                machineId,
                callId: createdCall.id,
                startedAt: now,
                productionMode: lockedMachine.productionMode,
                existingEventId:
                  failureState.activeOwnerEvent?.id ?? failureState.openEvents[0]?.id,
                claimExistingEvent: !failureState.activeOwnerEvent,
              })
            : null;

        if (
          !isSystemTest &&
          effectiveMachineCondition === "stopped" &&
          !failureState.activeOwnerEvent
        ) {
          await ensureOpenCallImpactInterval(tx, {
            callId: createdCall.id,
            machineId,
            startedAt: now,
            source: "call_opened_stopped",
            notes: "Chamado informou a parada da máquina",
          });
        }

        if (!isSystemTest) {
          const machineStatusChanged = effectiveMachineCondition !== lockedMachine.machineStatus;

          await tx.machine.update({
            where: { id: machineId },
            data: {
              andonStatus: "open",
              currentCallId: createdCall.id,
              ...(machineStatusChanged
                ? {
                    machineStatus: effectiveMachineCondition,
                    lastStatusChangedAt: failureStartedAt ?? now,
                  }
                : {}),
            },
          });
        }

        const createdCallWithSessions = await findCallWithSessions(tx, createdCall.id);
        return attachAssetSnapshots(createdCallWithSessions, machineSet, machineSubset);
      });

      return reply.status(201).send(call);
    } catch (error) {
      if (error instanceof AndonCallValidationError) return badRequest(reply, error.message);
      throw error;
    }
  });

  app.post<{ Body: BatchOpenAndonCallsBody }>("/api/andon-calls/batch", async (request, reply) => {
    const body = request.body ?? {};
    const machineId = body.machineId === undefined ? undefined : String(body.machineId);
    const subtypes = Array.isArray(body.subtypes)
      ? Array.from(
          new Set(
            body.subtypes
              .map(optionalString)
              .filter((subtype): subtype is string => Boolean(subtype)),
          ),
        )
      : [];
    const criticality = optionalString(body.criticality) ?? "medium";
    const machineCondition = optionalString(body.machineCondition);
    const workOrderNumber = normalizeWorkOrderNumber(body.workOrderNumber);
    const operatorNote = normalizeOperatorNote(body.operatorNote);

    if (!machineId) return badRequest(reply, "Campo machineId é obrigatório");
    if (!subtypes.length || subtypes.length > 20) {
      return badRequest(reply, "Selecione de um a vinte setores para abrir os chamados");
    }
    if (!CALL_CRITICALITIES.has(criticality)) return badRequest(reply, "Criticidade inválida");
    if (machineCondition && !MACHINE_STATUSES.has(machineCondition)) {
      return badRequest(reply, "Condição da máquina inválida");
    }
    if (workOrderNumber && workOrderNumber.length > MAX_WORK_ORDER_NUMBER_LENGTH) {
      return badRequest(reply, "Número da OS deve ter no máximo 100 caracteres");
    }
    if (operatorNote && operatorNote.length > MAX_OPERATOR_NOTE_LENGTH) {
      return badRequest(reply, "Informação do operador deve ter no máximo 500 caracteres");
    }
    try {
      const calls = await prisma.$transaction(async (tx) => {
        await lockMachineCallFlow(tx, machineId);
        const machine = await tx.machine.findUnique({ where: { id: machineId } });
        if (!machine) throw new AndonCallValidationError("Máquina não encontrada");
        if (!machine.isActive) {
          throw new AndonCallValidationError("Máquina inativa para abertura de chamados");
        }
        if ((await requiresWorkOrderAtOpen(machine.requireWorkOrderAtOpen)) && !workOrderNumber) {
          throw new AndonCallValidationError("Informe o número da OS para abrir o chamado");
        }

        const failureState = await getOpenFailureState(tx, machineId);
        const mustInheritActiveStop = Boolean(
          machine.machineStatus === "stopped" && failureState.activeOwnerEvent,
        );

        const effectiveMachineCondition = mustInheritActiveStop
          ? "stopped"
          : (machineCondition ?? machine.machineStatus);

        if (
          machine.machineStatus === "stopped" &&
          !failureState.activeOwnerEvent &&
          effectiveMachineCondition === "running"
        ) {
          await closeOpenFailureEventsForRecovery(tx, failureState.openEvents, new Date());
        }

        const configuredCategories = await tx.andonCategory.findMany({
          where: { id: { in: subtypes }, active: true },
        });
        const categoryBySubtype = new Map(
          configuredCategories.map((category) => [category.id, category]),
        );
        if (configuredCategories.length !== subtypes.length) {
          throw new AndonCallValidationError("Um ou mais setores são inválidos ou estão inativos");
        }

        for (const subtype of subtypes) {
          if (await findDuplicateActiveSectorCall(tx, machineId, subtype)) {
            const displayName = categoryBySubtype.get(subtype)?.displayName ?? subtype;
            throw new AndonCallValidationError(
              `Já existe um chamado ativo do setor ${displayName} para esta máquina`,
            );
          }
        }

        const baseOpenedAt = new Date();
        const createdCalls = [];
        let stopOwnerAssigned = Boolean(failureState.activeOwnerEvent);

        for (const [index, subtype] of subtypes.entries()) {
          const openedAt = new Date(baseOpenedAt.getTime() + index);
          const createdCall = await tx.andonCall.create({
            data: {
              machineId,
              category: categoryBySubtype.get(subtype)?.categoryGroup ?? "maintenance",
              subtype,
              workOrderNumber,
              operatorNote: operatorNote ?? null,
              status: "open",
              criticality,
              machineCondition: effectiveMachineCondition,
              openedAt,
              callWaitingMinutes: 0,
              attendanceMinutes: 0,
              postMaintenanceMinutes: 0,
              totalCallMinutes: 0,
              machineStoppedMinutes: 0,
              impactTrackingVersion: 1,
              createdBy: "kiosk",
              origin: "kiosk",
              isSystemTest: false,
              productionModeAtOpen: machine.productionMode,
              machineStatusAtOpen: effectiveMachineCondition,
            },
          });

          if (effectiveMachineCondition === "stopped") {
            await ensureOpenFailureEventForStoppedCall(tx, {
              machineId,
              callId: createdCall.id,
              startedAt: openedAt,
              productionMode: machine.productionMode,
              existingEventId: failureState.activeOwnerEvent?.id ?? failureState.openEvents[0]?.id,
              claimExistingEvent: !stopOwnerAssigned,
            });
            stopOwnerAssigned = true;

            if (!failureState.activeOwnerEvent && index === 0) {
              await ensureOpenCallImpactInterval(tx, {
                callId: createdCall.id,
                machineId,
                startedAt: openedAt,
                source: "call_opened_stopped",
                notes: "Primeiro chamado do lote informou a parada da máquina",
              });
            }
          }

          createdCalls.push(await findCallWithSessions(tx, createdCall.id));
        }

        const referenceCall = createdCalls.at(-1);
        if (!referenceCall) throw new AndonCallValidationError("Nenhum chamado foi criado");

        const machineStatusChanged = effectiveMachineCondition !== machine.machineStatus;

        await tx.machine.update({
          where: { id: machineId },
          data: {
            andonStatus: "open",
            currentCallId: referenceCall.id,
            ...(machineStatusChanged
              ? {
                  machineStatus: effectiveMachineCondition,
                  lastStatusChangedAt: baseOpenedAt,
                }
              : {}),
          },
        });

        return createdCalls;
      });

      return reply.status(201).send(calls);
    } catch (error) {
      if (error instanceof AndonCallValidationError) return badRequest(reply, error.message);
      throw error;
    }
  });

  app.patch<{ Params: { id: string }; Body: AttendAndonCallBody }>(
    "/api/andon-calls/:id/attend",
    async (request, reply) => {
      const body = request.body ?? {};
      const call = await prisma.andonCall.findUnique({
        include: { machine: true },
        where: { id: request.params.id },
      });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if (call.status !== "open") return badRequest(reply, "Chamado não está aberto");

      try {
        const updatedCall = await prisma.$transaction(async (tx) => {
          await lockMachineCallFlow(tx, call.machineId);
          let currentCall = await tx.andonCall.findUnique({
            include: { machine: true },
            where: { id: call.id },
          });
          if (!currentCall || currentCall.status !== "open") {
            throw new AndonCallValidationError("Chamado não está aberto");
          }

          const workstationId =
            currentCall.category === "maintenance"
              ? await resolveAttendanceWorkstationId(tx, {
                  workstationHeader: request.headers["x-andon-workstation-id"],
                  isSystemTest: currentCall.isSystemTest,
                })
              : null;
          const technicians = await resolveAttendanceTechnicians(tx, currentCall, body);
          const missingTechnicians = await lockAndFindMissingActiveTechnicians(tx, {
            callId: currentCall.id,
            technicians,
          });

          currentCall = await tx.andonCall.findUnique({
            include: { machine: true },
            where: { id: call.id },
          });
          if (!currentCall || currentCall.status !== "open") {
            throw new AndonCallValidationError("Chamado não está aberto");
          }

          const transitionAt = new Date();
          const names = technicians.map((technician) => technician.name);
          const technicianArea = currentCall.subtype ?? currentCall.technicianArea;

          await tx.andonCall.update({
            where: { id: currentCall.id },
            data: {
              status: "in_progress",
              attendedAt: currentCall.attendedAt ?? transitionAt,
              currentAttendanceStartedAt: transitionAt,
              technicianName: names[0] ?? currentCall.technicianName,
              technicianNames: names.length
                ? uniqueNames([...currentCall.technicianNames, ...names])
                : currentCall.technicianNames,
              technicianArea,
              productionModeAtAttend: currentCall.machine.productionMode,
              machineStatusAtAttend: currentCall.machine.machineStatus,
            },
          });

          await createTechnicianSessions(tx, {
            callId: currentCall.id,
            machineId: currentCall.machineId,
            technicians: missingTechnicians,
            startedAt: transitionAt,
            productionModeAtStart: currentCall.machine.productionMode,
            machineStatusAtStart: currentCall.machine.machineStatus,
            workstationId,
            technicalArea: currentCall.subtype,
            phase: "maintenance",
            cycleIndex: currentCall.maintenanceReturnCount + 1,
          });

          if (!currentCall.isSystemTest) {
            await syncMachineOperationalState(tx, currentCall.machineId);
          }
          return findCallWithSessions(tx, currentCall.id);
        });

        return updatedCall;
      } catch (error) {
        if (
          error instanceof AndonCallValidationError ||
          error instanceof WorkstationAuthorizationError
        ) {
          return badRequest(reply, error.message);
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: CancelAndonCallBody }>(
    "/api/andon-calls/:id/cancel",
    async (request, reply) => {
      const reason = optionalString(request.body?.reason);
      if (!reason) return badRequest(reply, "Justificativa do cancelamento é obrigatória.");

      const call = await prisma.andonCall.findUnique({
        include: { technicianSessions: true },
        where: { id: request.params.id },
      });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if (call.status !== "open")
        return badRequest(reply, "Não é possível cancelar chamado já atendido.");

      const hasTechnician = Boolean(
        call.technicianName || call.technicianNames.length || call.technicianArea,
      );
      const hasAttendance = Boolean(
        call.attendedAt || call.currentAttendanceStartedAt || call.technicianSessions.length,
      );
      if (hasTechnician || hasAttendance) {
        return badRequest(reply, "Não é possível cancelar chamado já atendido.");
      }

      const cancelledBy = optionalString(request.body?.cancelledBy);
      const cancellationNoteParts = [
        `Motivo: ${reason}`,
        cancelledBy ? `Cancelado por: ${cancelledBy}` : undefined,
      ].filter((part): part is string => Boolean(part));
      const cancellationNote = cancellationNoteParts.length
        ? cancellationNoteParts.join(" | ")
        : undefined;

      let updatedCall;
      try {
        updatedCall = await prisma.$transaction(async (tx) => {
          await lockMachineCallFlow(tx, call.machineId);

          const currentCall = await tx.andonCall.findUnique({
            include: { technicianSessions: true },
            where: { id: call.id },
          });
          if (!currentCall) {
            throw new AndonCallValidationError("Chamado não encontrado");
          }

          const currentHasTechnician = Boolean(
            currentCall.technicianName ||
              currentCall.technicianNames.length ||
              currentCall.technicianArea,
          );
          const currentHasAttendance = Boolean(
            currentCall.attendedAt ||
              currentCall.currentAttendanceStartedAt ||
              currentCall.technicianSessions.length,
          );
          if (
            currentCall.status !== "open" ||
            currentHasTechnician ||
            currentHasAttendance
          ) {
            throw new AndonCallValidationError(
              "Não é possível cancelar chamado já atendido.",
            );
          }

          const now = new Date();
          const currentMachine = await tx.machine.findUnique({
            where: { id: currentCall.machineId },
            select: { machineStatus: true },
          });
          if (!currentMachine) {
            throw new AndonCallValidationError("Máquina não encontrada");
          }

          const finalMachineStatus = currentCall.isSystemTest
            ? currentCall.machineStatusAtOpen
            : await resumeMachineWhenFinishingOwnedStop(tx, {
                callId: currentCall.id,
                machineId: currentCall.machineId,
                currentMachineStatus: currentMachine.machineStatus,
                finishedAt: now,
                requireStatusConfirmation: false,
              });
          const machineStoppedMinutes = currentCall.isSystemTest
            ? 0
            : currentCall.impactTrackingVersion === 1
              ? await calculateCallImpactMinutes(tx, currentCall.id, now)
              : await calculateStoppedMinutesForPeriod(
                  tx,
                  currentCall.machineId,
                  currentCall.openedAt,
                  now,
                );

          await tx.andonCall.update({
            where: { id: currentCall.id },
            data: {
              status: "cancelled",
              finishedAt: now,
              currentAttendanceStartedAt: null,
              callWaitingMinutes: diffMinutes(currentCall.openedAt, now),
              attendanceMinutes: 0,
              postMaintenanceMinutes: 0,
              totalCallMinutes: diffMinutes(currentCall.openedAt, now),
              machineStoppedMinutes,
              productionModeAtFinish: currentCall.productionModeAtOpen,
              machineStatusAtFinish: finalMachineStatus,
              cancelReason: reason,
              notes: appendNote(currentCall.notes, cancellationNote, "Cancelamento"),
            },
          });

          if (!currentCall.isSystemTest) {
            await syncMachineOperationalState(tx, currentCall.machineId);
          }

          return findCallWithSessions(tx, currentCall.id);
        });
      } catch (error) {
        if (error instanceof AndonCallValidationError) {
          return badRequest(reply, error.message);
        }
        throw error;
      }

      const [enrichedCall] = await enrichCallsWithAssetSnapshots(updatedCall ? [updatedCall] : []);
      return reply.send(
        enrichedCall ?? {
          id: call.id,
          machineId: call.machineId,
          status: "cancelled",
          reason,
          cancelledBy,
        },
      );
    },
  );

  app.post<{ Params: { id: string }; Body: AddTechnicianBody }>(
    "/api/andon-calls/:id/technicians",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({
        include: { machine: true },
        where: { id: request.params.id },
      });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if (call.status !== "in_progress" && call.status !== "post_maintenance") {
        return badRequest(reply, "Chamado não está em atendimento ou acompanhamento");
      }

      try {
        const updatedCall = await prisma.$transaction(async (tx) => {
          await lockMachineCallFlow(tx, call.machineId);
          let currentCall = await tx.andonCall.findUnique({
            include: { machine: true },
            where: { id: call.id },
          });
          if (
            !currentCall ||
            (currentCall.status !== "in_progress" && currentCall.status !== "post_maintenance")
          ) {
            throw new AndonCallValidationError("Chamado não está em atendimento ou acompanhamento");
          }

          const workstationId =
            currentCall.category === "maintenance"
              ? await resolveAttendanceWorkstationId(tx, {
                  workstationHeader: request.headers["x-andon-workstation-id"],
                  isSystemTest:
                    currentCall.isSystemTest || currentCall.status === "post_maintenance",
                })
              : null;
          const technicians = await resolveAttendanceTechnicians(
            tx,
            currentCall,
            request.body ?? {},
          );
          const missingTechnicians = await lockAndFindMissingActiveTechnicians(tx, {
            callId: currentCall.id,
            technicians,
          });

          currentCall = await tx.andonCall.findUnique({
            include: { machine: true },
            where: { id: call.id },
          });
          if (
            !currentCall ||
            (currentCall.status !== "in_progress" && currentCall.status !== "post_maintenance")
          ) {
            throw new AndonCallValidationError("Chamado não está em atendimento ou acompanhamento");
          }

          const transitionAt = new Date();
          const names = technicians.map((technician) => technician.name);

          await createTechnicianSessions(tx, {
            callId: currentCall.id,
            machineId: currentCall.machineId,
            technicians: missingTechnicians,
            startedAt: transitionAt,
            productionModeAtStart: currentCall.machine.productionMode,
            machineStatusAtStart: currentCall.machine.machineStatus,
            workstationId,
            technicalArea: currentCall.subtype,
            phase: currentCall.status === "post_maintenance" ? "follow_up" : "maintenance",
            cycleIndex: currentCall.maintenanceReturnCount + 1,
          });

          await tx.andonCall.update({
            where: { id: currentCall.id },
            data: {
              technicianName: currentCall.technicianName ?? names[0],
              technicianNames: uniqueNames([...currentCall.technicianNames, ...names]),
              technicianArea: currentCall.technicianArea ?? currentCall.subtype,
            },
          });

          return findCallWithSessions(tx, currentCall.id);
        });

        return reply.status(201).send(updatedCall);
      } catch (error) {
        if (
          error instanceof AndonCallValidationError ||
          error instanceof WorkstationAuthorizationError
        ) {
          return badRequest(reply, error.message);
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string; technicianName: string }; Body: EndTechnicianBody }>(
    "/api/andon-calls/:id/technicians/:technicianName/end",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if ((await getAttendanceMode()) !== "name") {
        return badRequest(reply, "Identifique o mantenedor por PIN ou tag");
      }

      const technicianName = decodeURIComponent(request.params.technicianName);
      try {
        return await prisma.$transaction((tx) =>
          endActiveTechnicianSession(tx, {
            callId: call.id,
            technicianName,
            reason: optionalString(request.body?.reason),
          }),
        );
      } catch (error) {
        if (
          error instanceof ActiveTechnicianSessionNotFoundError ||
          error instanceof FinishCallNotFoundError
        ) {
          return notFound(reply, error.message);
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: EndTechnicianBody }>(
    "/api/andon-calls/:id/technicians/end",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
      if (!call) return notFound(reply, "Chamado não encontrado");

      const attendanceMode = await getAttendanceMode();
      const requestedName = optionalString(request.body?.technicianName);
      const credential = request.body?.credential;
      const identified = credential ? await identifyTechnician(credential) : null;

      if (credential && !identified) {
        return notFound(reply, "PIN ou tag não reconhecido para um mantenedor ativo");
      }
      if (!identified && attendanceMode !== "name") {
        return badRequest(reply, "Identifique o mantenedor por PIN ou tag");
      }
      if (!identified && !requestedName) {
        return badRequest(reply, "Selecione o mantenedor em atendimento");
      }

      try {
        return await prisma.$transaction((tx) =>
          endActiveTechnicianSession(tx, {
            callId: call.id,
            technicianId: identified?.id,
            technicianName: requestedName,
            reason: optionalString(request.body?.reason),
            notes: optionalString(request.body?.notes),
          }),
        );
      } catch (error) {
        if (
          error instanceof ActiveTechnicianSessionNotFoundError ||
          error instanceof FinishCallNotFoundError
        ) {
          return notFound(reply, error.message);
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: NotesBody }>(
    "/api/andon-calls/:id/finish-maintenance",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({
        include: { machine: true },
        where: { id: request.params.id },
      });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if (call.category !== "maintenance") {
        return badRequest(reply, "Apenas chamados de manutenção podem entrar em acompanhamento");
      }
      if (call.status !== "in_progress") {
        return badRequest(reply, "Chamado não está em atendimento");
      }

      try {
        const updatedCall = await prisma.$transaction(async (tx) => {
          await lockMachineCallFlow(tx, call.machineId);
          let currentCall = await tx.andonCall.findUnique({
            include: { machine: true, technicianSessions: true },
            where: { id: call.id },
          });
          if (!currentCall || currentCall.status !== "in_progress") {
            throw new AndonCallValidationError("Chamado não está em atendimento");
          }

          const sessionsToLock = currentCall.technicianSessions.filter(
            (session) =>
              !session.endedAt && (session.phase === "maintenance" || session.phase === null),
          );
          const technicianIds = Array.from(
            new Set(
              sessionsToLock
                .map((session) => session.technicianId)
                .filter((technicianId): technicianId is string => Boolean(technicianId)),
            ),
          ).sort();
          for (const technicianId of technicianIds) {
            await lockTechnicianSessionFlow(tx, technicianId);
          }

          currentCall = await tx.andonCall.findUnique({
            include: { machine: true, technicianSessions: true },
            where: { id: call.id },
          });
          if (!currentCall || currentCall.status !== "in_progress") {
            throw new AndonCallValidationError("Chamado não está em atendimento");
          }

          await assertMaintenanceCompletionWorkstation(tx, {
            callId: currentCall.id,
            workstationHeader: request.headers["x-andon-workstation-id"],
            isSystemTest: currentCall.isSystemTest,
          });

          const activeMaintenanceSessions = currentCall.technicianSessions.filter(
            (session) =>
              !session.endedAt && (session.phase === "maintenance" || session.phase === null),
          );
          const rawFollowUpSessionIds = request.body?.followUpSessionIds;
          if (
            rawFollowUpSessionIds !== undefined &&
            (!Array.isArray(rawFollowUpSessionIds) ||
              rawFollowUpSessionIds.some(
                (sessionId) => typeof sessionId !== "string" || !sessionId.trim(),
              ))
          ) {
            throw new AndonCallValidationError(
              "Seleção de mantenedores para acompanhamento é inválida",
            );
          }
          const requestedFollowUpSessionIds = Array.isArray(rawFollowUpSessionIds)
            ? Array.from(
                new Set(
                  rawFollowUpSessionIds
                    .map(optionalString)
                    .filter((sessionId): sessionId is string => Boolean(sessionId)),
                ),
              )
            : undefined;
          const activeSessionIds = new Set(activeMaintenanceSessions.map((session) => session.id));
          if (requestedFollowUpSessionIds?.some((sessionId) => !activeSessionIds.has(sessionId))) {
            throw new AndonCallValidationError(
              "Seleção de mantenedores para acompanhamento é inválida",
            );
          }
          const followUpSessionIds = new Set(
            requestedFollowUpSessionIds ?? activeMaintenanceSessions.map((session) => session.id),
          );
          const transitionAt = new Date();

          if (activeMaintenanceSessions.length) {
            await tx.technicianSession.updateMany({
              where: {
                id: { in: activeMaintenanceSessions.map((session) => session.id) },
                endedAt: null,
              },
              data: {
                endedAt: transitionAt,
                endReason: "maintenance_completed",
                productionModeAtEnd: currentCall.machine.productionMode,
                machineStatusAtEnd: currentCall.machine.machineStatus,
              },
            });

            const continuingSessions = activeMaintenanceSessions.filter((session) =>
              followUpSessionIds.has(session.id),
            );
            if (continuingSessions.length) {
              await tx.technicianSession.createMany({
                data: continuingSessions.map((session) => ({
                  callId: session.callId,
                  machineId: session.machineId,
                  technicianId: session.technicianId,
                  technicianName: session.technicianName,
                  technicalArea: session.technicalArea,
                  shiftId: session.shiftId,
                  shiftName: session.shiftName,
                  workstationId: session.workstationId,
                  phase: "follow_up",
                  cycleIndex: session.cycleIndex ?? currentCall.maintenanceReturnCount + 1,
                  startedAt: transitionAt,
                  productionModeAtStart: currentCall.machine.productionMode,
                  machineStatusAtStart: currentCall.machine.machineStatus,
                })),
              });
            }
          }

          await tx.andonCall.update({
            where: { id: currentCall.id },
            data: {
              status: "post_maintenance",
              currentAttendanceStartedAt: null,
              maintenanceCompletedAt: transitionAt,
              attendanceMinutes:
                (currentCall.attendanceMinutes ?? 0) +
                diffPreciseMinutes(
                  currentCall.currentAttendanceStartedAt ?? currentCall.attendedAt,
                  transitionAt,
                ),
              notes: appendNote(
                currentCall.notes,
                optionalString(request.body?.notes),
                "Conclusão da manutenção",
              ),
            },
          });
          if (!currentCall.isSystemTest) {
            await syncMachineOperationalState(tx, currentCall.machineId);
          }
          return findCallWithSessions(tx, currentCall.id);
        });

        return updatedCall;
      } catch (error) {
        if (
          error instanceof AndonCallValidationError ||
          error instanceof WorkstationAuthorizationError
        ) {
          return badRequest(reply, error.message);
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: ReturnToMaintenanceBody }>(
    "/api/andon-calls/:id/return-to-maintenance",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if (call.category !== "maintenance") {
        return badRequest(reply, "Apenas chamados de manutenção podem voltar ao atendimento");
      }
      if (call.status !== "post_maintenance") {
        return badRequest(reply, "Chamado não está em acompanhamento");
      }

      const updatedCall = await prisma.$transaction(async (tx) => {
        await lockMachineCallFlow(tx, call.machineId);
        let currentCall = await tx.andonCall.findUnique({
          where: { id: call.id },
          include: { machine: true, technicianSessions: true },
        });
        if (!currentCall || currentCall.status !== "post_maintenance") {
          return null;
        }
        const sessionsToLock = currentCall.technicianSessions.filter(
          (session) =>
            !session.endedAt && (session.phase === "follow_up" || session.phase === null),
        );
        const technicianIds = Array.from(
          new Set(
            sessionsToLock
              .map((session) => session.technicianId)
              .filter((technicianId): technicianId is string => Boolean(technicianId)),
          ),
        ).sort();
        for (const technicianId of technicianIds) {
          await lockTechnicianSessionFlow(tx, technicianId);
        }

        currentCall = await tx.andonCall.findUnique({
          where: { id: call.id },
          include: { machine: true, technicianSessions: true },
        });
        if (!currentCall || currentCall.status !== "post_maintenance") {
          return null;
        }
        const activeFollowUpSessions = currentCall.technicianSessions.filter(
          (session) =>
            !session.endedAt && (session.phase === "follow_up" || session.phase === null),
        );
        const transitionAt = new Date();

        if (activeFollowUpSessions.length) {
          await tx.technicianSession.updateMany({
            where: {
              id: { in: activeFollowUpSessions.map((session) => session.id) },
              endedAt: null,
            },
            data: {
              endedAt: transitionAt,
              endReason: "returned_to_maintenance",
              productionModeAtEnd: currentCall.machine.productionMode,
              machineStatusAtEnd: currentCall.machine.machineStatus,
            },
          });
          await tx.technicianSession.createMany({
            data: activeFollowUpSessions.map((session) => ({
              callId: session.callId,
              machineId: session.machineId,
              technicianId: session.technicianId,
              technicianName: session.technicianName,
              technicalArea: session.technicalArea,
              shiftId: session.shiftId,
              shiftName: session.shiftName,
              workstationId: session.workstationId,
              phase: "maintenance",
              cycleIndex: currentCall.maintenanceReturnCount + 2,
              startedAt: transitionAt,
              productionModeAtStart: currentCall.machine.productionMode,
              machineStatusAtStart: currentCall.machine.machineStatus,
            })),
          });
        }
        await tx.andonCall.update({
          where: { id: currentCall.id },
          data: {
            status: "in_progress",
            currentAttendanceStartedAt: transitionAt,
            maintenanceCompletedAt: null,
            postMaintenanceMinutes:
              (currentCall.postMaintenanceMinutes ?? 0) +
              diffPreciseMinutes(currentCall.maintenanceCompletedAt, transitionAt),
            maintenanceReturnCount: { increment: 1 },
            notes: appendNote(
              currentCall.notes,
              optionalString(request.body?.reason),
              "Retorno à manutenção",
            ),
          },
        });
        if (!currentCall.isSystemTest) {
          await syncMachineOperationalState(tx, currentCall.machineId);
        }
        return findCallWithSessions(tx, currentCall.id);
      });

      if (!updatedCall) return badRequest(reply, "Chamado não está em acompanhamento");
      return updatedCall;
    },
  );

  app.patch<{ Params: { id: string }; Body: FinishAndonCallBody }>(
    "/api/andon-calls/:id/finish",
    async (request, reply) => {
      const body = request.body ?? {};
      const requestedMachineStatus = optionalString(body.machineStatus);
      const requestedImpactCallIds = Array.isArray(body.impactCallIds)
        ? Array.from(
            new Set(
              body.impactCallIds
                .map(optionalString)
                .filter((callId): callId is string => Boolean(callId)),
            ),
          )
        : [];
      const confirmedMachineSetId = optionalString(body.confirmedMachineSetId);
      const confirmedMachineSubsetId = optionalString(body.confirmedMachineSubsetId);
      const assetChangeReason = optionalString(body.assetChangeReason);
      const finalDescription =
        optionalString(body.notes) ?? optionalString(body.failureDescription);

      if (requestedMachineStatus && !MACHINE_STATUSES.has(requestedMachineStatus)) {
        return badRequest(reply, "Status operacional inválido");
      }

      if (confirmedMachineSubsetId && !confirmedMachineSetId) {
        return badRequest(
          reply,
          "confirmedMachineSetId é obrigatório quando confirmedMachineSubsetId for informado",
        );
      }

      try {
        const updatedCall = await prisma.$transaction(async (tx) => {
          const callReference = await tx.andonCall.findUnique({
            where: { id: request.params.id },
            select: { machineId: true },
          });

          if (!callReference) {
            throw new FinishCallNotFoundError("Chamado não encontrado");
          }

          await lockMachineCallFlow(tx, callReference.machineId);

          const call = await tx.andonCall.findUnique({
            include: {
              machine: true,
              technicianSessions: {
                orderBy: {
                  startedAt: "asc",
                },
              },
            },
            where: {
              id: request.params.id,
            },
          });

          if (!call) {
            throw new FinishCallNotFoundError("Chamado não encontrado");
          }

          if (call.status === "finished" || call.status === "cancelled") {
            throw new FinishCallValidationError("Chamado já está encerrado");
          }

          if (!call.isSystemTest) {
            if (call.category === "maintenance" && call.status !== "post_maintenance") {
              throw new FinishCallValidationError(
                "Chamado de manutenção deve concluir a manutenção antes da finalização",
              );
            }
            if (call.category === "production" && call.status !== "in_progress") {
              throw new FinishCallValidationError(
                "Chamado de produção deve estar em atendimento para ser finalizado",
              );
            }
          }

          const openFailureEvent = await tx.failureEvent.findFirst({
            where: {
              callId: call.id,
              endedAt: null,
            },
            orderBy: { startedAt: "desc" },
          });

          const applicableFailureEvent =
            openFailureEvent ??
            (await tx.failureEvent.findFirst({
              where: { callId: call.id },
              orderBy: { startedAt: "desc" },
            }));

          const failureClassification = optionalString(body.failureClassification);
          const resolvedFailureDescription =
            optionalString(body.failureDescription) ?? optionalString(body.notes);

          if (!call.isSystemTest) {
            if (!failureClassification) {
              throw new FinishCallValidationError("Classificação da falha é obrigatória");
            }
            if (GENERIC_FAILURE_CLASSIFICATIONS.has(failureClassification)) {
              throw new FinishCallValidationError("Selecione uma classificação específica da falha");
            }
            if (!resolvedFailureDescription) {
              throw new FinishCallValidationError("Descrição da falha é obrigatória");
            }

            const catalogClassification = await tx.failureClassification.findUnique({
              where: { value: failureClassification },
            });

            if (!catalogClassification) {
              throw new FinishCallValidationError("Classificação da falha inválida");
            }
            if (
              !catalogClassification.active &&
              applicableFailureEvent?.classification !== catalogClassification.value
            ) {
              throw new FinishCallValidationError("Classificação da falha está inativa");
            }

            if (applicableFailureEvent) {
              await tx.failureEvent.update({
                where: { id: applicableFailureEvent.id },
                data: {
                  classification: catalogClassification.value,
                  notes: resolvedFailureDescription,
                },
              });
            }
          }

          const requiresAssetConfirmation = call.category === "maintenance";

          const hasActiveSets = requiresAssetConfirmation
            ? await machineHasActiveSets(tx, call.machineId)
            : false;

          if (requiresAssetConfirmation && hasActiveSets && !confirmedMachineSetId) {
            throw new FinishCallValidationError(
              "O conjunto confirmado é obrigatório para esta máquina",
            );
          }

          const confirmedMachineSet =
            requiresAssetConfirmation && confirmedMachineSetId
              ? await findMachineSetForConfirmation(
                  tx,
                  call.machineId,
                  confirmedMachineSetId,
                  call.machineSetId,
                )
              : null;

          if (requiresAssetConfirmation && confirmedMachineSetId && !confirmedMachineSet) {
            throw new FinishCallValidationError(
              "Conjunto confirmado inválido, inativo ou não pertence à máquina",
            );
          }

          const confirmedMachineSubset =
            requiresAssetConfirmation && confirmedMachineSetId && confirmedMachineSubsetId
              ? await findMachineSubsetForConfirmation(
                  tx,
                  confirmedMachineSetId,
                  confirmedMachineSubsetId,
                  call.machineSubsetId,
                )
              : null;

          if (requiresAssetConfirmation && confirmedMachineSubsetId && !confirmedMachineSubset) {
            throw new FinishCallValidationError(
              "Subconjunto confirmado inválido, inativo ou incompatível com o conjunto",
            );
          }

          if (
            requiresAssetConfirmation &&
            !call.isSystemTest &&
            confirmedMachineSet &&
            !confirmedMachineSubset &&
            !(await allowsWholeSetCalls())
          ) {
            const activeSubsetCount = await tx.machineSubset.count({
              where: {
                machineSetId: confirmedMachineSet.id,
                isActive: true,
                subsetType: { isActive: true },
              },
            });

            if (activeSubsetCount > 0) {
              throw new FinishCallValidationError(
                "Selecione um subconjunto ou equipamento para confirmar a localização neste conjunto",
              );
            }
          }

          const preserveLegacyOpeningSnapshot =
            requiresAssetConfirmation && !hasActiveSets && !confirmedMachineSetId;

          const finalMachineSetId = confirmedMachineSet?.id ?? null;

          const finalMachineSetCodeSnapshot =
            confirmedMachineSet?.code ??
            (preserveLegacyOpeningSnapshot ? call.machineSetCodeSnapshot : null);

          const finalMachineSetNameSnapshot =
            confirmedMachineSet?.name ??
            (preserveLegacyOpeningSnapshot ? call.machineSetNameSnapshot : null);

          const finalMachineSetTypeSnapshot =
            confirmedMachineSet?.type ??
            (preserveLegacyOpeningSnapshot ? call.machineSetTypeSnapshot : null);

          const preserveLegacyOpeningSubsetSnapshot =
            preserveLegacyOpeningSnapshot && !confirmedMachineSubsetId;

          const finalMachineSubsetId = confirmedMachineSubset?.id ?? null;

          const finalMachineSubsetCodeSnapshot =
            confirmedMachineSubset?.code ??
            (preserveLegacyOpeningSubsetSnapshot ? call.machineSubsetCodeSnapshot : null);

          const finalMachineSubsetNameSnapshot =
            confirmedMachineSubset?.name ??
            (preserveLegacyOpeningSubsetSnapshot ? call.machineSubsetNameSnapshot : null);

          const finalMachineSubsetTypeSnapshot =
            confirmedMachineSubset?.type ??
            (confirmedMachineSubset?.id === call.machineSubsetId ||
            preserveLegacyOpeningSubsetSnapshot
              ? call.machineSubsetTypeSnapshot
              : null);

          const openingSetKey = assetSnapshotKey(
            call.machineSetId,
            call.machineSetCodeSnapshot,
            call.machineSetNameSnapshot,
            call.machineSetTypeSnapshot,
          );

          const confirmedSetKey = assetSnapshotKey(
            finalMachineSetId,
            finalMachineSetCodeSnapshot,
            finalMachineSetNameSnapshot,
            finalMachineSetTypeSnapshot,
          );

          const openingSubsetKey = assetSnapshotKey(
            call.machineSubsetId,
            call.machineSubsetCodeSnapshot,
            call.machineSubsetNameSnapshot,
            call.machineSubsetTypeSnapshot,
          );

          const confirmedSubsetKey = assetSnapshotKey(
            finalMachineSubsetId,
            finalMachineSubsetCodeSnapshot,
            finalMachineSubsetNameSnapshot,
            finalMachineSubsetTypeSnapshot,
          );

          const openingLocationExists = Boolean(
            requiresAssetConfirmation && (openingSetKey || openingSubsetKey),
          );
          const locationChanged = Boolean(
            openingLocationExists &&
            (openingSetKey !== confirmedSetKey || openingSubsetKey !== confirmedSubsetKey),
          );

          const assetConfirmedBy = requiresAssetConfirmation
            ? resolveAutomaticAssetConfirmedBy(call)
            : null;

          const normalizedAssetChangeReason = resolveAssetChangeReason(
            locationChanged,
            assetChangeReason,
          );

          const now = new Date();

          const finalMachineStatus = call.isSystemTest
            ? call.machine.machineStatus
            : await resumeMachineWhenFinishingOwnedStop(tx, {
                callId: call.id,
                machineId: call.machineId,
                currentMachineStatus: call.machine.machineStatus,
                finishedAt: now,
                requestedMachineStatus,
                requestedImpactCallIds,
                requireStatusConfirmation: true,
              });

          const machineStoppedMinutes = call.isSystemTest
            ? 0
            : call.impactTrackingVersion === 1
              ? await calculateCallImpactMinutes(tx, call.id, now)
              : await calculateStoppedMinutesForPeriod(tx, call.machineId, call.openedAt, now);

          await tx.andonCall.update({
            where: {
              id: call.id,
            },
            data: {
              status: "finished",
              currentAttendanceStartedAt: null,
              finishedAt: now,
              notes: mergeFinalDescription(call.notes, finalDescription),
              failureClassification: call.isSystemTest ? null : failureClassification,
              failureDescription: call.isSystemTest ? null : resolvedFailureDescription,
              callWaitingMinutes: diffMinutes(call.openedAt, call.attendedAt ?? now),
              attendanceMinutes:
                (call.attendanceMinutes ?? 0) +
                (call.status === "in_progress"
                  ? diffPreciseMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now)
                  : 0),
              postMaintenanceMinutes:
                (call.postMaintenanceMinutes ?? 0) +
                (call.status === "post_maintenance"
                  ? diffPreciseMinutes(call.maintenanceCompletedAt, now)
                  : 0),
              totalCallMinutes: diffMinutes(call.openedAt, now),
              machineStoppedMinutes,
              productionModeAtFinish: call.machine.productionMode,
              machineStatusAtFinish: finalMachineStatus,

              confirmedMachineSetId: finalMachineSetId,
              confirmedMachineSetCodeSnapshot: finalMachineSetCodeSnapshot,
              confirmedMachineSetNameSnapshot: finalMachineSetNameSnapshot,
              confirmedMachineSetTypeSnapshot: finalMachineSetTypeSnapshot,

              confirmedMachineSubsetId: finalMachineSubsetId,
              confirmedMachineSubsetCodeSnapshot: finalMachineSubsetCodeSnapshot,
              confirmedMachineSubsetNameSnapshot: finalMachineSubsetNameSnapshot,
              confirmedMachineSubsetTypeSnapshot: finalMachineSubsetTypeSnapshot,

              assetConfirmedAt: requiresAssetConfirmation ? now : null,
              assetConfirmedBy,
              assetLocationChanged: locationChanged,
              assetChangeReason: normalizedAssetChangeReason,
            },
          });

          if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);

          await tx.technicianSession.updateMany({
            where: {
              callId: call.id,
              endedAt: null,
              ...(call.status === "post_maintenance"
                ? { OR: [{ phase: "follow_up" }, { phase: null }] }
                : {}),
            },
            data: {
              endedAt: now,
              endReason: "final_call",
              productionModeAtEnd: call.machine.productionMode,
              machineStatusAtEnd: finalMachineStatus,
            },
          });

          await tx.technicianSession.updateMany({
            where: {
              callId: call.id,
              endReason: "support_finished",
              phase: null,
            },
            data: {
              endedAt: now,
              endReason: "final_call",
              productionModeAtEnd: call.machine.productionMode,
              machineStatusAtEnd: finalMachineStatus,
            },
          });

          return findCallWithSessions(tx, call.id);
        });

        return updatedCall;
      } catch (error) {
        if (error instanceof FinishCallNotFoundError) {
          return notFound(reply, error.message);
        }

        if (error instanceof FinishCallValidationError) {
          return badRequest(reply, error.message);
        }

        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: EditFailureDetailsBody }>(
    "/api/andon-calls/:id/failure-details",
    async (request, reply) => {
      const classification = optionalString(request.body?.failureClassification);
      const description = optionalString(request.body?.failureDescription);
      if (!classification) return badRequest(reply, "Classificação da falha é obrigatória");
      if (GENERIC_FAILURE_CLASSIFICATIONS.has(classification)) {
        return badRequest(reply, "Selecione uma classificação específica da falha");
      }
      if (!description) return badRequest(reply, "Descrição da falha é obrigatória");

      const result = await prisma.$transaction(async (tx) => {
        const call = await tx.andonCall.findUnique({ where: { id: request.params.id } });
        if (!call) return { error: "Chamado não encontrado", status: 404 } as const;
        if (call.status !== "finished" || call.isSystemTest) {
          return {
            error: "Apenas chamados reais finalizados podem ter o diagnóstico editado",
            status: 400,
          } as const;
        }

        const linkedEvent =
          (await tx.failureEvent.findFirst({
            where: { callId: call.id, endedAt: null },
            orderBy: { startedAt: "desc" },
          })) ??
          (await tx.failureEvent.findFirst({
            where: { callId: call.id },
            orderBy: { startedAt: "desc" },
          }));
        const catalogClassification = await tx.failureClassification.findUnique({
          where: { value: classification },
        });
        if (
          !catalogClassification ||
          (!catalogClassification.active &&
            linkedEvent?.classification !== classification &&
            call.failureClassification !== classification)
        ) {
          return { error: "Classificação da falha inválida ou inativa", status: 400 } as const;
        }

        await tx.andonCall.update({
          where: { id: call.id },
          data: { failureClassification: classification, failureDescription: description },
        });
        if (linkedEvent) {
          await tx.failureEvent.update({
            where: { id: linkedEvent.id },
            data: { classification, notes: description },
          });
        }
        return { call: await findCallWithSessions(tx, call.id) };
      });

      if ("error" in result && result.error) {
        return result.status === 404
          ? notFound(reply, result.error)
          : badRequest(reply, result.error);
      }
      return result.call;
    },
  );
}
