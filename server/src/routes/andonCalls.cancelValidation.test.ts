import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import { prisma } from "../db/prisma.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

test("rejeita cancelamento sem justificativa antes de acessar o banco", async () => {
  const app = Fastify();
  const andonCallDelegate = prisma.andonCall as typeof prisma.andonCall & {
    findUnique: typeof prisma.andonCall.findUnique;
  };
  const mutablePrisma = prisma as typeof prisma & {
    $transaction: typeof prisma.$transaction;
  };
  const originalFindUnique = andonCallDelegate.findUnique;
  const originalTransaction = mutablePrisma.$transaction;
  let findUniqueCalls = 0;
  let transactionCalls = 0;

  andonCallDelegate.findUnique = (async () => {
    findUniqueCalls += 1;
    throw new Error("O banco não deveria ser consultado");
  }) as unknown as typeof prisma.andonCall.findUnique;
  mutablePrisma.$transaction = (async () => {
    transactionCalls += 1;
    throw new Error("Nenhuma transação deveria ser iniciada");
  }) as typeof prisma.$transaction;

  try {
    await registerAndonCallRoutes(app);

    const invalidPayloads: Array<Record<string, unknown> | undefined> = [
      undefined,
      { reason: "" },
      { reason: "   \n  " },
    ];

    for (const payload of invalidPayloads) {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/andon-calls/call-1/cancel",
        ...(payload === undefined ? {} : { payload }),
      });

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), {
        error: "bad_request",
        message: "Justificativa do cancelamento é obrigatória.",
      });
    }

    assert.equal(findUniqueCalls, 0);
    assert.equal(transactionCalls, 0);
  } finally {
    andonCallDelegate.findUnique = originalFindUnique;
    mutablePrisma.$transaction = originalTransaction;
    await app.close();
  }
});
