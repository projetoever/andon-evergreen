import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { AccessError, type Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { buildScopedGlobalHistoryQuery } from "../services/globalCallHistoryQuery.js";
import {
  bindAuthorizedMachineReadPrincipal, isScopedMachineReadRoute,
  scopedGlobalHistoryReadIds,
} from "../security/centralScopedMachineReads.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

const identity = (grants: string[], machineIds = ["15"]): Principal => ({
  userId: "user-1", login: "vini", displayName: "Vini",
  roleLabel: "Gestor/Gerente", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: [...machineIds],
  permissions: grants, sessionId: "session-1", workstationId: "station-1",
  purpose: "normal", authenticatedAt: new Date(),
});

test("HIST-02: SQL query intersects machine scope with filters BEFORE pagination/count", () => {
  const query = buildScopedGlobalHistoryQuery({
    machineId: "11", status: "finished", subtype: "electrical",
    technician: "Carlos", failureClassification: "failure_electrical",
    reasonId: "maintenance", origin: "real", query: "OS-22",
    openedFrom: "2026-11-12T00:00:00-03:00",
    openedBefore: "2026-11-13T00:00:00-03:00",
    limit: "25", offset: "50",
  }, ["15"]);
  assert.equal(query.take, 25);
  assert.equal(query.skip, 50);
  assert.deepEqual(query.orderBy, [{ openedAt: "desc" }, { id: "desc" }]);
  assert.deepEqual((query.where.AND as unknown[]).slice(0, 2), [
    { machineId: "11" }, { machineId: { in: ["15"] } },
  ]);
  assert.equal(query.where.status, "finished");
  assert.equal(query.where.subtype, "electrical");
  assert.equal(query.where.isSystemTest, false);
  assert.deepEqual(query.where.callReasonSnapshot, { is: { reasonId: "maintenance" } });
  assert((query.where.openedAt as { gte: Date }).gte instanceof Date);
  assert.equal((query.where.AND as unknown[]).length, 3,
    "free-text OR is a further AND constraint and cannot weaken machine scope");
  assert.deepEqual(buildScopedGlobalHistoryQuery({}, []).where,
    { AND: [{ machineId: { in: [] } }] });
  assert.deepEqual(buildScopedGlobalHistoryQuery({}, null).where, {});
});

test("HIST-02: invalid filters, dates and unbounded pagination fail before SQL", () => {
  const bad = [
    { status: "drop" }, { origin: "unknown" }, { limit: "0" },
    { limit: "9999" }, { offset: "-1" }, { offset: "999999" },
    { query: "A".repeat(101) }, { openedFrom: "2026-11-12" },
    { openedFrom: "2026-11-13T00:00:00Z", openedBefore: "2026-11-12T00:00:00Z" },
  ];
  for (const q of bad) assert.throws(
    () => buildScopedGlobalHistoryQuery(q, ["15"]),
    (e: unknown) => e instanceof AccessError && e.statusCode === 400,
    JSON.stringify(q),
  );
});

test("HIST-02: central feature and bound history.read are mandatory for a global query", () => {
  const prev = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    assert.equal(isScopedMachineReadRoute("GET", "/api/andon-calls/history/search"), true);
    assert.equal(isScopedMachineReadRoute("HEAD", "/api/andon-calls/history/search"), true);
    assert.equal(isScopedMachineReadRoute("POST", "/api/andon-calls/history/search"), false);
    const unbound = {} as FastifyRequest;
    assert.throws(() => scopedGlobalHistoryReadIds(unbound), /central_read_context_required/);
    const noGrant = {} as FastifyRequest;
    bindAuthorizedMachineReadPrincipal(noGrant, identity(["andon.read"]));
    assert.throws(() => scopedGlobalHistoryReadIds(noGrant), /permission_denied/);
    const yes = {} as FastifyRequest;
    bindAuthorizedMachineReadPrincipal(yes, identity(["andon.read", "history.read"], []));
    assert.deepEqual(scopedGlobalHistoryReadIds(yes), [], "empty selected scope stays empty");
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    assert.throws(() => scopedGlobalHistoryReadIds(yes), /global_history_disabled/);
  } finally {
    if (prev === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = prev;
  }
});

test("HIST-02: route is OFF by default and does not read DB without flag + authorized scope", async t => {
  const flags = {
    central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    global: process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED,
  };
  const original = { find: prisma.andonCall.findMany, count: prisma.andonCall.count };
  let reads = 0;
  let lastWhere: unknown;
  prisma.andonCall.findMany = (async (args: any) => {
    reads++;
    lastWhere = args.where;
    assert.equal(args.select.id, true);
    assert.deepEqual(args.orderBy, [{ openedAt: "desc" }, { id: "desc" }]);
    return [];
  }) as typeof original.find;
  prisma.andonCall.count = (async (args: any) => {
    reads++;
    lastWhere = args.where;
    return 0;
  }) as typeof original.count;
  t.after(() => {
    prisma.andonCall.findMany = original.find;
    prisma.andonCall.count = original.count;
    if (flags.central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = flags.central;
    if (flags.global === undefined) delete process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED = flags.global;
  });
  const app = Fastify();
  let grants = ["andon.read", "history.read"];
  app.addHook("preHandler", async req => {
    bindAuthorizedMachineReadPrincipal(req, identity(grants));
  });
  await registerAndonCallRoutes(app);
  t.after(() => app.close());
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED = "0";
  let response = await app.inject({url:"/api/andon-calls/history/search"});
  assert.equal(response.statusCode,403);
  assert.equal(response.json().error,"global_history_disabled");
  assert.equal(reads,0);
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED = "1";
  grants = ["andon.read"];
  response = await app.inject({url:"/api/andon-calls/history/search"});
  assert.equal(response.statusCode,403);
  assert.equal(response.json().error,"permission_denied");
  assert.equal(reads,0);
  grants = ["andon.read","history.read"];
  response = await app.inject({
    url:"/api/andon-calls/history/search?machineId=11&limit=10&offset=20&origin=real",
  });
  assert.equal(response.statusCode,200,response.body);
  assert.deepEqual(response.json(), { items:[], total:0, limit:10, offset:20, hasMore:false });
  assert.equal(reads,2);
  assert.deepEqual((lastWhere as any).AND, [
    {machineId:"11"}, {machineId:{in:["15"]}},
  ]);
  assert.equal((lastWhere as any).isSystemTest,false);
  response = await app.inject({url:"/api/andon-calls/history/search?limit=10000"});
  assert.equal(response.statusCode,400);
  assert.equal(reads,2, "invalid query must never reach DB");
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  response = await app.inject({url:"/api/andon-calls/history/search"});
  assert.equal(response.statusCode,403);
  assert.equal(reads,2);
});
