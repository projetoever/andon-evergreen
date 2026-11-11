import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { AccessError } from "../access/policy.js";
import { runCentralCallReasonWrite, type CallReasonWrite } from "../access/centralCallReasonsWrite.js";
import {
  isAuthorizedCentralCallReasonRead, isAuthorizedCentralCallReasonRequest,
  isAuthorizedCentralOperationalReasonRead,
} from "../security/centralCallReasonsHttp.js";
import { assertEffectiveReasonOption } from "../services/callReasonMutations.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

const DENIED = { error: "central_action_not_supported" };

async function mutateReason(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: CallReasonWrite["operation"],
  reasonId?: string,
  optionId?: string,
) {
  reply.header("Cache-Control", "no-store");
  // A marker on this exact request is set only by the previous HTTPS,
  // Origin, workstation, central session, Admin/CSRF prehandler.
  if (!isAuthorizedCentralCallReasonRequest(request))
    return reply.status(403).send(DENIED);
  try {
    const saved = await runCentralCallReasonWrite(prisma, {
      operation, reasonId, optionId,
      body: request.body,
      token: readSecureCookie(request, ACCESS_COOKIE),
      workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
      requestId: request.id,
      ipAddress: request.ip.replace(/^::ffff:/, ""),
    });
    return reply.status(operation.endsWith("create") ? 201 : 200).send(saved);
  } catch (error) {
    if (error instanceof AccessError)
      return reply.status(error.statusCode).send({ error: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2003"))
      return reply.status(409).send({ error: "call_reason_catalog_conflict" });
    throw error;
  }
}

export function registerCallReasonRoutes(app: FastifyInstance) {
  app.get("/api/call-reasons", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isAuthorizedCentralCallReasonRead(request))
      return reply.status(403).send(DENIED);
    const rows = await prisma.callReason.findMany({
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }, { id: "asc" }],
      include: {
        options: {
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          include: { technicalArea: true },
        },
      },
    });
    // Effective policies are computed for display; none of these values
    // authorize opening a call or affect current BI calculation.
    return rows.map(({ options, ...reason }) => ({
      ...reason,
      options: options.map(({ technicalArea, ...option }) => ({
        ...option,
        technicalArea: {
          id: technicalArea.id, displayName: technicalArea.displayName,
          active: technicalArea.active, categoryGroup: technicalArea.categoryGroup,
        },
        effectivePolicy: assertEffectiveReasonOption(reason, option, technicalArea),
      })),
    }));
  });

  // Sanitized operational catalog: no Admin metadata, no inactive options
  // and no permission to mutate the underlying KPI policy.
  app.get("/api/call-reasons/operational", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!isAuthorizedCentralOperationalReasonRead(request))
      return reply.status(403).send(DENIED);
    const reasons = await prisma.callReason.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }, { id: "asc" }],
      select: {
        id: true, displayName: true, color: true, revision: true,
        options: {
          where: { active: true, technicalArea: { active: true } },
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          select: {
            id: true, revision: true, technicalAreaId: true,
            displayName: true,
            technicalArea: { select: { displayName: true, categoryGroup: true } },
          },
        },
      },
    });
    return reasons.map(({ options, ...reason }) => ({
      ...reason,
      options: options.map(({ technicalArea, ...option }) => ({
        ...option,
        displayName: option.displayName ?? technicalArea.displayName,
        legacyCategory: technicalArea.categoryGroup,
        legacySubtype: option.technicalAreaId,
      })),
    }));
  });

  app.post("/api/call-reasons", (request, reply) =>
    mutateReason(request, reply, "reason.create"));

  app.patch<{ Params: { reasonId: string } }>(
    "/api/call-reasons/:reasonId",
    (request, reply) => mutateReason(request, reply, "reason.update", request.params.reasonId),
  );

  app.post<{ Params: { reasonId: string } }>(
    "/api/call-reasons/:reasonId/options",
    (request, reply) => mutateReason(request, reply, "option.create", request.params.reasonId),
  );

  app.patch<{ Params: { reasonId: string; optionId: string } }>(
    "/api/call-reasons/:reasonId/options/:optionId",
    (request, reply) =>
      mutateReason(request, reply, "option.update", request.params.reasonId, request.params.optionId),
  );
}
