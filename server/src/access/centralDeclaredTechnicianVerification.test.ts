import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { verifyDeclaredCentralTechnicians } from "./centralDeclaredTechnicianVerification.js";

const technician = {
  id: "tech-1", name: "Mantenedor Teste", employeeId: "100",
  technicalArea: "mechanical", technicalAreas: [{ technicalArea: "mechanical" }],
  active: true, shiftId: null, pinHash: null, tagHash: null, shift: null,
};
const call = {
  callId: "call-1", machineId: "machine-1", category: "maintenance",
} as unknown as Parameters<typeof verifyDeclaredCentralTechnicians>[1];

function fakeTx(options: {
  active?: boolean;
  busy?: boolean;
  changed?: boolean;
  area?: string;
} = {}) {
  let reads = 0;
  const events: string[] = [];
  const tx = {
    $queryRaw: async () => { events.push("lock"); return []; },
    technician: {
      findMany: async () => {
        reads++;
        events.push("tech-read");
        if (options.active === false || (options.changed && reads > 1)) return [];
        return [{
          ...technician,
          technicalArea: options.area ?? "mechanical",
          technicalAreas: [{ technicalArea: options.area ?? "mechanical" }],
        }];
      },
    },
    andonCall: {
      findUnique: async () => ({
        id: call.callId, machineId: call.machineId,
        category: "maintenance", status: "open",
        subtype: "mechanical", isSystemTest: false,
      }),
    },
    technicianSession: {
      findMany: async () => options.busy ? [{ technicianId: technician.id }] : [],
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, events };
}

test("REFINE13: declared name is resolved by server ID, not client-provided identity fields", async () => {
  const { tx, events } = fakeTx();
  const result = await verifyDeclaredCentralTechnicians(tx, call, [technician.id]);
  assert.deepEqual(result, [{ id: technician.id, name: technician.name, employeeId: "100" }]);
  assert.deepEqual(events, ["tech-read", "lock", "tech-read"]);
});

test("REFINE13: rejects malformed or duplicate selections before database access", async () => {
  const { tx, events } = fakeTx();
  for (const invalid of [null, [], ["tech-1", "tech-1"], ["tech-1", 3], [" ".repeat(2)]]) {
    await assert.rejects(() => verifyDeclaredCentralTechnicians(tx, call, invalid));
  }
  assert.deepEqual(events, []);
});

test("REFINE13: rejects revoked technician, unavailable session and wrong area", async () => {
  for (const options of [{ active: false }, { changed: true }, { busy: true }, { area: "quality" }]) {
    const { tx } = fakeTx(options);
    await assert.rejects(() => verifyDeclaredCentralTechnicians(tx, call, [technician.id]));
  }
});

test("REFINE13: maintenance-only guard rejects before looking up personnel", async () => {
  const { tx, events } = fakeTx();
  await assert.rejects(() => verifyDeclaredCentralTechnicians(
    tx, { ...call, category: "quality" }, [technician.id],
  ));
  assert.deepEqual(events, []);
});
