import assert from "node:assert/strict";

import { PrismaClient } from "@prisma/client";

const API_URL = process.env.ANDON_API_URL ?? "http://127.0.0.1:3001";
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");

if (process.env.ANDON_INTEGRATION_TEST !== "1" || databaseUrl.pathname !== "/andon_test") {
  throw new Error(
    "Teste de integração bloqueado: use ANDON_INTEGRATION_TEST=1 e o banco isolado andon_test",
  );
}

const prisma = new PrismaClient();
const ids = {
  machine: "pr47-machine",
  raceMachine: "pr47-race-machine",
  shift: "pr47-shift",
  electricalTechnician: "pr47-tech-electrical",
  mechanicalTechnician: "pr47-tech-mechanical",
  category: "pr48_pneumatic",
  unusedCategory: "pr48_unused",
};

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? "GET"} ${path}: esperado ${expectedStatus}, recebido ${response.status}: ${text}`,
  );
  return body;
}

function json(method, body) {
  return { method, body: JSON.stringify(body) };
}

async function waitForApi() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API não ficou disponível: ${String(lastError)}`);
}

async function cleanup() {
  const machineIds = [ids.machine, ids.raceMachine];
  const calls = await prisma.andonCall.findMany({
    where: { machineId: { in: machineIds } },
    select: { id: true },
  });
  const callIds = calls.map((call) => call.id);

  await prisma.machine.updateMany({
    where: { id: { in: machineIds } },
    data: { currentCallId: null },
  });
  await prisma.technicianTimeAllocation.deleteMany({ where: { callId: { in: callIds } } });
  await prisma.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await prisma.failureEvent.deleteMany({ where: { machineId: { in: machineIds } } });
  await prisma.andonCall.deleteMany({ where: { id: { in: callIds } } });
  await prisma.machineProductionEvent.deleteMany({ where: { machineId: { in: machineIds } } });
  await prisma.machine.deleteMany({ where: { id: { in: machineIds } } });
  await prisma.technician.deleteMany({
    where: { id: { in: [ids.electricalTechnician, ids.mechanicalTechnician] } },
  });
  await prisma.shift.deleteMany({ where: { id: ids.shift } });
  await prisma.andonCategory.deleteMany({
    where: { id: { in: [ids.category, ids.unusedCategory] } },
  });
  await prisma.systemSettings.deleteMany({ where: { id: "global" } });
}

