import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const endpoint = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1"].includes(endpoint.hostname) ||
    endpoint.pathname !== "/andon_test") {
  throw new Error("REASON migration verification requires isolated localhost /andon_test");
}
const db = new PrismaClient();
const suffix = randomBytes(6).toString("hex");
const area = `r6_area_${suffix}`;
const corrective = `r6_corrective_${suffix}`;
const setup = `r6_setup_${suffix}`;
const optCorrective = `r6_opt_a_${suffix}`;
const optSetup = `r6_opt_b_${suffix}`;

try {
  await db.andonCategory.create({
    data: { id: area, displayName: "Mecânica sintética", categoryGroup: "maintenance", color: "#64748B" },
  });
  await db.callReason.create({
    data: {
      id: corrective, displayName: "Manutenção sintética",
      nature: "corrective_failure", suggestedResponsibility: "maintenance",
      maintenanceKpiPolicy: "eligible",
    },
  });
  await db.callReason.create({
    data: {
      id: setup, displayName: "Setup sintético",
      nature: "planned_setup", suggestedResponsibility: "operations",
      maintenanceKpiPolicy: "excluded",
    },
  });
  await db.callReasonOption.createMany({
    data: [
      { id: optCorrective, reasonId: corrective, technicalAreaId: area },
      { id: optSetup, reasonId: setup, technicalAreaId: area },
    ],
  });
  const options = await db.callReasonOption.findMany({
    where: { technicalAreaId: area },
    include: { reason: true, technicalArea: true },
  });
  assert.equal(options.length, 2, "two reasons must reuse one technical area");
  assert.equal(new Set(options.map((o) => o.technicalArea.id)).size, 1);
  assert.deepEqual(
    options.map((o) => o.reason.maintenanceKpiPolicy).sort(),
    ["eligible", "excluded"],
  );

  await assert.rejects(
    db.callReasonOption.create({
      data: { id: `r6_dup_${suffix}`, reasonId: setup, technicalAreaId: area },
    }),
    (err) => err?.code === "P2002",
    "the same reason cannot duplicate one technical area",
  );
  await assert.rejects(
    db.callReason.create({
      data: {
        id: `r6_invalid_${suffix}`, displayName: "Setup inválido",
        nature: "planned_setup", maintenanceKpiPolicy: "eligible",
      },
    }),
    (err) => /call_reasons_no_false_corrective_check/.test(String(err?.message ?? "")),
    "the database cannot admit planned setup as a corrective KPI candidate",
  );
  await assert.rejects(
    db.callReasonOption.create({
      data: {
        id: `r6_unknown_${suffix}`, reasonId: corrective,
        technicalAreaId: `unknown_${suffix}`,
      },
    }),
    (err) => err?.code === "P2003",
    "an option must reference a registered technical area",
  );
  const [calls, events] = await Promise.all([
    db.andonCall.count({ where: { subtype: area } }),
    db.failureEvent.count({ where: { machineId: area } }),
  ]);
  assert.equal(calls, 0);
  assert.equal(events, 0);
  process.stdout.write("REASON/PG: additive catalog FK, uniqueness and KPI constraint PASS\n");
} finally {
  await db.callReasonOption.deleteMany({ where: { technicalAreaId: area } });
  await db.callReason.deleteMany({ where: { id: { in: [corrective, setup] } } });
  await db.andonCategory.deleteMany({ where: { id: area } });
  await db.$disconnect();
}
