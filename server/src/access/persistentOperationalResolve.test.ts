import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { resolveSession } from "./sessions.js";
import { AccessError } from "./policy.js";
import { tokenHash } from "./credentials.js";

const token = "a".repeat(64);
const request = { token, workstationId: "ws-37" };
const old = new Date("2026-01-01T00:00:00.000Z");
const now = new Date("2026-11-11T00:00:00.000Z");

function fixture(changes: {
  persistentOperational?: boolean;
  trust?: boolean;
  active?: boolean;
  lockedMachineId?: string | null;
  revoked?: boolean;
  admin?: boolean;
  privileged?: boolean;
  purpose?: string;
  versionMismatch?: boolean;
} = {}) {
  const row = {
    id: "s-37", userId: "u-37", workstationId: "ws-37",
    tokenHash: tokenHash(token), purpose: changes.purpose ?? "normal",
    persistentOperational: changes.persistentOperational ?? false,
    createdAt: old, lastInteractionAt: old,
    expiresAt: old, revokedAt: changes.revoked ? old : null,
    authorizationVersion: changes.versionMismatch ? 5 : 4,
    workstation: {
      active: changes.active ?? true, pendingApproval: false,
      allowPersistentOperationalLogin: changes.trust ?? true,
      lockedMachineId: changes.lockedMachineId === undefined ? "37" : changes.lockedMachineId,
    },
    user: {
      id: "u-37", login: "producao", displayName: "Produção",
      roleLabel: "Produção", accountType: "person", active: true,
      isPrimaryAdmin: changes.admin ?? false,
      mustChangePassword: false, machineScope: "selected",
      authorizationVersion: 4,
      machines: [{ machineId: "37" }],
      permissions: [{ key: "andon.read" }, { key: "calls.open" },
        ...(changes.privileged ? [{ key: "workstations.manage" }] : [])],
    },
  };
  const reader = {
    accessSession: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        assert.equal(where.tokenHash, tokenHash(token));
        return row;
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "accessSession">;
  return reader;
}

test("REFINE15: trusted operator remains authenticated past both idle and absolute limits", async () => {
  const p = await resolveSession(fixture({ persistentOperational: true }), request, now);
  assert.equal(p.persistentOperational, true);
  assert.equal(p.login, "producao");
  assert.equal(p.machineScope, "selected");
  assert.deepEqual(p.machineIds, ["37"]);
  assert.deepEqual(p.permissions, ["andon.read", "calls.open"]);
  await assert.rejects(resolveSession(fixture(), request, now), (e: unknown) =>
    e instanceof AccessError && e.statusCode === 401);
});

test("REFINE15: durable session stops immediately on revocation, trust-off, unpinning and role elevation", async () => {
  for (const patch of [
    { revoked: true }, { trust: false }, { lockedMachineId: null },
    { active: false }, { admin: true }, { privileged: true },
    { purpose: "password_change" }, { versionMismatch: true },
  ]) {
    await assert.rejects(resolveSession(fixture({
      persistentOperational: true, ...patch,
    }), request, now), (e: unknown) =>
      e instanceof AccessError && [401, 403].includes(e.statusCode), JSON.stringify(patch));
  }
});
