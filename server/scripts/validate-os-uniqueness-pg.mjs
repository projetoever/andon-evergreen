import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertWorkOrderNumberAvailable, DuplicateWorkOrderNumberError } from "../dist/services/workOrderUniqueness.js";

const endpoint = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1"].includes(endpoint.hostname) ||
    endpoint.pathname !== "/andon_test")
  throw Error("OS uniqueness tests require local /andon_test and explicit test mode");
const db = new PrismaClient();
const suffix = randomBytes(6).toString("hex");
const machineId = "ci-os-unique-" + suffix;
const os = "OS-UNIQUE-" + suffix;
const osConcurrent = "OS-CONCURRENT-" + suffix;
let existingSetting;
const createCall = (tx, number) => tx.andonCall.create({
  data: { machineId, category: "maintenance", status: "open",
    criticality: "medium", openedAt: new Date(), workOrderNumber: number },
});
try {
  existingSetting = await db.systemSettings.findUnique({ where: { id: "global" } });
  await db.systemSettings.upsert({
    where: { id: "global" }, create: { id: "global", preventDuplicateWorkOrderNumbers: false },
    update: { preventDuplicateWorkOrderNumbers: false },
  });
  await db.machine.create({ data: { id: machineId, name: "OS uniqueness CI machine" } });
  await db.$transaction(async tx => {
    await assertWorkOrderNumberAvailable(tx, os);
    await createCall(tx, os);
  });
  // OFF: existing behavior is completely unchanged.
  await db.$transaction(async tx => {
    await assertWorkOrderNumberAvailable(tx, "  " + os.toLowerCase() + "  ");
    await createCall(tx, os);
  });
  await db.systemSettings.update({
    where: { id: "global" }, data: { preventDuplicateWorkOrderNumbers: true },
  });
  await assert.rejects(
    db.$transaction(tx => assertWorkOrderNumberAvailable(tx, os.toLowerCase())),
    error => error instanceof DuplicateWorkOrderNumberError,
    "historical duplicate must block a new submission when enabled",
  );
  // Blank work orders are permitted when the independent OS-required gate is OFF.
  await db.$transaction(tx => assertWorkOrderNumberAvailable(tx, undefined));
  // Concurrent opens from different transactions serialize by normalized OS,
  // permitting exactly one transaction to create the record.
  const attempt = () => db.$transaction(async tx => {
    await assertWorkOrderNumberAvailable(tx, osConcurrent);
    return createCall(tx, osConcurrent);
  });
  const results = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(results.filter(x => x.status === "rejected").length, 1);
  assert(results.find(x => x.status === "rejected").reason instanceof DuplicateWorkOrderNumberError);
  // A single batch can bind several sectors to the same OS: one guard, one tx.
  await db.$transaction(async tx => {
    await assertWorkOrderNumberAvailable(tx, "OS-BATCH-" + suffix);
    await createCall(tx, "OS-BATCH-" + suffix);
    await createCall(tx, "OS-BATCH-" + suffix);
  });
  await assert.rejects(db.$transaction(tx =>
    assertWorkOrderNumberAvailable(tx, "os-batch-" + suffix)));
  process.stdout.write("OS UNIQUENESS / PG: disabled compatibility, history, race, batch PASS\n");
} finally {
  await db.andonCall.deleteMany({ where: { machineId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  if (existingSetting) {
    await db.systemSettings.update({
      where: { id: "global" },
      data: { preventDuplicateWorkOrderNumbers: existingSetting.preventDuplicateWorkOrderNumbers },
    });
  } else {
    await db.systemSettings.deleteMany({ where: { id: "global" } });
  }
  await db.$disconnect();
}
