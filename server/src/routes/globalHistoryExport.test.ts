import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import type { Principal } from "../access/policy.js";
import { ACCESS_COOKIE } from "../access/http.js";
import { tokenHash } from "../access/credentials.js";
import { bindAuthorizedMachineReadPrincipal, isScopedMachineReadRoute } from "../security/centralScopedMachineReads.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

const token = "b".repeat(64);
const station = "ws-history-1";
const id = (grants: string[], machines = ["15"]): Principal => ({
  userId: "u1", login: "historian", displayName: "Historian",
  roleLabel: "Gerente", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: machines,
  permissions: grants, sessionId: "session-1", workstationId: station,
  purpose: "normal", authenticatedAt: new Date(),
});
const record = {
  id: "call-1", machineId: "15", machine: { name: "Machine 15" },
  category: "maintenance", subtype: "mechanical",
  status: "finished", criticality: "high",
  workOrderNumber: "OS-15", failureClassification: null,
  technicianName: "Carlos", technicianNames: ["Carlos"],
  isSystemTest: false, openedAt: new Date("2026-11-14T10:00:00Z"),
  finishedAt: new Date("2026-11-14T11:00:00Z"), updatedAt: new Date("2026-11-14T11:00:00Z"),
  callReasonSnapshot: null,
};

test("HIST-13: bound module/history scope, session revalidation, 500 cap and audit are fail closed", async t => {
  const previous = {
    central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    enabled: process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED,
    transaction: prisma.$transaction,
  };
  t.after(() => {
    prisma.$transaction = previous.transaction;
    for (const [key, value] of [
      ["ANDON_CENTRAL_ACCESS_ENABLED", previous.central],
      ["ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED", previous.enabled],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  assert.equal(isScopedMachineReadRoute("GET", "/api/andon-calls/history/export"), true);
  assert.equal(isScopedMachineReadRoute("HEAD", "/api/andon-calls/history/export"), true);
  assert.equal(isScopedMachineReadRoute("POST", "/api/andon-calls/history/export"), false);

  let firstGrants = ["andon.read", "history.read", "history.global.read"];
  let freshGrants = ["andon.read", "history.read", "history.global.read"];
  let sessionRevoked = false;
  let shouldFailAudit = false;
  let fullCount = 1;
  let transactions = 0;
  let counts = 0;
  let selects = 0;
  let audits = 0;
  let lastWhere: unknown;
  const tx = {
    accessSession: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        assert.equal(where.tokenHash, tokenHash(token));
        return {
          id: "session-1", workstationId: station, purpose: "normal",
          authorizationVersion: 4, revokedAt: sessionRevoked ? new Date() : null,
          persistentOperational: false, createdAt: new Date(),
          lastAuthenticatedAt: new Date(), lastInteractionAt: new Date(),
          expiresAt: new Date(Date.now() + 3_600_000),
          workstation: { active: true, pendingApproval: false },
          user: {
            id: "u1", login: "historian", displayName: "Historian",
            roleLabel: "Gerente", accountType: "person", active: true,
            isPrimaryAdmin: false, mustChangePassword: false,
            authorizationVersion: 4, machineScope: "selected",
            permissions: freshGrants.map(key => ({ key })),
            machines: [{ machineId: "15" }],
          },
        };
      },
    },
    andonCall: {
      count: async ({ where }: { where: unknown }) => {
        counts++;
        lastWhere = where;
        return fullCount;
      },
      findMany: async ({ where, take, select, orderBy }: {
        where: unknown; take: number; select: Record<string, unknown>; orderBy: unknown;
      }) => {
        selects++;
        assert.deepEqual(where, lastWhere);
        assert.equal(take, 501);
        assert.equal(select.id, true);
        assert.equal(select.criticality, true);
        assert.deepEqual(orderBy, [{ openedAt: "desc" }, { id: "desc" }]);
        return fullCount === 0 ? [] : [record];
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, any> }) => {
        if (shouldFailAudit) throw new Error("audit_write_failed");
        audits++;
        assert.equal(data.action, "history.export.csv");
        assert.equal(data.actorUserId, "u1");
        assert.equal(data.sessionId, "session-1");
        assert.equal(data.workstationId, station);
        assert.equal(data.resourceType, "andon_call_history");
        assert.equal(data.after.recordCount, fullCount);
        assert.equal(data.after.maxRows, 500);
        assert.equal("workOrderNumber" in data.after, false);
        return { id: "audit-1" };
      },
    },
  };
  prisma.$transaction = (async (run: (tx: unknown) => Promise<unknown>, options?: {
    isolationLevel: string; timeout: number;
  }) => {
    transactions++;
    assert.equal(options?.isolationLevel, "RepeatableRead");
    assert.equal(options?.timeout, 10000);
    return run(tx);
  }) as unknown as typeof previous.transaction;

  const app = Fastify();
  t.after(() => app.close());
  app.addHook("preHandler", async (request: FastifyRequest) => {
    bindAuthorizedMachineReadPrincipal(request, id(firstGrants));
  });
  await registerAndonCallRoutes(app);
  const query = "/api/andon-calls/history/export?machineId=15&criticality=high&origin=real";
  const headers = { cookie: ACCESS_COOKIE + "=" + token };

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED = "0";
  let response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 403);
  assert.equal(transactions, 0);

  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED = "1";
  firstGrants = ["andon.read"];
  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 403);
  assert.equal(transactions, 0);

  firstGrants = ["andon.read", "history.read", "history.global.read"];
  response = await app.inject({ method: "HEAD", url: query, headers });
  assert.equal(response.statusCode, 405);
  assert.equal(transactions, 0, "HEAD must not issue downloads");

  response = await app.inject({ url: query + "&offset=0", headers });
  assert.equal(response.statusCode, 400);
  assert.equal(transactions, 0, "client-side pagination cannot change completeness");
  response = await app.inject({ url: query + "&status=forbidden", headers });
  assert.equal(response.statusCode, 400);
  assert.equal(counts, 0);

  sessionRevoked = true;
  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 401);
  assert.equal(counts, 0);
  sessionRevoked = false;

  freshGrants = ["andon.read"];
  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 403);
  assert.equal(counts, 0);
  freshGrants = ["andon.read", "history.read", "history.global.read"];

  fullCount = 501;
  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 413, response.body);
  assert.equal(response.json().error, "history_export_limit_exceeded");
  assert.equal(selects, 0);
  assert.equal(audits, 0, "no successful audit for blocked export");

  fullCount = 1;
  shouldFailAudit = true;
  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 500, response.body);
  assert.equal(audits, 0, "failed audit cannot expose records");
  shouldFailAudit = false;

  response = await app.inject({ url: query, headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.json().total, 1);
  assert.equal(response.json().maxRows, 500);
  assert.equal(response.json().items.length, 1);
  assert.equal(response.json().items[0].workOrderNumber, "OS-15");
  assert.equal(audits, 1);
  assert.deepEqual((lastWhere as any).AND, [
    { machineId: "15" }, { machineId: { in: ["15"] } },
  ]);
  assert.equal((lastWhere as any).criticality, "high");
  assert.equal((lastWhere as any).isSystemTest, false);
});
