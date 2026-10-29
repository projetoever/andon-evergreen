import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { preflightCentralAssetWrite } from "../dist/access/centralAssetWritePreflight.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("SEC-04/2B.1: isolated /andon_test only; central writes must remain disabled");

const db = new PrismaClient();
const n = randomUUID().slice(0, 12);
const ownMachineId = `ci-asset-own-${n}`;
const foreignMachineId = `ci-asset-foreign-${n}`;
const setIds = [`ci-set-own-${n}`, `ci-set-foreign-${n}`];
const subsetIds = [`ci-sub-own-${n}`, `ci-sub-foreign-${n}`];
const principal = {
  userId: "ci-scoped-asset",
  login: "ci-scoped-asset",
  displayName: "Isolated asset manager",
  roleLabel: "Maintenance",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: "selected",
  machineIds: [ownMachineId],
  permissions: ["andon.read", "catalog.assets.manage"],
  sessionId: "ci-session",
  workstationId: "ws_ci-scoped-asset",
  purpose: "normal",
  authenticatedAt: new Date(),
};
const workstation = {
  id: principal.workstationId,
  active: true, pendingApproval: false,
  allowOperational: true, allowBi: false, allowPriorities: false,
};
function routeCases(machineId, setId, subsetId) {
  return [
    ["POST", `/api/machines/${machineId}/sets`, { name: "Sample" }, "set.create"],
    ["PATCH", `/api/machine-sets/${setId}`, { name: "Rename" }, "set.update"],
    ["DELETE", `/api/machine-sets/${setId}`, undefined, "set.delete"],
    ["POST", `/api/machine-sets/${setId}/subsets`, { name: "Sample" }, "subset.create"],
    ["PATCH", `/api/machine-subsets/${subsetId}`, { name: "Rename" }, "subset.update"],
    ["DELETE", `/api/machine-subsets/${subsetId}`, undefined, "subset.delete"],
  ];
}
async function check(method, path, body, changes = {}) {
  return db.$transaction((tx) => preflightCentralAssetWrite({
    tx, principal: changes.principal ?? principal,
    workstation: changes.workstation ?? workstation,
    request: { method, path, body },
  }));
}

try {
  await db.machine.createMany({
    data: [
      { id: ownMachineId, name: "CI asset own machine", isActive: true },
      { id: foreignMachineId, name: "CI asset foreign machine", isActive: true },
    ],
  });
  await db.machineSet.createMany({
    data: [
      { id: setIds[0], machineId: ownMachineId, code: "s-1", name: "My set" },
      { id: setIds[1], machineId: foreignMachineId, code: "s-1", name: "Foreign set" },
    ],
  });
  await db.machineSubset.createMany({
    data: [
      { id: subsetIds[0], machineSetId: setIds[0], code: "sb-1", name: "My subset" },
      { id: subsetIds[1], machineSetId: setIds[1], code: "sb-1", name: "Foreign subset" },
    ],
  });

  for (const [method, path, body, operation] of routeCases(ownMachineId, setIds[0], subsetIds[0])) {
    assert.deepEqual(await check(method, path, body),
      { operation, machineId: ownMachineId, permission: "catalog.assets.manage" });
  }
  for (const [method, path, body] of routeCases(foreignMachineId, setIds[1], subsetIds[1])) {
    await assert.rejects(check(method, path, body), (e) => e?.code === "asset_not_found");
  }

  await assert.rejects(
    check("PATCH", `/api/machine-subsets/${subsetIds[0]}`, { machineSetId: setIds[1] }),
    (e) => e?.code === "asset_reparent_denied",
  );
  await assert.rejects(
    check("DELETE", `/api/machine-sets/${setIds[0]}`, undefined, {
      principal: { ...principal, permissions: ["andon.read"] },
    }),
    (e) => e?.code === "permission_denied",
  );
  await db.machineSet.update({ where: { id: setIds[0] }, data: { isActive: false } });
  await assert.rejects(
    check("POST", `/api/machine-sets/${setIds[0]}/subsets`, { name: "Denied" }),
    (e) => e?.code === "asset_parent_inactive",
  );
  await db.machineSet.update({ where: { id: setIds[0] }, data: { isActive: true } });

  // No mutation in the preflight: 2 sets, 2 subsets, unchanged names/owners.
  const [sets, subsets] = await Promise.all([
    db.machineSet.findMany({ where: { id: { in: setIds } }, orderBy: { id: "asc" } }),
    db.machineSubset.findMany({ where: { id: { in: subsetIds } }, orderBy: { id: "asc" } }),
  ]);
  assert.equal(sets.length, 2);
  assert.equal(subsets.length, 2);
  assert(sets.every((item) => item.name === (item.id === setIds[0] ? "My set" : "Foreign set")));
  assert(subsets.every((item) => item.machineSetId === (item.id === subsetIds[0] ? setIds[0] : setIds[1])));
  console.log("SEC-04/2B.1 PostgreSQL PASS: six asset routes, DB ownership, scoped denial, reparent denial, no writes");
} finally {
  await db.machineSubset.deleteMany({ where: { id: { in: subsetIds } } });
  await db.machineSet.deleteMany({ where: { id: { in: setIds } } });
  await db.machine.deleteMany({ where: { id: { in: [ownMachineId, foreignMachineId] } } });
  await db.$disconnect();
}
