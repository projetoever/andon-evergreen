import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { allowsWholeSetCalls, getAttendanceMode } from "../services/systemSettings.js";
import {
  identifyTechnician,
  resolveTechniciansByNames,
  type IdentifiedTechnician,
} from "../services/technicianIdentity.js";
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
};

type EndTechnicianBody = {
  reason?: unknown;
  notes?: unknown;
  technicianName?: unknown;
  credential?: TechnicianCredentialBody;
};

type NotesBody = {
  notes?: unknown;
};

type ReturnToMaintenanceBody = {
  reason?: unknown;
};

type FinishAndonCallBody = {
  notes?: unknown;
  machineStatus?: unknown;
  impactCallIds?: unknown;
  confirmedMachineSetId?: unknown;
  confirmedMachineSubsetId?: unknown;
  assetChangeReason?: unknown;
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
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${machineId}))::text AS "lockResult"
  `);
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
    (technician) => !technician.technicalArea || technician.technicalArea !== call.subtype,
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
      notes:
        ownedOpenEvent.notes ??
        "Falha encerrada automaticamente na finalização do chamado responsável",
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

async function createMissingActiveTechnicianSessions(
  tx: Prisma.TransactionClient,
  params: {
    callId: string;
    machineId: string;
    technicians: IdentifiedTechnician[];
    startedAt: Date;
    productionModeAtStart?: string | null;
    machineStatusAtStart?: string | null;
  },
) {
  if (!params.technicians.length) {
    return;
  }

  const names = params.technicians.map((technician) => technician.name);

  const activeSessions = await tx.technicianSession.findMany({
    where: {
      callId: params.callId,
      endedAt: null,
      technicianName: { in: names },
    },
    select: { technicianName: true },
  });
  const activeNames = new Set(activeSessions.map((session) => session.technicianName));
  const missingTechnicians = params.technicians.filter(
    (technician) => !activeNames.has(technician.name),
  );

  if (!missingTechnicians.length) {
    return;
  }

  await tx.technicianSession.createMany({
    data: missingTechnicians.map((technician) => ({
      callId: params.callId,
      machineId: params.machineId,
      technicianId: technician.id,
      technicianName: technician.name,
      technicalArea: technician.technicalArea,
      shiftId: technician.shiftId,
      shiftName: technician.shift?.name ?? undefined,
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

    if (!machineId) return badRequest(reply, "Campo machineId é obrigatório");
    if (!subtypes.length || subtypes.length > 20) {
      return badRequest(reply, "Selecione de um a vinte setores para abrir os chamados");
    }
    if (!CALL_CRITICALITIES.has(criticality)) return badRequest(reply, "Criticidade inválida");
    if (machineCondition && !MACHINE_STATUSES.has(machineCondition)) {
      return badRequest(reply, "Condição da máquina inválida");
    }

    try {
      const calls = await prisma.$transaction(async (tx) => {
        await lockMachineCallFlow(tx, machineId);
        const machine = await tx.machine.findUnique({ where: { id: machineId } });
        if (!machine) throw new AndonCallValidationError("Máquina não encontrada");

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
        const now = new Date();
        const updatedCall = await prisma.$transaction(async (tx) => {
          const technicians = await resolveAttendanceTechnicians(tx, call, body);
          const names = technicians.map((technician) => technician.name);
          const technicianArea = technicians[0]?.technicalArea ?? call.technicianArea;

          await tx.andonCall.update({
            where: { id: call.id },
            data: {
              status: "in_progress",
              attendedAt: call.attendedAt ?? now,
              currentAttendanceStartedAt: now,
              technicianName: names[0] ?? call.technicianName,
              technicianNames: names.length
                ? uniqueNames([...call.technicianNames, ...names])
                : call.technicianNames,
              technicianArea,
              productionModeAtAttend: call.machine.productionMode,
              machineStatusAtAttend: call.machine.machineStatus,
            },
          });

          await createMissingActiveTechnicianSessions(tx, {
            callId: call.id,
            machineId: call.machineId,
            technicians,
            startedAt: now,
            productionModeAtStart: call.machine.productionMode,
            machineStatusAtStart: call.machine.machineStatus,
          });

          if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);
          return findCallWithSessions(tx, call.id);
        });

        return updatedCall;
      } catch (error) {
        if (error instanceof AndonCallValidationError) return badRequest(reply, error.message);
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: CancelAndonCallBody }>(
    "/api/andon-calls/:id/cancel",
    async (request, reply) => {
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

      const now = new Date();
      const reason = optionalString(request.body?.reason);
      const cancelledBy = optionalString(request.body?.cancelledBy);
      const cancellationNoteParts = [
        reason ? `Motivo: ${reason}` : undefined,
        cancelledBy ? `Cancelado por: ${cancelledBy}` : undefined,
      ].filter((part): part is string => Boolean(part));
      const cancellationNote = cancellationNoteParts.length
        ? cancellationNoteParts.join(" | ")
        : undefined;

      const updatedCall = await prisma.$transaction(async (tx) => {
        await lockMachineCallFlow(tx, call.machineId);
        const currentMachine = await tx.machine.findUnique({
          where: { id: call.machineId },
          select: { machineStatus: true },
        });
        if (!currentMachine) {
          throw new AndonCallValidationError("Máquina não encontrada");
        }

        const finalMachineStatus = call.isSystemTest
          ? call.machineStatusAtOpen
          : await resumeMachineWhenFinishingOwnedStop(tx, {
              callId: call.id,
              machineId: call.machineId,
              currentMachineStatus: currentMachine.machineStatus,
              finishedAt: now,
              requireStatusConfirmation: false,
            });
        const machineStoppedMinutes = call.isSystemTest
          ? 0
          : call.impactTrackingVersion === 1
            ? await calculateCallImpactMinutes(tx, call.id, now)
            : await calculateStoppedMinutesForPeriod(tx, call.machineId, call.openedAt, now);

        await tx.andonCall.update({
          where: { id: call.id },
          data: {
            status: "cancelled",
            finishedAt: now,
            currentAttendanceStartedAt: null,
            callWaitingMinutes: diffMinutes(call.openedAt, now),
            attendanceMinutes: 0,
            postMaintenanceMinutes: 0,
            totalCallMinutes: diffMinutes(call.openedAt, now),
            machineStoppedMinutes,
            productionModeAtFinish: call.productionModeAtOpen,
            machineStatusAtFinish: finalMachineStatus,
            notes: appendNote(call.notes, cancellationNote, "Cancelamento"),
          },
        });

        if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);

        return findCallWithSessions(tx, call.id);
      });

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
      if (call.status !== "in_progress")
        return badRequest(reply, "Chamado não está em atendimento");

      try {
        const now = new Date();
        const updatedCall = await prisma.$transaction(async (tx) => {
          const technicians = await resolveAttendanceTechnicians(tx, call, request.body ?? {});
          const names = technicians.map((technician) => technician.name);

          await createMissingActiveTechnicianSessions(tx, {
            callId: call.id,
            machineId: call.machineId,
            technicians,
            startedAt: now,
            productionModeAtStart: call.machine.productionMode,
            machineStatusAtStart: call.machine.machineStatus,
          });

          await tx.andonCall.update({
            where: { id: call.id },
            data: {
              technicianName: call.technicianName ?? names[0],
              technicianNames: uniqueNames([...call.technicianNames, ...names]),
              technicianArea: call.technicianArea ?? technicians[0]?.technicalArea,
            },
          });

          return findCallWithSessions(tx, call.id);
        });

        return reply.status(201).send(updatedCall);
      } catch (error) {
        if (error instanceof AndonCallValidationError) return badRequest(reply, error.message);
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string; technicianName: string }; Body: EndTechnicianBody }>(
    "/api/andon-calls/:id/technicians/:technicianName/end",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({
        include: { machine: true },
        where: { id: request.params.id },
      });
      if (!call) return notFound(reply, "Chamado não encontrado");
      if ((await getAttendanceMode()) !== "name") {
        return badRequest(reply, "Identifique o mantenedor por PIN ou tag");
      }

      const technicianName = decodeURIComponent(request.params.technicianName);
      const activeSession = await prisma.technicianSession.findFirst({
        where: { callId: call.id, technicianName, endedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (!activeSession) return notFound(reply, "Sessão ativa do manutentor não encontrada");

      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        await tx.technicianSession.update({
          where: { id: activeSession.id },
          data: {
            endedAt: now,
            endReason: optionalString(request.body?.reason) ?? "manual",
            productionModeAtEnd: call.machine.productionMode,
            machineStatusAtEnd: call.machine.machineStatus,
          },
        });

        return findCallWithSessions(tx, call.id);
      });

      return updatedCall;
    },
  );

  app.patch<{ Params: { id: string }; Body: EndTechnicianBody }>(
    "/api/andon-calls/:id/technicians/end",
    async (request, reply) => {
      const call = await prisma.andonCall.findUnique({
        include: { machine: true },
        where: { id: request.params.id },
      });
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

      const activeSession = await prisma.technicianSession.findFirst({
        where: {
          callId: call.id,
          endedAt: null,
          ...(identified
            ? { technicianId: identified.id }
            : { technicianName: { equals: requestedName, mode: "insensitive" } }),
        },
        orderBy: { startedAt: "desc" },
      });
      if (!activeSession) {
        return notFound(reply, "Este mantenedor não possui atendimento ativo neste chamado");
      }

      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        await tx.technicianSession.update({
          where: { id: activeSession.id },
          data: {
            endedAt: now,
            endReason: optionalString(request.body?.reason) ?? "manual",
            notes: optionalString(request.body?.notes) ?? activeSession.notes,
            productionModeAtEnd: call.machine.productionMode,
            machineStatusAtEnd: call.machine.machineStatus,
          },
        });

        return findCallWithSessions(tx, call.id);
      });

      return updatedCall;
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

      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        await tx.andonCall.update({
          where: { id: call.id },
          data: {
            status: "post_maintenance",
            currentAttendanceStartedAt: null,
            maintenanceCompletedAt: now,
            attendanceMinutes:
              (call.attendanceMinutes ?? 0) +
              diffPreciseMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now),
            notes: appendNote(
              call.notes,
              optionalString(request.body?.notes),
              "Conclusão da manutenção",
            ),
          },
        });
        if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);
        return findCallWithSessions(tx, call.id);
      });

      return updatedCall;
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

      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        await tx.andonCall.update({
          where: { id: call.id },
          data: {
            status: "in_progress",
            currentAttendanceStartedAt: now,
            maintenanceCompletedAt: null,
            postMaintenanceMinutes:
              (call.postMaintenanceMinutes ?? 0) +
              diffPreciseMinutes(call.maintenanceCompletedAt, now),
            maintenanceReturnCount: { increment: 1 },
            notes: appendNote(
              call.notes,
              optionalString(request.body?.reason),
              "Retorno à manutenção",
            ),
          },
        });
        if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);
        return findCallWithSessions(tx, call.id);
      });

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
              notes: appendNote(call.notes, optionalString(body.notes), "Finalização"),
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
}