async function run() {
  await waitForApi();
  await request("/health/db");
  await cleanup();

  const defaultCategories = await request("/api/andon-categories?active=true");
  assert.ok(defaultCategories.some((category) => category.id === "electrical"));
  assert.ok(defaultCategories.every((category) => /^#[0-9A-F]{6}$/i.test(category.color)));

  await request(
    "/api/andon-categories",
    json("POST", {
      id: ids.category,
      displayName: "Pneumática CI",
      categoryGroup: "maintenance",
      color: "#14B8A6",
      active: true,
      displayOrder: 60,
    }),
    201,
  );
  const editedCategory = await request(
    `/api/andon-categories/${ids.category}`,
    json("PATCH", { displayName: "Pneumática", color: "#0D9488", displayOrder: 55 }),
  );
  assert.equal(editedCategory.displayName, "Pneumática");
  assert.equal(editedCategory.color, "#0D9488");

  await request(
    "/api/andon-categories",
    json("POST", {
      id: ids.unusedCategory,
      displayName: "Setor removível CI",
      categoryGroup: "production",
      color: "#334155",
      active: true,
      displayOrder: 999,
    }),
    201,
  );
  await request(`/api/andon-categories/${ids.unusedCategory}`, { method: "DELETE" }, 204);

  await prisma.shift.create({
    data: {
      id: ids.shift,
      name: "Turno de integração",
      startTime: "06:00",
      endTime: "14:00",
      active: true,
    },
  });

  await request(
    "/api/machines",
    json("POST", { id: ids.machine, name: "Máquina PR 47", productionMode: "scheduled" }),
    201,
  );
  await request(
    "/api/machines",
    json("POST", {
      id: ids.raceMachine,
      name: "Máquina PR 47 concorrência",
      productionMode: "scheduled",
    }),
    201,
  );

  const electrical = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor Elétrico PR 47",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "4821",
      tag: "TAG-ELECTRICAL-47",
    }),
    201,
  );
  const mechanical = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor Mecânico PR 47",
      technicalArea: "mechanical",
      shiftId: ids.shift,
      active: true,
      pin: "5832",
      tag: "TAG-MECHANICAL-47",
    }),
    201,
  );

  ids.electricalTechnician = electrical.id;
  ids.mechanicalTechnician = mechanical.id;
  assert.equal(electrical.hasPin, true);
  assert.equal(electrical.hasTag, true);
  assert.equal("pinHash" in electrical, false);
  assert.equal("tagHash" in electrical, false);

  await request(
    "/api/system-settings",
    json("PATCH", {
      attendanceMode: "rfid",
      rfidReaderMode: "keyboard_hid",
      rfidInputTerminator: "enter",
      rfidCodeLength: null,
    }),
  );

  const identifiedByPin = await request(
    "/api/technicians/identify",
    json("POST", { method: "pin", value: "4821" }),
  );
  assert.equal(identifiedByPin.id, electrical.id, "PIN deve continuar disponível como alternativa");
  await request("/api/technicians/identify", json("POST", { method: "pin", value: "0000" }), 404);

  const openedCalls = await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.machine,
      subtypes: ["electrical", "mechanical", "quality"],
      criticality: "medium",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(openedCalls.length, 3);
  assert.deepEqual(
    openedCalls.map((call) => call.subtype),
    ["electrical", "mechanical", "quality"],
  );
  assert.ok(
    new Date(openedCalls[0].openedAt) < new Date(openedCalls[1].openedAt) &&
      new Date(openedCalls[1].openedAt) < new Date(openedCalls[2].openedAt),
    "o último setor selecionado deve receber a maior prioridade temporal",
  );

  const electricalCall = openedCalls[0];
  const mechanicalCall = openedCalls[1];
  const qualityCall = openedCalls[2];
  const machineAfterBatch = await request(`/api/machines/${ids.machine}`);
  assert.equal(machineAfterBatch.currentCallId, qualityCall.id);

  const customCalls = await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.machine,
      subtypes: [ids.category],
      criticality: "medium",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(customCalls[0].category, "maintenance");
  assert.equal(customCalls[0].subtype, ids.category);
  await request(
    `/api/andon-calls/${customCalls[0].id}/cancel`,
    json("PATCH", { reason: "Validação de setor dinâmico", cancelledBy: "CI" }),
  );
  await request(`/api/andon-categories/${ids.category}`, { method: "DELETE" }, 409);

  await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.machine,
      subtypes: ["electrical"],
      machineCondition: "running",
    }),
    400,
  );

  await request(
    `/api/andon-calls/${electricalCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "rfid", value: "TAG-MECHANICAL-47" }] }),
    400,
  );
  const attended = await request(
    `/api/andon-calls/${electricalCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "4821" }] }),
  );
  assert.equal(attended.status, "in_progress");
  assert.equal(attended.technicianSessions.length, 1);

  const withSupport = await request(
    `/api/andon-calls/${electricalCall.id}/technicians`,
    json("POST", { credentials: [{ method: "rfid", value: "TAG-MECHANICAL-47" }] }),
    201,
  );
  assert.equal(withSupport.technicianSessions.length, 2);

  const endedByCredential = await request(
    `/api/andon-calls/${electricalCall.id}/technicians/end`,
    json("PATCH", {
      credential: { method: "rfid", value: "TAG-MECHANICAL-47" },
      reason: "support_finished",
      notes: "Encerramento direto por tag",
    }),
  );
  const endedSupportSession = endedByCredential.technicianSessions.find(
    (session) => session.technicianId === mechanical.id,
  );
  assert.ok(endedSupportSession.endedAt);
  assert.equal(endedSupportSession.endReason, "support_finished");

  await request(
    `/api/andon-calls/${electricalCall.id}/finish-maintenance`,
    json("PATCH", { notes: "Integração concluída" }),
  );
  const finishedMaintenance = await request(
    `/api/andon-calls/${electricalCall.id}/finish`,
    json("PATCH", {
      notes: "Finalização de integração",
      confirmedMachineSetId: null,
      confirmedMachineSubsetId: null,
    }),
  );
  assert.equal(finishedMaintenance.status, "finished");
  assert.deepEqual(
    new Set(finishedMaintenance.technicianNames),
    new Set(["Mantenedor Elétrico PR 47", "Mantenedor Mecânico PR 47"]),
  );
  assert.ok(finishedMaintenance.technicianSessions.every((session) => session.endedAt));

  await request(
    `/api/andon-calls/${mechanicalCall.id}/cancel`,
    json("PATCH", { reason: "Validação do cancelamento", cancelledBy: "CI" }),
  );
  await request(`/api/andon-calls/${qualityCall.id}/attend`, json("PATCH", {}));
  await request(
    `/api/andon-calls/${qualityCall.id}/finish`,
    json("PATCH", { confirmedMachineSetId: null, confirmedMachineSubsetId: null }),
  );

  const machineAfterFinish = await request(`/api/machines/${ids.machine}`);
  assert.equal(machineAfterFinish.currentCallId, null);
  assert.equal(machineAfterFinish.andonStatus, "normal");

  await prisma.$disconnect();

  const concurrentResponses = await Promise.all([
    fetch(`${API_URL}/api/andon-calls`, {
      ...json("POST", {
        machineId: ids.raceMachine,
        category: "production",
        subtype: "leadership",
        machineCondition: "running",
      }),
      headers: { "content-type": "application/json" },
    }),
    fetch(`${API_URL}/api/andon-calls`, {
      ...json("POST", {
        machineId: ids.raceMachine,
        category: "production",
        subtype: "leadership",
        machineCondition: "running",
      }),
      headers: { "content-type": "application/json" },
    }),
  ]);
  assert.deepEqual(
    concurrentResponses.map((response) => response.status).sort(),
    [201, 400],
    "aberturas concorrentes não podem criar dois chamados do mesmo setor",
  );

  await prisma.$connect();

  const storedTechnicians = await prisma.technician.findMany({
    where: { id: { in: [electrical.id, mechanical.id] } },
    select: { pinHash: true, tagHash: true },
  });
  assert.equal(storedTechnicians.length, 2);
  assert.ok(storedTechnicians.every((technician) => technician.pinHash?.startsWith("scrypt$")));
  assert.ok(storedTechnicians.every((technician) => technician.tagHash?.startsWith("scrypt$")));
  assert.ok(storedTechnicians.every((technician) => !technician.pinHash?.includes("4821")));

  const publicTechnicians = await request("/api/technicians");
  assert.ok(publicTechnicians.every((technician) => !("pinHash" in technician)));
  assert.ok(publicTechnicians.every((technician) => !("tagHash" in technician)));

  console.log("Fluxo PostgreSQL/API com setores e credenciais diretas: OK");
}

try {
  await run();
} finally {
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
}
