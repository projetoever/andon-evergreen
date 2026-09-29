import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createInitialMachines } from "../src/data/initialMachines";
import { openAndonCall } from "../src/services/andonService";

test("modo local exige OS somente na máquina configurada", () => {
  const machines = createInitialMachines().slice(0, 2);
  const requiredMachine = { ...machines[0], requireWorkOrderAtOpen: true };
  const optionalMachine = { ...machines[1], requireWorkOrderAtOpen: false };

  assert.throws(
    () =>
      openAndonCall([requiredMachine, optionalMachine], [], {
        machineId: requiredMachine.id,
        category: "maintenance",
        subtype: "electrical",
        machineCondition: "running",
      }),
    /Informe o número da OS/,
  );

  const requiredResult = openAndonCall([requiredMachine, optionalMachine], [], {
    machineId: requiredMachine.id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
    workOrderNumber: " 000037-A ",
  });
  assert.equal(requiredResult.call.workOrderNumber, "000037-A");

  const optionalResult = openAndonCall([requiredMachine, optionalMachine], [], {
    machineId: optionalMachine.id,
    category: "maintenance",
    subtype: "electrical",
    machineCondition: "running",
  });
  assert.equal(optionalResult.call.workOrderNumber, null);
});

test("frontend usa a regra efetiva por máquina nos dois fluxos de abertura", async () => {
  const quickOpen = await readFile(
    new URL("../src/components/calls/QuickOpenCallModal.tsx", import.meta.url),
    "utf8",
  );
  const openCall = await readFile(
    new URL("../src/components/calls/OpenCallModal.tsx", import.meta.url),
    "utf8",
  );
  const admin = await readFile(
    new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [quickOpen, openCall]) {
    assert.match(source, /resolveWorkOrderRequirement/);
    assert.match(source, /workOrderRequired/);
  }
  assert.match(quickOpen, /\{workOrderRequired && \(/);
  assert.match(openCall, /\{workOrderRequired && \(/);
  assert.match(admin, /requireWorkOrderAtOpen/);
  assert.match(admin, /Exigir OS/);
});

test("migration é aditiva e preserva o comportamento padrão", async () => {
  const migration = await readFile(
    new URL(
      "../server/prisma/migrations/20260929160000_add_machine_work_order_requirement/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /ALTER TABLE "machines"/);
  assert.match(migration, /ADD COLUMN "requireWorkOrderAtOpen" BOOLEAN NOT NULL DEFAULT false/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE|TRUNCATE/i);
});
