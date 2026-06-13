import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

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
  category?: unknown;
  subtype?: unknown;
  criticality?: unknown;
  description?: unknown;
  createdBy?: unknown;
  machineCondition?: unknown;
};

type AttendAndonCallBody = {
  technicianName?: unknown;
  technicianNames?: unknown;
  technicianArea?: unknown;
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

const CALL_CATEGORIES = new Set(["maintenance", "production"]);
const CALL_CRITICALITIES = new Set(["low", "medium", "high", "critical"]);
const MACHINE_STATUSES = new Set(["running", "stopped"]);
const OPEN_CALL_STATUSES = ["open", "in_progress", "post_maintenance"];

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
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

export async function registerAndonCallRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AndonCallQuery }>("/api/andon-calls", async (request) => {
    const { machineId, status, criticality } = request.query;
    const where: Prisma.AndonCallWhereInput = {
      ...(machineId ? { machineId } : {}),
      ...(status ? { status } : {}),
      ...(criticality ? { criticality } : {}),
    };

    return prisma.andonCall.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: parseLimit(request.query.limit),
    });
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

    return prisma.andonCall.findMany({
      where,
      orderBy: [{ finishedAt: "desc" }, { openedAt: "desc" }],
      take: parseLimit(request.query.limit),
    });
  });

  app.post<{ Body: OpenAndonCallBody }>("/api/andon-calls", async (request, reply) => {
    const body = request.body ?? {};
    const machineId = body.machineId === undefined ? undefined : String(body.machineId);
    const category = optionalString(body.category);
    const subtype = optionalString(body.subtype);
    const criticality = optionalString(body.criticality) ?? "medium";
    const description = optionalString(body.description);
    const createdBy = optionalString(body.createdBy);
    const machineCondition = optionalString(body.machineCondition);

    if (!machineId) return badRequest(reply, "Campo machineId é obrigatório");
    if (!category) return badRequest(reply, "Campo category é obrigatório");
    if (!CALL_CATEGORIES.has(category)) return badRequest(reply, "Categoria inválida");
    if (!CALL_CRITICALITIES.has(criticality)) return badRequest(reply, "Criticidade inválida");
    if (machineCondition && !MACHINE_STATUSES.has(machineCondition)) return badRequest(reply, "Condição da máquina inválida");

    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) return notFound(reply, "Máquina não encontrada");
    if (machine.currentCallId || OPEN_CALL_STATUSES.includes(machine.andonStatus)) {
      return badRequest(reply, "Já existe um chamado ativo para esta máquina");
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
          productionModeAtOpen: machine.productionMode,
          machineStatusAtOpen: machineCondition ?? machine.machineStatus,
        },
      });

      await tx.machine.update({
        where: { id: machineId },
        data: {
          andonStatus: "open",
          currentCallId: createdCall.id,
          ...(machineCondition ? { machineStatus: machineCondition } : {}),
          lastStatusChangedAt: now,
        },
      });

      return createdCall;
    });

    return reply.status(201).send(call);
  });

  app.patch<{ Params: { id: string }; Body: AttendAndonCallBody }>("/api/andon-calls/:id/attend", async (request, reply) => {
    const body = request.body ?? {};
    const technicianName = optionalString(body.technicianName);
    const technicianNames = Array.isArray(body.technicianNames)
      ? body.technicianNames.map(optionalString).filter((name): name is string => Boolean(name))
      : [];
    const names = Array.from(new Set([...(technicianName ? [technicianName] : []), ...technicianNames]));
    const technicianArea = optionalString(body.technicianArea);
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      const updated = await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "in_progress",
          attendedAt: call.attendedAt ?? now,
          currentAttendanceStartedAt: now,
          technicianName: names[0] ?? call.technicianName,
          technicianNames: names.length ? names : call.technicianNames,
          technicianArea: technicianArea ?? call.technicianArea,
          productionModeAtAttend: call.machine.productionMode,
          machineStatusAtAttend: call.machine.machineStatus,
        },
      });

      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "in_progress", lastStatusChangedAt: now } });

      if (names.length) {
        await tx.technicianSession.createMany({
          data: names.map((name) => ({
            callId: call.id,
            machineId: call.machineId,
            technicianName: name,
            technicalArea: technicianArea,
            startedAt: now,
            productionModeAtStart: call.machine.productionMode,
            machineStatusAtStart: call.machine.machineStatus,
          })),
        });
      }

      return updated;
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: NotesBody }>("/api/andon-calls/:id/finish-maintenance", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      const updated = await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "post_maintenance",
          currentAttendanceStartedAt: null,
          maintenanceCompletedAt: now,
          attendanceMinutes: (call.attendanceMinutes ?? 0) + diffMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now),
          notes: appendNote(call.notes, optionalString(request.body?.notes), "Conclusão da manutenção"),
        },
      });
      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "post_maintenance", lastStatusChangedAt: now } });
      return updated;
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: ReturnToMaintenanceBody }>("/api/andon-calls/:id/return-to-maintenance", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      const updated = await tx.andonCall.update({
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
      await tx.machine.update({ where: { id: call.machineId }, data: { andonStatus: "in_progress", lastStatusChangedAt: now } });
      return updated;
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: FinishAndonCallBody }>("/api/andon-calls/:id/finish", async (request, reply) => {
    const machineStatus = optionalString(request.body?.machineStatus) ?? "running";
    if (!MACHINE_STATUSES.has(machineStatus)) return badRequest(reply, "Status operacional inválido");

    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");

    const now = new Date();
    const updatedCall = await prisma.$transaction(async (tx) => {
      const updated = await tx.andonCall.update({
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
          machineStatusAtFinish: machineStatus,
        },
      });

      await tx.machine.update({
        where: { id: call.machineId },
        data: { andonStatus: "normal", currentCallId: null, machineStatus, lastStatusChangedAt: now },
      });
      await tx.technicianSession.updateMany({
        where: { callId: call.id, endedAt: null },
        data: {
          endedAt: now,
          endReason: "final_call",
          productionModeAtEnd: call.machine.productionMode,
          machineStatusAtEnd: machineStatus,
        },
      });

      return updated;
    });

    return updatedCall;
  });
}
