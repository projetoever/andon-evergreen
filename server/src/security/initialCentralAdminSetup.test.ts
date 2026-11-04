import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { verifyAccessPassword } from "../access/credentials.js";
import {
  initializeCentralAdminFirstRun, issueInitialAdminSetupToken, InitialAdminSetupError,
} from "./initialAdminSetup.js";

const PASSWORD = "Initial-Admin#Safe2026";
const LOCAL_WS = "ws_00000000-0000-4000-8000-00000000a001";

function localRequest(remoteAddress = "127.0.0.1") {
  return {
    ip: remoteAddress,
    id: "test-local-bootstrap",
    headers: { host: "localhost:3001", origin: "https://localhost:8080" },
    raw: { socket: { encrypted: true, remoteAddress } },
  } as unknown as FastifyRequest;
}

function fixture(options: { legacyHash?: string; previousAccount?: boolean;
  previousWorkstation?: boolean; failAudit?: boolean } = {}) {
  const calls: string[] = [];
  let passwordHash: string | null = null;
  let commits = 0;
  const tx = {
    $queryRaw: async () => { calls.push("lock"); return [{ ok: true }]; },
    systemSettings: {
      upsert: async () => { calls.push("global-settings-row"); return { id: "global" }; },
      findUnique: async () => ({ adminPasswordHash: options.legacyHash ?? null }),
      update: async (args: { data: { requireWorkstationApproval: boolean } }) => {
        assert.equal(args.data.requireWorkstationApproval, true);
        calls.push("enforce-approval");
        return { id: "global", requireWorkstationApproval: true };
      },
    },
    accessUser: {
      findFirst: async () => options.previousAccount ? { id: "existing" } : null,
      create: async (data: { data: Record<string, unknown>; select: { id: true } }) => {
        calls.push("create-primary");
        assert.equal(data.data.login, "admin");
        assert.equal(data.data.isPrimaryAdmin, true);
        assert.equal(data.data.accountType, "person");
        assert.equal(data.data.mustChangePassword, false);
        assert.deepEqual(data.select, { id: true });
        passwordHash = data.data.passwordHash as string;
        assert.notEqual(passwordHash, PASSWORD);
        return { id: "new-admin" };
      },
    },
    workstation: {
      findFirst: async () => options.previousWorkstation ? { id: "existing-station" } : null,
      create: async (args: { data: Record<string, unknown>; select: Record<string, unknown> }) => {
        calls.push("create-local-station");
        assert.equal(args.data.id, LOCAL_WS);
        assert.equal(args.data.active, true);
        assert.equal(args.data.pendingApproval, false);
        assert.equal(args.data.allowOperational, false);
        assert.equal(args.data.allowBi, false);
        assert.equal(args.data.allowPriorities, false);
        assert.equal(args.data.lastIpAddress, "127.0.0.1");
        assert.deepEqual(args.select, { id: true });
        return { id: LOCAL_WS };
      },
    },
    auditEvent: {
      create: async (data: { data: Record<string, unknown> }) => {
        calls.push("audit");
        assert.equal(data.data.action, "access.admin.initialized.local");
        assert.equal(data.data.resourceId, "new-admin");
        assert.equal((data.data.after as Record<string, unknown>).initialAdminWorkstationRegistered, true);
        assert.equal((data.data.after as Record<string, unknown>).workstationApprovalRequired, true);
        assert(!JSON.stringify(data).includes(PASSWORD));
        if (options.failAudit) throw Error("audit_failed");
        return { id: "audit-setup" };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const db = {
    $transaction: async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      calls.push("transaction-start");
      try {
        const result = await cb(tx);
        commits++;
        calls.push("transaction-commit");
        return result;
      } catch (error) {
        calls.push("transaction-rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return {
    db, calls, get commits() { return commits; }, get passwordHash() { return passwordHash; },
  };
}

test("S1/6 one-pass clean central bootstrap stores human Admin, never global secret or session", async (t) => {
  const oldMode = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldCors = process.env.CORS_ORIGINS;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.CORS_ORIGINS = "https://localhost:8080";
  t.after(() => {
    if (oldMode === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldMode;
    if (oldCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = oldCors;
  });
  const req = localRequest();
  const token = issueInitialAdminSetupToken(req);
  assert.match(token ?? "", /^[a-f0-9]{64}$/);
  const f = fixture();
  const result = await initializeCentralAdminFirstRun(f.db, req, { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS });
  assert.deepEqual(result, { ok: true, passwordConfigured: true, centralAccessInitialized: true });
  assert.equal(f.commits, 1);
  assert(f.passwordHash);
  assert.equal(await verifyAccessPassword(PASSWORD, f.passwordHash!), true);
  assert.equal(f.calls.filter(x => x === "create-primary").length, 1);
  assert.equal(f.calls.filter(x => x === "create-local-station").length, 1);
  assert.equal(f.calls.filter(x => x === "enforce-approval").length, 1);
  assert(!f.calls.includes("issue-session"));
  assert.equal(f.calls.at(-1), "transaction-commit");
  await assert.rejects(
    initializeCentralAdminFirstRun(f.db, req, { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS }),
    (err) => err instanceof InitialAdminSetupError && err.code === "setup_token_invalid",
  );
});

test("S1/6 old installations and remote calls never create a central bootstrap account", async (t) => {
  const oldMode = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldCors = process.env.CORS_ORIGINS;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.CORS_ORIGINS = "https://localhost:8080";
  t.after(() => {
    if (oldMode === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldMode;
    if (oldCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = oldCors;
  });
  const req = localRequest();
  for (const options of [
    { legacyHash: "existing-legacy-hash" },
    { previousAccount: true },
    { previousWorkstation: true },
  ]) {
    const token = issueInitialAdminSetupToken(req);
    const f = fixture(options);
    await assert.rejects(
      initializeCentralAdminFirstRun(f.db, req, { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS }),
      (err) => err instanceof InitialAdminSetupError &&
        err.code === "existing_installation_requires_migration",
    );
    assert.equal(f.commits, 0);
    assert(!f.calls.includes("create-primary"));
  }
  const token = issueInitialAdminSetupToken(req);
  const f = fixture();
  await assert.rejects(
    initializeCentralAdminFirstRun(f.db, localRequest("192.0.2.99"),
      { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS }),
    (err) => err instanceof InitialAdminSetupError && err.code === "setup_local_only",
  );
  assert.equal(f.calls.length, 0);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  await assert.rejects(
    initializeCentralAdminFirstRun(f.db, req, { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS }),
    (err) => err instanceof InitialAdminSetupError && err.code === "central_mode_required",
  );
  assert.equal(f.commits, 0);
});

test("S1/6 weak passwords or audit failure fail closed before successful enrollment", async (t) => {
  const oldMode = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldCors = process.env.CORS_ORIGINS;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.CORS_ORIGINS = "https://localhost:8080";
  t.after(() => {
    if (oldMode === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldMode;
    if (oldCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = oldCors;
  });
  const req = localRequest();
  const token = issueInitialAdminSetupToken(req);
  const weak = fixture();
  await assert.rejects(
    initializeCentralAdminFirstRun(weak.db, req, { setupToken: token, password: "12345678", workstationId: LOCAL_WS }),
    (err) => err instanceof InitialAdminSetupError && err.code === "password_policy_failed",
  );
  assert.equal(weak.commits, 0);
  const failed = fixture({ failAudit: true });
  await assert.rejects(
    initializeCentralAdminFirstRun(failed.db, req, { setupToken: token, password: PASSWORD, workstationId: LOCAL_WS }),
    /audit_failed/,
  );
  assert.equal(failed.commits, 0);
  assert.equal(failed.calls.at(-1), "transaction-rollback");
});

test("S1/6 central bootstrap rejects invalid workstation identity before transaction", async (t) => {
  const oldMode = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const oldCors = process.env.CORS_ORIGINS;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.CORS_ORIGINS = "https://localhost:8080";
  t.after(() => {
    if (oldMode === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldMode;
    if (oldCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = oldCors;
  });
  const req = localRequest();
  const token = issueInitialAdminSetupToken(req);
  const f = fixture();
  for (const invalid of ["station-37", "ws-not-a-uuid", "", null, undefined]) {
    await assert.rejects(
      initializeCentralAdminFirstRun(f.db, req, {
        setupToken: token, password: PASSWORD, workstationId: invalid,
      }),
      (err) => err instanceof InitialAdminSetupError && err.code === "invalid_workstation_id",
    );
  }
  assert.equal(f.commits, 0);
  assert.deepEqual(f.calls, []);
});
