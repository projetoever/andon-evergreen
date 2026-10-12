import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { parseAnalyticsInstant } from "../analytics/overview.js";
import { prisma } from "../db/prisma.js";
import { badRequest } from "./routeUtils.js";

const ZONE = process.env.ANDON_TIME_ZONE?.trim() || "America/Sao_Paulo";
const PAGE_SIZE = 6;
const OVER_24H_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["open", "in_progress", "post_maintenance"];
const CATEGORIES = [
  "active-calls",
  "open-events",
  "active-sessions",
  "unclassified-calls",
  "unlinked-events",
] as const;

type Category = (typeof CATEGORIES)[number];
type Query = {
  startDate?: string;
  endDate?: string;
  machineId?: string;
  subtype?: string;
  classification?: string;
  category?: string;
  page?: string;
};

function value(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function validPage(input: string | undefined): number | null {
  if (!input) return 1;
  if (!/^[1-9]\d{0,4}$/.test(input)) return null;
  return Number(input);
}

function age(start: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000));
}

type Detail = {
  kind: Category;
  id: string;
  machineId: string;
  machineName: string;
  machineIsActive: boolean;
  callId: string | null;
  startedAt: string;
  ageMinutes: number | null;
  status: string;
  technicianName: string | null;
  technicalArea: string | null;
  workOrderNumber: string | null;
  classification: string | null;
  description: string | null;
};

/**
 * Investigation only. No mutation, no inferred root cause, and no claim that
 * manual notebook/pilot data is real production loss. Counts follow the
 * Data Health cards of /analytics/reliability for the same filters.
 */
export async function registerAnalyticsDataQualityRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Query }>("/api/analytics/data-quality-details", async (request, reply) => {
    const q = request.query;
    const category = value(q.category);
    const start = parseAnalyticsInstant(q.startDate);
    const end = parseAnalyticsInstant(q.endDate);
    const page = validPage(q.page);
    if (!category || !CATEGORIES.includes(category as Category) ||
        !start || !end || start.getTime() >= end.getTime() || page === null) {
      return badRequest(reply, "Informe category válida, page positiva e datas com fuso (startDate < endDate).");
    }

    const now = new Date();
    const effectiveEnd = new Date(Math.min(now.getTime(), end.getTime()));
    const cutoff = new Date(now.getTime() - OVER_24H_MS);
    const machineId = value(q.machineId);
    const subtype = value(q.subtype);
    const classification = value(q.classification);
    const machineFilter = machineId ? { machineId } : {};
    const scope = {
      ...machineFilter,
      ...(subtype ? { subtype } : {}),
    };
    const paging = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
    const itemType = category as Category;
    let count = 0;
    let items: Detail[] = [];

    if (itemType === "active-calls") {
      const where: Prisma.AndonCallWhereInput = {
        isSystemTest: false,
        ...scope,
        status: { in: ACTIVE_STATUSES },
        openedAt: { lte: cutoff },
      };
      const [total, rows] = await Promise.all([
        prisma.andonCall.count({ where }),
        prisma.andonCall.findMany({
          where, orderBy: [{ openedAt: "asc" }, { id: "asc" }], ...paging,
          select: {
            id: true, machineId: true, machine: { select: { name: true, isActive: true } },
            openedAt: true, status: true, workOrderNumber: true,
            failureClassification: true, failureDescription: true,
          },
        }),
      ]);
      count = total;
      items = rows.map((r) => ({
        kind: itemType, id: r.id, callId: r.id,
        machineId: r.machineId, machineName: r.machine.name,
        machineIsActive: r.machine.isActive,
        startedAt: r.openedAt.toISOString(), ageMinutes: age(r.openedAt, now),
        status: r.status, technicianName: null, technicalArea: null,
        workOrderNumber: r.workOrderNumber, classification: r.failureClassification,
        description: r.failureDescription,
      }));
    } else if (itemType === "open-events" || itemType === "unlinked-events") {
      const sharedWhere: Prisma.FailureEventWhereInput = {
        ...machineFilter,
        ...(itemType === "open-events"
          ? {
              endedAt: null,
              startedAt: { lte: cutoff },
              ...(subtype
                ? { call: { is: { isSystemTest: false, subtype } } }
                : { OR: [{ callId: null }, { call: { is: { isSystemTest: false } } }] }),
            }
          : {
              callId: null,
              startedAt: { lt: effectiveEnd },
              OR: [{ endedAt: null }, { endedAt: { gt: start } }],
              ...(classification ? { classification } : {}),
            }),
      };
      // An unlinked physical event has no defensible call-sector attribution.
      // Same for a historical period that has not started.
      const cannotAttribute = itemType === "unlinked-events" && Boolean(subtype);
      if (!cannotAttribute && (itemType === "open-events" || effectiveEnd > start)) {
        const [total, rows] = await Promise.all([
          prisma.failureEvent.count({ where: sharedWhere }),
          prisma.failureEvent.findMany({
            where: sharedWhere,
            orderBy: [{ startedAt: itemType === "open-events" ? "asc" : "desc" }, { id: "asc" }],
            ...paging,
            select: {
              id: true, machineId: true, machine: { select: { name: true, isActive: true } },
              callId: true, startedAt: true, endedAt: true, classification: true, notes: true,
            },
          }),
        ]);
        count = total;
        items = rows.map((r) => ({
          kind: itemType, id: r.id, callId: r.callId,
          machineId: r.machineId, machineName: r.machine.name,
          machineIsActive: r.machine.isActive,
          startedAt: r.startedAt.toISOString(),
          ageMinutes: r.endedAt === null ? age(r.startedAt, now) : null,
          status: r.endedAt === null ? "open" : "closed",
          technicianName: null, technicalArea: null, workOrderNumber: null,
          classification: r.classification, description: r.notes,
        }));
      }
    } else if (itemType === "active-sessions") {
      const where: Prisma.TechnicianSessionWhereInput = {
        ...machineFilter,
        endedAt: null,
        startedAt: { lte: cutoff },
        call: {
          isSystemTest: false,
          ...(subtype ? { subtype } : {}),
        },
      };
      const [total, rows] = await Promise.all([
        prisma.technicianSession.count({ where }),
        prisma.technicianSession.findMany({
          where, orderBy: [{ startedAt: "asc" }, { id: "asc" }], ...paging,
          select: {
            id: true, machineId: true, machine: { select: { name: true, isActive: true } },
            callId: true, startedAt: true, phase: true, technicianName: true, technicalArea: true,
            call: { select: { workOrderNumber: true, failureClassification: true, failureDescription: true } },
          },
        }),
      ]);
      count = total;
      items = rows.map((r) => ({
        kind: itemType, id: r.id, callId: r.callId,
        machineId: r.machineId, machineName: r.machine.name,
        machineIsActive: r.machine.isActive,
        startedAt: r.startedAt.toISOString(), ageMinutes: age(r.startedAt, now),
        status: r.phase ?? "sem fase",
        technicianName: r.technicianName, technicalArea: r.technicalArea,
        workOrderNumber: r.call.workOrderNumber, classification: r.call.failureClassification,
        description: r.call.failureDescription,
      }));
    } else {
      const where: Prisma.AndonCallWhereInput = {
        isSystemTest: false, ...scope,
        status: "finished",
        finishedAt: { gte: start, lt: effectiveEnd },
        failureClassification: null,
      };
      if (effectiveEnd > start) {
        const [total, rows] = await Promise.all([
          prisma.andonCall.count({ where }),
          prisma.andonCall.findMany({
            where, orderBy: [{ finishedAt: "desc" }, { id: "asc" }], ...paging,
            select: {
              id: true, machineId: true, machine: { select: { name: true, isActive: true } },
              openedAt: true, finishedAt: true, workOrderNumber: true, status: true,
              failureClassification: true, failureDescription: true,
            },
          }),
        ]);
        count = total;
        items = rows.map((r) => ({
          kind: itemType, id: r.id, callId: r.id,
          machineId: r.machineId, machineName: r.machine.name,
          machineIsActive: r.machine.isActive,
          startedAt: (r.finishedAt ?? r.openedAt).toISOString(), ageMinutes: null,
          status: r.status, technicianName: null, technicalArea: null,
          workOrderNumber: r.workOrderNumber, classification: r.failureClassification,
          description: r.failureDescription,
        }));
      }
    }

    return {
      meta: {
        generatedAt: now.toISOString(), timeZone: ZONE,
        period: { start: start.toISOString(), end: end.toISOString(), effectiveEnd: effectiveEnd.toISOString() },
        filters: { machineId, subtype, classification },
        category: itemType,
        semantics: {
          active: "Chamados, eventos e sessões >24h são snapshots atuais e independem da classificação de falha.",
          historical: "Concluídos sem classificação e eventos órfãos usam a janela de período selecionada.",
          unlinked: "FailureEvent sem chamado não recebe setor inferido; pode representar registro legítimo.",
          source: "Registros operacionais do ambiente consultado; o BI não certifica se o ambiente é piloto ou produção.",
        },
      },
      total: count,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(count / PAGE_SIZE)),
      items,
    };
  });
}
