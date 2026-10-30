import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerVisualPaletteRoutes } from "../dist/routes/visualPalette.js";
import { runCentralVisualPaletteUpdate } from "../dist/access/centralVisualPalette.js";
import { publicVisualPalette } from "../dist/services/andonVisualPalette.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("UX-12 palette E2E requires isolated /andon_test and central OFF");

const db = new PrismaClient();
const id = randomUUID(), workstationId = "ws_" + id;
const token = randomBytes(32).toString("hex");
const login = "ci.palette." + id.replaceAll("-", "").slice(0, 12);
const oldEnv = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, original;
try {
  original = await db.systemSettings.findUnique({ where: { id: "global" } });
  await db.systemSettings.upsert({
    where: { id: "global" }, update: {}, create: { id: "global" },
  });
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI visual palette", roleLabel: "Admin",
    isPrimaryAdmin: true, accountType: "person", machineScope: "all",
    passwordHash: "no-human-login", mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }] },
  } });
  userId = user.id;
  const now = new Date();
  sessionId = (await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3600000),
  } })).id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async request => {
    Object.defineProperty(request.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerVisualPaletteRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (body, override = {}) =>
    app.inject({ method: "PATCH", url: "/api/andon-visual-palette",
      headers: { ...headers, ...override }, payload: body });
  const auditCount = () => db.auditEvent.count({
    where: { action: "andon.visual_palette.updated",
      resourceType: "system_settings", resourceId: "global", actorLogin: login },
  });
  const before = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  const first = publicVisualPalette(before.andonVisualPalette);
  const palette = {
    ...first,
    cardBorder: first.cardBorder === "ocean" ? "indigo" : "ocean",
  };
  const request = { palette, expectedRevision: before.andonVisualPaletteRevision };

  assert.equal((await send(request, { cookie: "" })).statusCode, 401);
  assert.equal((await send(request, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send({ ...request, danger: "ocean" })).statusCode, 400);
  assert.equal((await send({ ...request, palette: {
    ...palette, warning: "evergreen",
  } })).statusCode, 400);
  assert.equal(await auditCount(), 0);

  await db.accessUser.update({ where: { id: userId }, data: { isPrimaryAdmin: false } });
  assert.equal((await send(request)).statusCode, 403);
  await db.accessUser.update({ where: { id: userId },
    data: { isPrimaryAdmin: true, machineScope: "selected" } });
  assert.equal((await send(request)).statusCode, 403);
  await db.accessUser.update({ where: { id: userId },
    data: { isPrimaryAdmin: true, machineScope: "all" } });

  // Invalid audit actor IP causes a DB insert failure: mutation must roll back.
  await assert.rejects(runCentralVisualPaletteUpdate(db, {
    token, workstationId, body: request, ipAddress: "x".repeat(46),
  }));
  assert.equal((await db.systemSettings.findUniqueOrThrow({
    where: { id: "global" }, select: { andonVisualPaletteRevision: true },
  })).andonVisualPaletteRevision, before.andonVisualPaletteRevision);
  assert.equal(await auditCount(), 0);

  // Lock row + optimistic revision: only one of two competing Admin requests
  // may commit; the other sees 409 instead of silently overwriting.
  const replies = await Promise.all([send(request), send(request)]);
  assert.deepEqual(replies.map(reply => reply.statusCode).sort(), [200, 409]);
  const accepted = replies.find(reply => reply.statusCode === 200);
  assert.equal(accepted.json().revision, before.andonVisualPaletteRevision + 1);
  assert.equal(accepted.json().palette.cardBorder, palette.cardBorder);
  assert.equal(await auditCount(), 1);

  const after = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  assert.equal(after.andonVisualPaletteRevision, before.andonVisualPaletteRevision + 1);
  assert.equal(after.dashboardSoundMuted, before.dashboardSoundMuted,
    "palette cannot modify shared sound/siren state");
  assert.equal((await send(request)).statusCode, 409, "stale revision must fail");
  assert.equal(await auditCount(), 1);
  const noOp = await send({ palette, expectedRevision: after.andonVisualPaletteRevision });
  assert.equal(noOp.statusCode, 200);
  assert.equal(noOp.json().changed, false);
  assert.equal(await auditCount(), 1);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { action: "andon.visual_palette.updated", actorLogin: login },
  });
  assert.equal(audit.workstationId, workstationId);
  assert(!JSON.stringify(audit).includes(token));

  process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "0";
  assert.equal((await send({ palette, expectedRevision: after.andonVisualPaletteRevision })).statusCode, 403);
  process.env.ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  assert.equal((await send({ palette, expectedRevision: after.andonVisualPaletteRevision })).statusCode, 401);
  console.log("UX-12 central palette PG PASS: ACL, CSRF, revision race, audit rollback, no-op, revocation");
} finally {
  if (app) await app.close();
  for (const [key, env] of [
    ["central", "ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag", "ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED"],
    ["origin", "ANDON_ACCESS_ORIGIN"],
  ]) {
    if (oldEnv[key] === undefined) delete process.env[env];
    else process.env[env] = oldEnv[key];
  }
  if (original) await db.systemSettings.update({
    where: { id: "global" },
    data: {
      andonVisualPalette: original.andonVisualPalette,
      andonVisualPaletteRevision: original.andonVisualPaletteRevision,
    },
  });
  else await db.systemSettings.deleteMany({ where: { id: "global" } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId },
      data: { active: false, isPrimaryAdmin: false } });
  }
  await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.$disconnect();
}
