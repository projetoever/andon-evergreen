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
const CALL_SUBTYPE_CATEGORIES = {
  electrical: "maintenance",
  mechanical: "maintenance",
  hot_melt: "maintenance",
  quality: "production",
  leadership: "production",
} as const;

type SupportedCallSubtype = keyof typeof CALL_SUBTYPE_CATEGORIES;

type TechnicianCredentialBody = {
  method?: unknown;
  value?: unknown;
};

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

function parseCredentialBodies(value: unknown): TechnicianCredentialBody[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TechnicianCredentialBody => Boolean(item) && typeof item === "object",
  );
}

class AndonCallValidationError extends Error {}

async function lockMachineCallFlow(tx: Prisma.TransactionClient, machineId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${machineId}))
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
      lastStatusChangedAt: new Date(),
    },
  });
}

async function resolveAttendanceTechnicians(
  tx: Prisma.TransactionClient,
  call: { category: string; subtype: string | null },
  body: AttendAndonCallBody | AddTechnicianBody,
  allowSupportAreas: boolean,
) {
  if (call.category !== "maintenance") return [];

  const credentialBodies = parseCredentialBodies(body.credentials);
  const requestedNames = uniqueNames([
    optionalString(body.technicianName),
    ...(Array.isArray(body.technicianNames)
      ? body.technicianNames
          .map(optionalString)
          .filter((name): name is string => Boolean(name))
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
      throw new AndonCallValidationError("Um ou mais mantenedores não foram encontrados ou estão inativos");
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

  const allowedAreas = allowSupportAreas
    ? new Set(["electrical", "mechanical", "hot_melt"])
    : new Set([call.subtype]);
  const incompatible = uniqueTechnicians.find(
    (technician) => !technician.technicalArea || !allowedAreas.has(technician.technicalArea),
  );
  if (incompatible) {
    throw new AndonCallValidationError(
      `${incompatible.name} não está cadastrado na área permitida para este atendimento`,
    );
  }

  return uniqueTechnicians;
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

function uniqueRegisteredTechnicianNames(
  names: Array<string | null | undefined>,
) {
  return Array.from(
    new Set(
      names
        .map(
          (name) => name?.trim(),
        )
        .filter(
          (name): name is string =>
            Boolean(name),
        ),
    ),
  );
}

function resolveAutomaticAssetConfirmedBy(
  call: AssetConfirmationResponsibleCall,
) {
  const activeSessionNames =
    uniqueRegisteredTechnicianNames(
      call.technicianSessions
        .filter(
          (session) =>
            !session.endedAt,
        )
        .map(
          (session) =>
            session.technicianName,
        ),
    );

  const allSessionNames =
    uniqueRegisteredTechnicianNames(
      call.technicianSessions.map(
        (session) =>
          session.technicianName,
      ),
    );

  const legacyNames =
    uniqueRegisteredTechnicianNames([
      ...call.technicianNames,
      call.technicianName,
    ]);

  const responsibleNames =
    activeSessionNames.length
      ? activeSessionNames
      : allSessionNames.length
        ? allSessionNames
        : legacyNames;

  if (
    call.category === "maintenance" &&
    responsibleNames.length === 0
  ) {
    throw new FinishCallValidationError(
      "O chamado de manutenção não possui mantenedor registrado",
    );
  }

  return responsibleNames.length
    ? responsibleNames.join(", ")
    : "Operação";
}

function resolveAssetChangeReason(
  locationChanged: boolean,
  reason: string | undefined,
) {
  if (!locationChanged) {
    return null;
  }

  return reason?.trim() ||
    "Não justificado";
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

  const snapshotParts = [
    code?.trim() ?? "",
    name?.trim() ?? "",
    type?.trim() ?? "",
  ];

  return snapshotParts.some(Boolean)
    ? `snapshot:${snapshotParts.join("|")}`
    : null;
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
    INNER JOIN "machine_subset_types" AS subset_type
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

async function machineHasActiveSets(
  tx: Prisma.TransactionClient,
  machineId: string,
) {
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
    if (!subtype || !(subtype in CALL_SUBTYPE_CATEGORIES)) {
      return badRequest(reply, "Tipo de chamado inválido");
    }
    if (CALL_SUBTYPE_CATEGORIES[subtype as SupportedCallSubtype] !== category) {
      return badRequest(reply, "Tipo de chamado incompatível com a categoria");
    }
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
      if (
        !isSystemTest &&
        (await findDuplicateActiveSectorCall(tx, machineId, subtype))
      ) {
        throw new AndonCallValidationError("Já existe um chamado ativo deste setor para a máquina");
      }

      const createdCall = await tx.andonCall.create({
        data: {
          machineId,
          category,
          subtype,
          status: "open",
          criticality,
          machineCondition: machineCondition ?? lockedMachine.machineStatus,
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
          productionModeAtOpen: lockedMachine.productionMode,
          machineStatusAtOpen: machineCondition ?? lockedMachine.machineStatus,
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
              productionMode: lockedMachine.productionMode,
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
    if (!subtypes.length || subtypes.length > Object.keys(CALL_SUBTYPE_CATEGORIES).length) {
      return badRequest(reply, "Selecione de um a cinco setores para abrir os chamados");
    }
    if (subtypes.some((subtype) => !(subtype in CALL_SUBTYPE_CATEGORIES))) {
      return badRequest(reply, "Um ou mais tipos de chamado são inválidos");
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

        for (const subtype of subtypes) {
          if (await findDuplicateActiveSectorCall(tx, machineId, subtype)) {
            throw new AndonCallValidationError(
              `Já existe um chamado ativo do setor ${subtype} para esta máquina`,
            );
          }
        }

        const baseOpenedAt = new Date();
        const createdCalls = [];

        for (const [index, subtype] of subtypes.entries()) {
          const openedAt = new Date(baseOpenedAt.getTime() + index);
          const createdCall = await tx.andonCall.create({
            data: {
              machineId,
              category: CALL_SUBTYPE_CATEGORIES[subtype as SupportedCallSubtype],
              subtype,
              status: "open",
              criticality,
              machineCondition: machineCondition ?? machine.machineStatus,
              openedAt,
              callWaitingMinutes: 0,
              attendanceMinutes: 0,
              postMaintenanceMinutes: 0,
              totalCallMinutes: 0,
              machineStoppedMinutes: 0,
              createdBy: "kiosk",
              origin: "kiosk",
              isSystemTest: false,
              productionModeAtOpen: machine.productionMode,
              machineStatusAtOpen: machineCondition ?? machine.machineStatus,
            },
          });

          if (machineCondition === "stopped") {
            await ensureOpenFailureEventForStoppedCall(tx, {
              machineId,
              callId: createdCall.id,
              startedAt: openedAt,
              productionMode: machine.productionMode,
            });
          }

          createdCalls.push(await findCallWithSessions(tx, createdCall.id));
        }

        const referenceCall = createdCalls.at(-1);
        if (!referenceCall) throw new AndonCallValidationError("Nenhum chamado foi criado");

        await tx.machine.update({
          where: { id: machineId },
          data: {
            andonStatus: "open",
            currentCallId: referenceCall.id,
            ...(machineCondition
              ? {
                  machineStatus: machineCondition,
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

  app.patch<{ Params: { id: string }; Body: AttendAndonCallBody }>("/api/andon-calls/:id/attend", async (request, reply) => {
    const body = request.body ?? {};
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");
    if (call.status !== "open") return badRequest(reply, "Chamado não está aberto");

    try {
      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        const technicians = await resolveAttendanceTechnicians(tx, call, body, false);
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

      if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);

      return findCallWithSessions(tx, call.id);
    });

    const [enrichedCall] = await enrichCallsWithAssetSnapshots(updatedCall ? [updatedCall] : []);
    return reply.send(enrichedCall ?? { id: call.id, machineId: call.machineId, status: "cancelled", reason, cancelledBy });
  });

  app.post<{ Params: { id: string }; Body: AddTechnicianBody }>("/api/andon-calls/:id/technicians", async (request, reply) => {
    const call = await prisma.andonCall.findUnique({ include: { machine: true }, where: { id: request.params.id } });
    if (!call) return notFound(reply, "Chamado não encontrado");
    if (call.status !== "in_progress") return badRequest(reply, "Chamado não está em atendimento");

    try {
      const now = new Date();
      const updatedCall = await prisma.$transaction(async (tx) => {
        const technicians = await resolveAttendanceTechnicians(
          tx,
          call,
          request.body ?? {},
          true,
        );
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
      if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);
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
      if (!call.isSystemTest) await syncMachineOperationalState(tx, call.machineId);
      return findCallWithSessions(tx, call.id);
    });

    return updatedCall;
  });

  app.patch<{ Params: { id: string }; Body: FinishAndonCallBody }>("/api/andon-calls/:id/finish", async (request, reply) => {
    const body = request.body ?? {};
    const requestedMachineStatus = optionalString(body.machineStatus);
    const confirmedMachineSetId = optionalString(
      body.confirmedMachineSetId,
    );
    const confirmedMachineSubsetId = optionalString(
      body.confirmedMachineSubsetId,
    );
    const assetChangeReason = optionalString(
      body.assetChangeReason,
    );

    if (
      requestedMachineStatus &&
      !MACHINE_STATUSES.has(requestedMachineStatus)
    ) {
      return badRequest(
        reply,
        "Status operacional inválido",
      );
    }

    if (
      confirmedMachineSubsetId &&
      !confirmedMachineSetId
    ) {
      return badRequest(
        reply,
        "confirmedMachineSetId é obrigatório quando confirmedMachineSubsetId for informado",
      );
    }

    try {
      const updatedCall = await prisma.$transaction(
        async (tx) => {
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
            throw new FinishCallNotFoundError(
              "Chamado não encontrado",
            );
          }

          if (
            call.status === "finished" ||
            call.status === "cancelled"
          ) {
            throw new FinishCallValidationError(
              "Chamado já está encerrado",
            );
          }

          const hasActiveSets =
            await machineHasActiveSets(
              tx,
              call.machineId,
            );

          if (
            hasActiveSets &&
            !confirmedMachineSetId
          ) {
            throw new FinishCallValidationError(
              "O conjunto confirmado é obrigatório para esta máquina",
            );
          }

          const confirmedMachineSet =
            confirmedMachineSetId
              ? await findMachineSetForConfirmation(
                  tx,
                  call.machineId,
                  confirmedMachineSetId,
                  call.machineSetId,
                )
              : null;

          if (
            confirmedMachineSetId &&
            !confirmedMachineSet
          ) {
            throw new FinishCallValidationError(
              "Conjunto confirmado inválido, inativo ou não pertence à máquina",
            );
          }

          const confirmedMachineSubset =
            confirmedMachineSetId &&
            confirmedMachineSubsetId
              ? await findMachineSubsetForConfirmation(
                  tx,
                  confirmedMachineSetId,
                  confirmedMachineSubsetId,
                  call.machineSubsetId,
                )
              : null;

          if (
            confirmedMachineSubsetId &&
            !confirmedMachineSubset
          ) {
            throw new FinishCallValidationError(
              "Subconjunto confirmado inválido, inativo ou incompatível com o conjunto",
            );
          }

          if (
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
            !hasActiveSets &&
            !confirmedMachineSetId;

          const finalMachineSetId =
            confirmedMachineSet?.id ?? null;

          const finalMachineSetCodeSnapshot =
            confirmedMachineSet?.code ??
            (preserveLegacyOpeningSnapshot
              ? call.machineSetCodeSnapshot
              : null);

          const finalMachineSetNameSnapshot =
            confirmedMachineSet?.name ??
            (preserveLegacyOpeningSnapshot
              ? call.machineSetNameSnapshot
              : null);

          const finalMachineSetTypeSnapshot =
            confirmedMachineSet?.type ??
            (preserveLegacyOpeningSnapshot
              ? call.machineSetTypeSnapshot
              : null);

          const preserveLegacyOpeningSubsetSnapshot =
            preserveLegacyOpeningSnapshot &&
            !confirmedMachineSubsetId;

          const finalMachineSubsetId =
            confirmedMachineSubset?.id ?? null;

          const finalMachineSubsetCodeSnapshot =
            confirmedMachineSubset?.code ??
            (preserveLegacyOpeningSubsetSnapshot
              ? call.machineSubsetCodeSnapshot
              : null);

          const finalMachineSubsetNameSnapshot =
            confirmedMachineSubset?.name ??
            (preserveLegacyOpeningSubsetSnapshot
              ? call.machineSubsetNameSnapshot
              : null);

          const finalMachineSubsetTypeSnapshot =
            confirmedMachineSubset?.type ??
            (preserveLegacyOpeningSubsetSnapshot
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

          const openingLocationExists = Boolean(openingSetKey || openingSubsetKey);
          const locationChanged = Boolean(
            openingLocationExists &&
              (openingSetKey !== confirmedSetKey || openingSubsetKey !== confirmedSubsetKey),
          );

          const assetConfirmedBy =
            resolveAutomaticAssetConfirmedBy(
              call,
            );

          const normalizedAssetChangeReason =
            resolveAssetChangeReason(
              locationChanged,
              assetChangeReason,
            );

          const now = new Date();

          await tx.andonCall.update({
            where: {
              id: call.id,
            },
            data: {
              status: "finished",
              currentAttendanceStartedAt: null,
              finishedAt: now,
              notes: appendNote(
                call.notes,
                optionalString(body.notes),
                "Finalização",
              ),
              callWaitingMinutes: diffMinutes(
                call.openedAt,
                call.attendedAt ?? now,
              ),
              attendanceMinutes:
                (call.attendanceMinutes ?? 0) +
                (call.status === "in_progress"
                  ? diffMinutes(
                      call.currentAttendanceStartedAt ??
                        call.attendedAt,
                      now,
                    )
                  : 0),
              postMaintenanceMinutes:
                (call.postMaintenanceMinutes ?? 0) +
                (call.status === "post_maintenance"
                  ? diffMinutes(
                      call.maintenanceCompletedAt,
                      now,
                    )
                  : 0),
              totalCallMinutes: diffMinutes(
                call.openedAt,
                now,
              ),
              machineStoppedMinutes:
                call.machineCondition === "stopped" ||
                call.machine.machineStatus === "stopped"
                  ? diffMinutes(
                      call.openedAt,
                      now,
                    )
                  : 0,
              productionModeAtFinish:
                call.machine.productionMode,
              machineStatusAtFinish:
                call.machine.machineStatus,

              confirmedMachineSetId:
                finalMachineSetId,
              confirmedMachineSetCodeSnapshot:
                finalMachineSetCodeSnapshot,
              confirmedMachineSetNameSnapshot:
                finalMachineSetNameSnapshot,
              confirmedMachineSetTypeSnapshot:
                finalMachineSetTypeSnapshot,

              confirmedMachineSubsetId:
                finalMachineSubsetId,
              confirmedMachineSubsetCodeSnapshot:
                finalMachineSubsetCodeSnapshot,
              confirmedMachineSubsetNameSnapshot:
                finalMachineSubsetNameSnapshot,
              confirmedMachineSubsetTypeSnapshot:
                finalMachineSubsetTypeSnapshot,

              assetConfirmedAt: now,
              assetConfirmedBy,
              assetLocationChanged:
                locationChanged,
              assetChangeReason:
                normalizedAssetChangeReason,
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
              productionModeAtEnd:
                call.machine.productionMode,
              machineStatusAtEnd:
                call.machine.machineStatus,
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
              productionModeAtEnd:
                call.machine.productionMode,
              machineStatusAtEnd:
                call.machine.machineStatus,
            },
          });

          return findCallWithSessions(
            tx,
            call.id,
          );
        },
      );

      return updatedCall;
    } catch (error) {
      if (error instanceof FinishCallNotFoundError) {
        return notFound(
          reply,
          error.message,
        );
      }

      if (
        error instanceof FinishCallValidationError
      ) {
        return badRequest(
          reply,
          error.message,
        );
      }

      throw error;
    }
  });
}
