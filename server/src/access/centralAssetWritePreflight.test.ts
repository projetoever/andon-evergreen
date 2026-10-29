import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import type { Principal } from "./policy.js";
import { AccessError } from "./policy.js";
import { preflightCentralAssetWrite } from "./centralAssetWritePreflight.js";

const principal: Principal = {
  userId: "user-37", login: "manager-37", displayName: "Manager",
  roleLabel: "Maintenance", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"],
  permissions: ["andon.read", "catalog.assets.manage"], sessionId: "session-37",
  workstationId: "ws-37", purpose: "normal",
  authenticatedAt: new Date("2026-10-29T12:00:00Z"),
};
const workstation = { id: "ws-37", active: true, pendingApproval: false,
  allowOperational: true, allowBi: false, allowPriorities: false };

function fixture(params: {
  setMachine?: string;
  subsetMachine?: string;
  machineActive?: boolean;
  parentActive?: boolean;
  missingSet?: boolean;
  missingSubset?: boolean;
} = {}) {
  let lookups = 0;
  const tx = {
    machine: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        lookups++;
        assert(where.id === "37" || where.id === "39");
        return { isActive: params.machineActive !== false };
      },
    },
    machineSet: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        lookups++;
        assert.equal(where.id, "set-1");
        return params.missingSet ? null : {
          machineId: params.setMachine ?? "37", isActive: params.parentActive !== false,
        };
      },
    },
    machineSubset: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        lookups++;
        assert.equal(where.id, "subset-1");
        return params.missingSubset ? null :
          { machineSet: { machineId: params.subsetMachine ?? "37" } };
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, get lookups() { return lookups; } };
}
function req(method: string, path: string, body?: unknown) {
  return { method, path, body };
}
function run(request: ReturnType<typeof req>, options: {
  fixture?: ReturnType<typeof fixture>;
  principal?: Principal;
  workstation?: typeof workstation;
} = {}) {
  const f = options.fixture ?? fixture();
  return preflightCentralAssetWrite({
    tx: f.tx, principal: options.principal ?? principal,
    workstation: options.workstation ?? workstation, request,
  });
}
async function deny(p: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(p, (e: unknown) =>
    e instanceof AccessError && e.code === code && e.statusCode === status);
}
const routes = [
  ["POST", "/api/machines/37/sets", "set.create", { name: "New" }],
  ["PATCH", "/api/machine-sets/set-1", "set.update", { name: "Renamed" }],
  ["DELETE", "/api/machine-sets/set-1", "set.delete", undefined],
  ["POST", "/api/machine-sets/set-1/subsets", "subset.create", { name: "New subset" }],
  ["PATCH", "/api/machine-subsets/subset-1", "subset.update", { name: "Renamed" }],
  ["DELETE", "/api/machine-subsets/subset-1", "subset.delete", undefined],
] as const;

test("SEC-04/2B.1: each of six asset actions resolves database-derived owner and same privilege", async () => {
  for (const [method, path, operation, body] of routes) {
    assert.deepEqual(await run(req(method, path, body)), {
      operation, machineId: "37", permission: "catalog.assets.manage",
    });
  }
});
test("SEC-04/2B.1: limited user cannot probe foreign set and subset, including DELETE", async () => {
  for (const [method, path, _operation, body] of routes.slice(1)) {
    const f = fixture({ setMachine: "39", subsetMachine: "39" });
    await deny(run(req(method, path, body), { fixture: f }), "asset_not_found", 404);
    assert.equal(f.lookups, 1, "machine existence must not be checked for a foreign set");
  }
  await deny(run(req("POST", "/api/machines/39/sets", {})), "asset_not_found", 404);
});
test("SEC-04/2B.1: action, module and workstation permission denies before any asset probe", async () => {
  const variations = [
    { principal: { ...principal, permissions: ["catalog.assets.manage"] }, code: "permission_denied" },
    { principal: { ...principal, permissions: ["andon.read"] }, code: "permission_denied" },
    { principal: { ...principal, purpose: "password_change" }, code: "password_change_required" },
    { workstation: { ...workstation, active: false }, code: "workstation_inactive" },
    { workstation: { ...workstation, pendingApproval: true }, code: "workstation_inactive" },
    { workstation: { ...workstation, id: "ws-mismatch" }, code: "workstation_session_mismatch" },
    { workstation: { ...workstation, allowOperational: false }, code: "workstation_module_denied" },
  ];
  for (const variation of variations) {
    const f = fixture();
    await deny(run(req("DELETE", "/api/machine-sets/set-1"), {
      fixture: f, ...variation,
    }), variation.code);
    assert.equal(f.lookups, 0, "no database access before identity/ACL check");
  }
});
test("SEC-04/2B.1: ignore client-supplied machine or reparent request", async () => {
  for (const [method, path, _op, body] of routes) {
    for (const forged of ["machineId", "machineSetId"]) {
      await deny(run(req(method, path, { ...(body ?? {}), [forged]: "39" })), "asset_reparent_denied");
    }
  }
});
test("SEC-04/2B.1: missing and inactive resources fail closed", async () => {
  await deny(run(req("PATCH", "/api/machine-sets/set-1", {}), { fixture: fixture({ missingSet: true }) }),
    "asset_not_found", 404);
  await deny(run(req("DELETE", "/api/machine-subsets/subset-1"), { fixture: fixture({ missingSubset: true }) }),
    "asset_not_found", 404);
  await deny(run(req("POST", "/api/machine-sets/set-1/subsets", {}), { fixture: fixture({ parentActive: false }) }),
    "asset_parent_inactive", 409);
  await deny(run(req("POST", "/api/machines/37/sets", {}), { fixture: fixture({ machineActive: false }) }),
    "machine_inactive", 409);
});
test("SEC-04/2B.1: malformed paths and unrelated methods/routes never inherit catalog permissions", async () => {
  const malformed = [
    req("POST", "/api/machines/%2F/sets", {}),
    req("POST", "/api/machines/37/sets/extra", {}),
    req("POST", "/api/machines/37/sets", { machineId: "37" }),
    req("PATCH", "/api/machine-sets/set-1", []),
    req("DELETE", "/api/machine-sets/../", undefined),
    req("POST", "/api/machine-subsets/subset-1", {}),
    req("DELETE", "/api/machines/37/sets"),
    req("PUT", "/api/machine-sets/set-1", {}),
  ];
  for (const request of malformed) {
    await assert.rejects(run(request), (e: unknown) => e instanceof AccessError,
      request.method + " " + request.path);
  }
});
