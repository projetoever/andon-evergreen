import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { lockUser } from "../dist/access/sessions.js";
import { lockWorkstationFlow } from "../dist/db/workstationFlowLock.js";

// Two independent PostgreSQL connections. No real users, workstations or
// operational data are created/updated. Advisory locks are scoped to the
// transaction and the isolated andon_test database only.
if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
) throw Error("Use isolated andon_test with ANDON_INTEGRATION_TEST=1");

const first = new PrismaClient();
const second = new PrismaClient();
const key = randomUUID();
const actor = `lock-user-${key}`;
const station = `lock-workstation-${key}`;
const unrelated = `other-workstation-${key}`;
const tryLock = async (tx, name) => {
  const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS "acquired"`;
  return rows[0].acquired;
};

try {
  let markHeld;
  let release;
  const held = new Promise((resolve) => { markHeld = resolve; });
  const unblock = new Promise((resolve) => { release = resolve; });
  const holder = first.$transaction(async (tx) => {
    await lockUser(tx, actor);
    await lockWorkstationFlow(tx, station);
    markHeld();
    await unblock;
  }, { timeout: 10000 });

  try {
    await held;
    await second.$transaction(async (tx) => {
      assert.equal(await tryLock(tx, `andon-access:${actor}`), false,
        "same user must be excluded by the canonical user lock");
      assert.equal(await tryLock(tx, `andon-workstation:${station}`), false,
        "same workstation must be excluded by the canonical station lock");
      assert.equal(await tryLock(tx, `andon-workstation:${unrelated}`), true,
        "an unrelated workstation should not be blocked");
      assert.equal(await tryLock(tx, `andon-access:other-${actor}`), true,
        "an unrelated user should not be blocked");
    });
  } finally {
    release();
    await holder;
  }

  await second.$transaction(async (tx) => {
    assert.equal(await tryLock(tx, `andon-access:${actor}`), true,
      "user lock must release at commit");
    assert.equal(await tryLock(tx, `andon-workstation:${station}`), true,
      "station lock must release at commit");
  });

  // Rollback must also release exactly the same workstation advisory lock.
  let markRollbackHeld;
  let releaseRollback;
  const rollbackHeld = new Promise((resolve) => { markRollbackHeld = resolve; });
  const unblockRollback = new Promise((resolve) => { releaseRollback = resolve; });
  const rolledBack = first.$transaction(async (tx) => {
    await lockWorkstationFlow(tx, station);
    markRollbackHeld();
    await unblockRollback;
    throw Error("expected rollback");
  }, { timeout: 10000 });
  try {
    await rollbackHeld;
    await second.$transaction(async (tx) => {
      assert.equal(await tryLock(tx, `andon-workstation:${station}`), false,
        "workstation must remain held until rollback");
    });
  } finally {
    releaseRollback();
    await assert.rejects(rolledBack, /expected rollback/);
  }
  await second.$transaction(async (tx) => {
    assert.equal(await tryLock(tx, `andon-workstation:${station}`), true,
      "workstation lock must release after rollback");
  });

  console.log("SEC-04/2A.7 PostgreSQL advisory locks: PASS (two connections, isolation, commit, rollback)");
} finally {
  await first.$disconnect();
  await second.$disconnect();
}
