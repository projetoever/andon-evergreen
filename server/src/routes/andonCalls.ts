import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
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
};

type AddTechnicianBody = {
  technicianName?: unknown;
  technicianArea?: unknown;
};

type EndTechnicianBody = {
  reason?: unknown;
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

const andonCallInclude = {
  technicianSessions: { orderBy: { startedAt: "asc" } },
  technicianTimeAllocations: { orderBy: { startedAt: "asc" } },
} satisfies Prisma.AndonCallInclude;

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function uniqueNames(names: Array<string | undefined>) {
  return Array.from(new Set(names.filter((name): name is string => Boolean(name))));
}

function diffMinutes(start?: Date | null, end = new Date()) {
  if (!start) {
    return 0;
  }

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
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

async function findActiveMachineSubsetForCall(
  machineSetId: string,
  machineSubsetId: string,
) {
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
    names: string[];
    technicianArea?: string;
    startedAt: Date;
    productionModeAtStart?: string | null;
    machineStatusAtStart?: string | null;
  },
) {
  if (!params.names.length) {
    return;
  }

  const activeSessions = await tx.technicianSession.findMany({
    where: {
      callId: params.callId,
      endedAt: null,
      technicianName: { in: params.names },
    },
    select: { technicianName: true },
  });
  const activeNames = new Set(activeSessions.map((session) => session.technicianName));
  const missingNames = params.names.filter((name) => !activeNames.has(name));

  if (!missingNames.length) {
    return;
  }

  await tx.technicianSession.createMany({
    data: missingNames.map((name) => ({
      callId: params.callId,
      machineId: params.machineId,
      technicianName: name,
      technicalArea: params.technicianArea,
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

  const activeEvent = openEvents[0];

  if (activeEvent) {
    if (!activeEvent.callId) {
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
    if (!CALL_CRITICALITIES.has(criticality)) return badRequest(reply, "Criticidade inválida");
    if (!CALL_ORIGINS.has(origin)) return badRequest(reply, "Origem do chamado inválida");

    const usesInstallerHealthMetadata =
      origin === INSTALLER_HEALTH_ORIGIN || isSystemTest;

    const hasValidInstallerHealthMetadata =
      origin === INSTALLER_HEALTH_ORIGIN &&
      isSystemTest &&
      createdBy === INSTALLER_HEALTH_CREATED_BY;

    if (usesInstallerHealthMetadata && !hasValidInstallerHealthMetadata) {
      return badRequest(reply, "Metadados de teste automático inválidos");
    }
    if (machineCondition && !MACHINE_STATUSES.has(machineCondition)) return badRequest(reply, "Condição da máquina inválida");

    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) return notFound(reply, "Máquina não encontrada");
    if (
      !isSystemTest &&
      (machine.currentCallId || OPEN_CALL_STATUSES.includes(machine.andonStatus))
    ) {
      return badRequest(reply, "Já existe um chamado ativo para esta máquina");
    }

    if (machineSubsetId && !machineSetId) {
      return badRequest(
        reply,
        "machineSetId é obrigatório quando machineSubsetId for informado",
      );
    }

    const machineSet = machineSetId
      ? await findActiveMachineSetForCall(machineId, machineSetId)
      : null;

    if (machineSetId && !machineSet) {
      return badRequest(
        reply,
        "Conjunto inválido ou inativo para esta máquina",
      );
    }

    const machineSubset =
      machineSetId && machineSubsetId
        ? await findActiveMachineSubsetForCall(
            machineSetId,
            machineSubsetId,
          )
        : null;

    if (machineSubsetId && !machineSubset) {
      return badRequest(
        reply,
        "Subconjunto inválido, inativo ou não pertence ao conjunto selecionado",
      );
    }

    const now = new Date();
    const call = await prisma.$transaction(async (tx) => {
      const createdCall = await tx.andonCall.create({
        data: {
          machineId,
          category,
          subtype,
          status: "open",
          criticality,
          machineCondition: machineCondition ?? machine.machineStatus,
          openedAt: now,
          callWaitingMinutes: 0,
          attendanceMinutes: 0,
          postMaintenanceMinutes: 0,
          totalCallMinutes: 0,
          machineStoppedMinutes: 0,
          notes: description ?? null,
          createdBy,
          origin,
          isSystemTest,
          productionModeAtOpen: machine.productionMode,
          machineStatusAtOpen: machineCondition ?? machine.machineStatus,
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
        !isSystemTest && machineCondition === "stopped"
          ? await ensureOpenFailureEventForStoppedCall(tx, {
              machineId,
              callId: createdCall.id,
              startedAt: now,
              productionMode: machine.productionMode,
            })
          : null;

      if (!isSystemTest) {
        await tx.machine.update({
          where: { id: machineId },
          data: {
            andonStatus: "open",
            currentCallId: createdCall.id,
            ...(machineCondition
              ? {
                  machineStatus: machineCondition,
                  lastStatusChangedAt: failureStartedAt ?? now,
                }
              : {}),
          },
        });
      }

      const createdCallWithSessions = await findCallWithSessions(tx, createdCall.id);
      return attachAssetSnapshots(
        createdCallWithSessions,
        machineSet,
        machineSubset,
      );
    });

    return reply.status(201).send(call);
  });

  app.patch<{ Params: { id: string }; Body: AttendAndonCallBody }>("/api/andon-calls/:id/attend", async (request, reply) => {
    const body = request.body ?? {};
    const technicianName = optionalString(body.technicianName);
    const technicianNames = Array.isArray(body.technicianNames)
      ? body.technicianNames.map(optionalString).filter((name): name is string => Boolean(name))
      : [];
    const names = uniqueNames([technicianName, ...technicianNames]);
    const technicianArea = optionalString(body.technicianArea);
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");
    if (call.status !== "open") return badRequest(reply, "Chamado não está aberto");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "in_progress",
          attendedAt: call.attendedAt ?? now,
          currentAttendanceStartedAt: now,
          technicianName: names[0] ?? call.technicianName,
          technicianNames: names.length ? uniqueNames([...call.technicianNames, ...names]) : call.technicianNames,
          technicianArea: technicianArea ?? call.technicianArea,
          productionModeAtAttend: call.machine.productionMode,
          machineStatusAtAttend: call.machine.machineStatus,
        },
      });

      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "in_progress" } });

      await createMissingActiveTechnicianSessions(tx, {
        callId: call.id,
        machineId: call.machineId,
        names,
        technicianArea,
        startedAt: now,
        productionModeAtStart: call.machine.productionMode,
        machineStatusAtStart: call.machine.machineStatus,
      });

      return findCallWithSessions(tx, call.id);
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: CancelAndonCallBody }>("/api/andon-calls/:id/cancel", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({
      include: { technicianSessions: true, currentForMachine: true },
      where: { id: request.params.id },
    });
    if (!call) return notFound(reply, "Chamado não encontrado");
    if (call.status !== "open") return badRequest(reply, "Não é possível cancelar chamado já atendido.");

    const hasTechnician = Boolean(call.technicianName || call.technicianNames.length || call.technicianArea);
    const hasAttendance = Boolean(call.attendedAt || call.currentAttendanceStartedAt || call.technicianSessions.length);
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
    const cancellationNote = cancellationNoteParts.length ? cancellationNoteParts.join(" | ") : undefined;

    const updatedCall = await prisma.$transaction(async (tx) => {
      await tx.machine.updateMany({
        where: { id: call.machineId, currentCallId: call.id },
        data: { andonStatus: "normal", currentCallId: null },
      });
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
          machineStoppedMinutes: call.machineCondition === "stopped" ? diffMinutes(call.openedAt, now) : 0,
          productionModeAtFinish: call.productionModeAtOpen,
          machineStatusAtFinish: call.machineStatusAtOpen,
          notes: appendNote(call.notes, cancellationNote, "Cancelamento"),
        },
      });

      return findCallWithSessions(tx, call.id);
    });

    const [enrichedCall] = await enrichCallsWithAssetSnapshots(updatedCall ? [updatedCall] : []);
    return reply.send(enrichedCall ?? { id: call.id, machineId: call.machineId, status: "cancelled", reason, cancelledBy });
  });

  app.post<{ Params: { id: string }; Body: AddTechnicianBody }>("/api/andon-calls/:id/technicians", async (request, reply) => {
    const technicianName = optionalString(request.body?.technicianName);
    const technicianArea = optionalString(request.body?.technicianArea);

    if (!technicianName) return badRequest(reply, "Campo technicianName é obrigatório");

    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");
    if (call.status !== "in_progress") return badRequest(reply, "Chamado não está em atendimento");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      await createMissingActiveTechnicianSessions(tx, {
        callId: call.id,
        machineId: call.machineId,
        names: [technicianName],
        technicianArea,
        startedAt: now,
        productionModeAtStart: call.machine.productionMode,
        machineStatusAtStart: call.machine.machineStatus,
      });

      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          technicianName: call.technicianName ?? technicianName,
          technicianNames: uniqueNames([...call.technicianNames, technicianName]),
          technicianArea: call.technicianArea ?? technicianArea,
        },
      });

      return findCallWithSessions(tx, call.id);
    });

    return reply.status(201).send(updatedCall);
  });

  app.patch<{ Params: { id: string; technicianName: string }; Body: EndTechnicianBody }>("/api/andon-calls/:id/technicians/:technicianName/end", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

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
  });

  app.patch<{ Params: { id: string }; Body: NotesBody }>("/api/andon-calls/:id/finish-maintenance", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "post_maintenance",
          currentAttendanceStartedAt: null,
          maintenanceCompletedAt: now,
          attendanceMinutes: (call.attendanceMinutes ?? 0) + diffMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now),
          notes: appendNote(call.notes, optionalString(request.body?.notes), "Conclusão da manutenção"),
        },
      });
      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "post_maintenance" } });
      return findCallWithSessions(tx, call.id);
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: ReturnToMaintenanceBody }>("/api/andon-calls/:id/return-to-maintenance", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "in_progress",
          currentAttendanceStartedAt: now,
          maintenanceCompletedAt: null,
          postMaintenanceMinutes: (call.postMaintenanceMinutes ?? 0) + diffMinutes(call.maintenanceCompletedAt, now),
          maintenanceReturnCount: { increment: 1 },
          notes: appendNote(call.notes, optionalString(request.body?.reason), "Retorno à manutenção"),
        },
      });
      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "in_progress" } });
      return findCallWithSessions(tx, call.id);
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: FinishAndonCallBody }>("/api/andon-calls/:id/finish", async (request, reply) => {
    const requestedMachineStatus = optionalString(request.body?.machineStatus);
    if (requestedMachineStatus && !MACHINE_STATUSES.has(requestedMachineStatus)) return badRequest(reply, "Status operacional inválido");

    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "finished",
          currentAttendanceStartedAt: null,
          finishedAt: now,
          notes: appendNote(call.notes, optionalString(request.body?.notes), "Finalização"),
          callWaitingMinutes: diffMinutes(call.openedAt, call.attendedAt ?? now),
          attendanceMinutes: (call.attendanceMinutes ?? 0) + (call.status === "in_progress" ? diffMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now) : 0),
          postMaintenanceMinutes: (call.postMaintenanceMinutes ?? 0) + (call.status === "post_maintenance" ? diffMinutes(call.maintenanceCompletedAt, now) : 0),
          totalCallMinutes: diffMinutes(call.openedAt, now),
          machineStoppedMinutes: call.machineCondition === "stopped" || call.machine.machineStatus === "stopped" ? diffMinutes(call.openedAt, now) : 0,
          productionModeAtFinish: call.machine.productionMode,
          machineStatusAtFinish: call.machine.machineStatus,
        },
      });

      await tx.machine.update({
        where: { id: call.machineId },
        data: { andonStatus: "normal", currentCallId: null },
      });
      await tx.technicianSession.updateMany({
        where: { callId: call.id, endedAt: null },
        data: {
          endedAt: now,
          endReason: "final_call",
          productionModeAtEnd: call.machine.productionMode,
          machineStatusAtEnd: call.machine.machineStatus,
        },
      });

      await tx.technicianSession.updateMany({
        where: { callId: call.id, endReason: "support_finished" },
        data: {
          endedAt: now,
          endReason: "final_call",
          productionModeAtEnd: call.machine.productionMode,
          machineStatusAtEnd: call.machine.machineStatus,
        },
      });

      return findCallWithSessions(tx, call.id);
    });

    return updatedCall;
  });
}
