import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { resolveOpeningReasonInTransaction } from "./callReasonOpening.js";

const reason = {
  id: "setup", displayName: "Setup", active: true, revision: 2,
  nature: "planned_setup", suggestedResponsibility: "operations",
  maintenanceKpiPolicy: "excluded", analyticsDisposition: "include",
};
const technicalArea = {
  id: "mechanical", displayName: "Mecânica", active: true, categoryGroup: "maintenance",
};
const option = {
  id: "setup_mechanical", reasonId: "setup", technicalAreaId: "mechanical",
  displayName: null, active: true, revision: 4, natureOverride: null,
  suggestedResponsibilityOverride: null, maintenanceKpiPolicyOverride: null,
  analyticsDispositionOverride: null,
};
const input = {
  catalogEnabled: true, hierarchicalOpeningEnabled: true,
  legacyCategory: "maintenance", legacySubtype: "mechanical",
  selection: {
    reasonId: "setup", optionId: "setup_mechanical",
    expectedReasonRevision: 2, expectedOptionRevision: 4,
  },
};

function fakeTx(patch: {
  reason?: Record<string, unknown>;
  option?: Record<string, unknown>;
  area?: Record<string, unknown>;
  missing?: number;
} = {}) {
  let index = 0;
  const events: string[] = [];
  const tx = {
    $queryRaw: async () => {
      events.push(["reason", "option", "area"][index] ?? "unexpected");
      index++;
      if (patch.missing === index) return [];
      if (index === 1) return [{ id: "setup" }];
      if (index === 2) return [{ id: "setup_mechanical", technicalAreaId: "mechanical" }];
      return [{ id: "mechanical" }];
    },
    callReasonOption: {
      findUnique: async () => {
        events.push("fetch");
        return {
          ...option, ...patch.option,
          reason: { ...reason, ...patch.reason },
          technicalArea: { ...technicalArea, ...patch.area },
        };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, events };
}

test("S3-B2 transaction resolves one setup snapshot without marking corrective KPI", async () => {
  const { tx, events } = fakeTx();
  const snapshot = await resolveOpeningReasonInTransaction(tx, input);
  assert.deepEqual(events, ["reason", "option", "area", "fetch"]);
  assert.equal(snapshot.reasonNameSnapshot, "Setup");
  assert.equal(snapshot.optionNameSnapshot, "Mecânica");
  assert.equal(snapshot.nature, "planned_setup");
  assert.equal(snapshot.maintenanceKpiPolicy, "excluded");
  assert.equal(snapshot.reasonRevision, 2);
  assert.equal(snapshot.optionRevision, 4);
});

test("S3-B2 transaction rejects missing reason, option or technical area", async () => {
  for (const missing of [1, 2, 3]) {
    const { tx, events } = fakeTx({ missing });
    await assert.rejects(resolveOpeningReasonInTransaction(tx, input));
    assert.equal(events.includes("fetch"), false);
  }
});

test("S3-B2 transaction refuses inactive, altered revision or mismatched category", async () => {
  for (const patch of [
    { reason: { active: false } }, { option: { active: false } },
    { area: { active: false } }, { reason: { revision: 3 } },
    { option: { revision: 5 } }, { option: { technicalAreaId: "electrical" } },
    { area: { categoryGroup: "production" } },
    { option: { reasonId: "maintenance" } },
  ]) {
    const { tx } = fakeTx(patch);
    await assert.rejects(resolveOpeningReasonInTransaction(tx, input));
  }
});

test("S3-B2 transaction never queries the database while disabled", async () => {
  const { tx, events } = fakeTx();
  await assert.rejects(resolveOpeningReasonInTransaction(tx, {
    ...input, hierarchicalOpeningEnabled: false,
  }), /hierarchical_calls_disabled/);
  assert.equal(events.length, 0);
});
