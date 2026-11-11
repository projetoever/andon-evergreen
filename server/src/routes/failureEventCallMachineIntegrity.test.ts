import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { registerFailureEventRoutes } from "./failureEvents.js";

test("P0 FailureEvent: reject foreign/nonexistent call before touching machine state", async (t) => {
  const flag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const originalTransaction = prisma.$transaction;
  let linkedCallLookups = 0;
  let eventReads = 0;
  let eventCreates = 0;
  let machineUpdates = 0;

  const tx = {
    $queryRaw: async () => [],
    machine: {
      findUnique: async () => ({
        id: "37", machineStatus: "running", productionMode: "production",
      }),
      update: async () => {
        machineUpdates++;
        return { id: "37", machineStatus: "stopped" };
      },
    },
    andonCall: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        linkedCallLookups++;
        return where.id === "same" ? { machineId: "37" } :
          where.id === "foreign" ? { machineId: "39" } : null;
      },
    },
    failureEvent: {
      findMany: async () => {
        eventReads++;
        return [];
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        eventCreates++;
        return { id: "failure-new", ...data };
      },
    },
    failureClassification: {
      findUnique: async () => null,
    },
  };

  (prisma as any).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(tx);
  const app = Fastify();
  await registerFailureEventRoutes(app);
  t.after(async () => {
    await app.close();
    (prisma as any).$transaction = originalTransaction;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = flag;
  });

  const post = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/api/failure-events", payload: {
      machineId: "37", classification: "unclassified", ...body,
    } });

  const foreign = await post({ callId: "foreign" });
  assert.equal(foreign.statusCode, 400, foreign.body);
  assert.equal(foreign.json().error, "invalid_call_machine_reference");
  assert(!foreign.body.includes("39"), "must not leak foreign machine ID");
  assert.deepEqual([eventReads, eventCreates, machineUpdates], [0, 0, 0]);

  const missing = await post({ callId: "not-a-call" });
  assert.equal(missing.statusCode, 400, missing.body);
  assert.equal(missing.json().error, "invalid_call_machine_reference");
  assert.deepEqual([eventReads, eventCreates, machineUpdates], [0, 0, 0]);

  const malformed = await post({ callId: { id: "same" } });
  assert.equal(malformed.statusCode, 400, malformed.body);
  assert.deepEqual([eventReads, eventCreates, machineUpdates], [0, 0, 0]);

  const linked = await post({ callId: "same" });
  assert.equal(linked.statusCode, 201, linked.body);
  assert.equal(linked.json().event.callId, "same");
  assert.equal(linked.json().event.machineId, "37");
  assert.deepEqual([eventReads, eventCreates, machineUpdates], [1, 1, 1]);

  const beforeUnlinked = linkedCallLookups;
  const independent = await post({ callId: null });
  assert.equal(independent.statusCode, 201, independent.body);
  assert.equal(linkedCallLookups, beforeUnlinked, "optional call reference keeps legacy behavior");
  assert.deepEqual([eventReads, eventCreates, machineUpdates], [2, 2, 2]);
});
