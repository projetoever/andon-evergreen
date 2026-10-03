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
  impactMachine: "pr49-impact-machine",
  workOrderMachine: "pr43-work-order-machine",
  sessionMachineA: "pr42-session-machine-a",
  sessionMachineB: "pr42-session-machine-b",
  sessionMachineC: "pr42-session-machine-c",
  sessionMachineD: "pr42-session-machine-d",
  multiAreaMachineA: "pr481e-multi-area-machine-a",
  multiAreaMachineB: "pr481e-multi-area-machine-b",
  multiAreaMachineC: "pr481e-multi-area-machine-c",
  workstationMachineA: "pr48-workstation-machine-a",
  workstationMachineB: "pr48-workstation-machine-b",
  workstationMachineC: "pr48-workstation-machine-c",
  followUpMachineA: "pr481f-follow-up-machine-a",
  followUpMachineB: "pr481f-follow-up-machine-b",
  shift: "pr47-shift",
  electricalTechnician: "pr47-tech-electrical",
  electricalSupportTechnician: "pr50-tech-electrical-support",
  mechanicalTechnician: "pr47-tech-mechanical",
  multiAreaTechnician: "pr481e-tech-multi-area",
  workstationTechnicianA: "pr48-tech-workstation-a",
  workstationTechnicianB: "pr48-tech-workstation-b",
  unusedSetType: "pr51-unused-set-type",
  unusedSubsetType: "pr51-unused-subset-type",
  inactiveSet: "pr51-inactive-set",
  inactiveSubset: "pr51-inactive-subset",
  category: "pr48_pneumatic",
  unusedCategory: "pr48_unused",
  inactiveMaintenanceCategory: "pr481e_inactive_maintenance",
  failureClassificationValue: "integration_dynamic_failure",
  workstationFailureClassificationValue: "integration_workstation_failure",
  workstation: "ws_00000000-0000-4000-8000-000000000047",
  workstationB: "ws_00000000-0000-4000-8000-000000000048",
  workstationC: "ws_00000000-0000-4000-8000-000000000049",
  inactiveWorkstation: "ws_00000000-0000-4000-8000-00000000004a",
};

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
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

async function waitForAdvisoryWaiter(holderPid) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const [row] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "waiterCount"
      FROM pg_locks AS waiting
      INNER JOIN pg_locks AS held
        ON held."locktype" = waiting."locktype"
        AND held."database" IS NOT DISTINCT FROM waiting."database"
        AND held."classid" IS NOT DISTINCT FROM waiting."classid"
        AND held."objid" IS NOT DISTINCT FROM waiting."objid"
        AND held."objsubid" IS NOT DISTINCT FROM waiting."objsubid"
      WHERE waiting."locktype" = 'advisory'
        AND waiting."granted" = false
        AND held."granted" = true
        AND held."pid" = ${holderPid}
    `;
    if (Number(row?.waiterCount ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("A requisição concorrente não aguardou o advisory lock esperado");
}

async function runAfterAdvisoryLockWait(lockKey, startRequest, whileBlocked) {
  let pendingRequest;
  let whileBlockedResult;
  const barrierAt = await prisma.$transaction(
    async (tx) => {
      const [connection] = await tx.$queryRaw`
        SELECT pg_backend_pid()::int AS "pid"
      `;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${lockKey}))::text AS "lockResult"
      `;

      pendingRequest = Promise.resolve().then(startRequest);
      await waitForAdvisoryWaiter(connection.pid);
      if (whileBlocked) {
        whileBlockedResult = await whileBlocked();
      }

      const [clock] = await tx.$queryRaw`
        SELECT clock_timestamp() AS "barrierAt"
      `;
      return clock.barrierAt;
    },
    { timeout: 15_000 },
  );

  if (!pendingRequest) throw new Error("Requisição concorrente não foi iniciada");
  return {
    result: await pendingRequest,
    barrierAt,
    whileBlockedResult,
  };
}

async function cleanup() {
  await prisma.workstation.deleteMany({
    where: {
      id: {
        in: [ids.workstation, ids.workstationB, ids.workstationC, ids.inactiveWorkstation],
      },
    },
  });
  const machineIds = [
    ids.machine,
    ids.raceMachine,
    ids.impactMachine,
    ids.workOrderMachine,
    ids.sessionMachineA,
    ids.sessionMachineB,
    ids.sessionMachineC,
    ids.sessionMachineD,
    ids.multiAreaMachineA,
    ids.multiAreaMachineB,
    ids.multiAreaMachineC,
    ids.workstationMachineA,
    ids.workstationMachineB,
    ids.workstationMachineC,
    ids.followUpMachineA,
    ids.followUpMachineB,
  ];
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
  await prisma.machineSubset.deleteMany({
    where: { machineSet: { machineId: { in: machineIds } } },
  });
  await prisma.machineSet.deleteMany({ where: { machineId: { in: machineIds } } });
  await prisma.machineSubsetType.deleteMany({ where: { id: ids.unusedSubsetType } });
  await prisma.machineSetType.deleteMany({ where: { id: ids.unusedSetType } });
  await prisma.machineProductionEvent.deleteMany({ where: { machineId: { in: machineIds } } });
  await prisma.machine.deleteMany({ where: { id: { in: machineIds } } });
  await prisma.technician.deleteMany({
    where: {
      id: {
        in: [
          ids.electricalTechnician,
          ids.electricalSupportTechnician,
          ids.mechanicalTechnician,
          ids.multiAreaTechnician,
          ids.workstationTechnicianA,
          ids.workstationTechnicianB,
        ],
      },
    },
  });
  await prisma.shift.deleteMany({ where: { id: ids.shift } });
  await prisma.andonCategory.deleteMany({
    where: {
      id: { in: [ids.category, ids.unusedCategory, ids.inactiveMaintenanceCategory] },
    },
  });
  await prisma.failureClassification.deleteMany({
    where: {
      value: {
        in: [ids.failureClassificationValue, ids.workstationFailureClassificationValue],
      },
    },
  });
  await prisma.systemSettings.deleteMany({ where: { id: "global" } });
}

async function run() {
  await waitForApi();
  await request("/health/db");
  await cleanup();

  const registeredWorkstation = await request(
    "/api/workstations/register",
    json("POST", { id: ids.workstation }),
  );
  assert.equal(registeredWorkstation.id, ids.workstation);
  assert.equal(registeredWorkstation.name, null);
  assert.equal(registeredWorkstation.active, true);

  const registeredAgain = await request(
    "/api/workstations/register",
    json("POST", { id: ids.workstation }),
  );
  assert.equal(
    await prisma.workstation.count({ where: { id: ids.workstation } }),
    1,
    "registro repetido não pode duplicar workstation",
  );
  assert.ok(
    new Date(registeredAgain.lastSeenAt).getTime() >=
      new Date(registeredWorkstation.lastSeenAt).getTime(),
  );

  const updatedWorkstation = await request(
    `/api/workstations/${ids.workstation}`,
    json("PATCH", { name: "  PC Máquina 37  ", active: false }),
  );
  assert.equal(updatedWorkstation.name, "PC Máquina 37");
  assert.equal(updatedWorkstation.active, false);

  const inactiveRegistration = await request(
    "/api/workstations/register",
    json("POST", { id: ids.workstation }),
  );
  assert.equal(
    inactiveRegistration.active,
    false,
    "heartbeat não deve reativar workstation administrativamente inativa",
  );
  const listedWorkstations = await request("/api/workstations");
  assert.ok(listedWorkstations.some((workstation) => workstation.id === ids.workstation));
  const fetchedWorkstation = await request(`/api/workstations/${ids.workstation}`);
  assert.equal(fetchedWorkstation.name, "PC Máquina 37");

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
      id: ids.inactiveMaintenanceCategory,
      displayName: "Manutenção inativa CI",
      categoryGroup: "maintenance",
      color: "#64748B",
      active: false,
      displayOrder: 998,
    }),
    201,
  );

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

  const centralCatalog = await request("/api/failure-classifications");
  assert.ok(
    centralCatalog.some((classification) => classification.value === "real_machine_failure"),
    "o catálogo central deve conter os valores históricos consolidados pela migration",
  );

  const createdClassification = await request(
    "/api/failure-classifications",
    json("POST", {
      label: "Falha dinâmica de integração",
      value: ids.failureClassificationValue,
      active: true,
    }),
    201,
  );
  assert.equal(createdClassification.value, ids.failureClassificationValue);

  await request(
    "/api/failure-classifications",
    json("POST", {
      label: "Duplicata de integração",
      value: ids.failureClassificationValue,
      active: true,
    }),
    409,
  );

  const renamedClassification = await request(
    `/api/failure-classifications/${createdClassification.id}`,
    json("PATCH", { label: "Falha dinâmica renomeada" }),
  );
  assert.equal(renamedClassification.label, "Falha dinâmica renomeada");

  const inactiveClassification = await request(
    `/api/failure-classifications/${createdClassification.id}`,
    json("PATCH", { active: false }),
  );
  assert.equal(inactiveClassification.active, false);

  const activeClassifications = await request("/api/failure-classifications?active=true");
  assert.ok(
    activeClassifications.every(
      (classification) => classification.value !== ids.failureClassificationValue,
    ),
    "classificações inativas não devem aparecer nas novas escolhas",
  );
  const completeCatalog = await request("/api/failure-classifications");
  const historicalClassification = completeCatalog.find(
    (classification) => classification.value === ids.failureClassificationValue,
  );
  assert.equal(historicalClassification?.label, "Falha dinâmica renomeada");
  assert.equal(historicalClassification?.active, false);

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
      id: ids.workOrderMachine,
      name: "Máquina PR 43 OS de papel",
      productionMode: "scheduled",
    }),
    201,
  );

  await prisma.machineSetType.create({
    data: {
      id: ids.unusedSetType,
      code: ids.unusedSetType,
      name: "Tipo sem uso ativo",
    },
  });
  await prisma.machineSet.create({
    data: {
      id: ids.inactiveSet,
      machineId: ids.machine,
      typeId: ids.unusedSetType,
      code: ids.inactiveSet,
      name: "Conjunto histórico inativo",
      isActive: false,
    },
  });
  await prisma.machineSubsetType.create({
    data: {
      id: ids.unusedSubsetType,
      code: ids.unusedSubsetType,
      name: "Tipo de subconjunto sem uso ativo",
    },
  });
  await prisma.machineSubset.create({
    data: {
      id: ids.inactiveSubset,
      machineSetId: ids.inactiveSet,
      typeId: ids.unusedSubsetType,
      code: ids.inactiveSubset,
      name: "Subconjunto histórico inativo",
      isActive: false,
    },
  });

  const deletedSetType = await request(`/api/machine-set-types/${ids.unusedSetType}`, {
    method: "DELETE",
  });
  assert.equal(deletedSetType.deleted, true);
  assert.equal(
    (await prisma.machineSet.findUniqueOrThrow({ where: { id: ids.inactiveSet } })).typeId,
    null,
    "a exclusão do catálogo deve preservar o conjunto inativo sem o vínculo removido",
  );

  const deletedSubsetType = await request(`/api/machine-subset-types/${ids.unusedSubsetType}`, {
    method: "DELETE",
  });
  assert.equal(deletedSubsetType.deleted, true);
  assert.equal(
    (await prisma.machineSubset.findUniqueOrThrow({ where: { id: ids.inactiveSubset } })).typeId,
    null,
    "a exclusão do catálogo deve preservar o subconjunto inativo sem o vínculo removido",
  );
  await request(
    "/api/machines",
    json("POST", {
      id: ids.impactMachine,
      name: "Máquina PR 49 impacto compartilhado",
      productionMode: "scheduled",
    }),
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
  for (const [id, name] of [
    [ids.sessionMachineA, "Máquina PR 42 sessão A"],
    [ids.sessionMachineB, "Máquina PR 42 sessão B"],
    [ids.sessionMachineC, "Máquina PR 42 sessão C"],
    [ids.sessionMachineD, "Máquina PR 42 sessão D"],
    [ids.multiAreaMachineA, "Máquina PR 481E multiárea A"],
    [ids.multiAreaMachineB, "Máquina PR 481E multiárea B"],
    [ids.multiAreaMachineC, "Máquina PR 481E multiárea C"],
    [ids.followUpMachineA, "Máquina PR 481F acompanhamento A"],
    [ids.followUpMachineB, "Máquina PR 481F acompanhamento B"],
  ]) {
    await request("/api/machines", json("POST", { id, name, productionMode: "scheduled" }), 201);
  }

  const missingEmployeeIdResponse = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor sem ID PR 41",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "7124",
    }),
    400,
  );
  assert.match(missingEmployeeIdResponse.message, /ID do colaborador/i);

  const electrical = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor Elétrico PR 47",
      employeeId: "000100",
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
      employeeId: "000200",
      technicalArea: "mechanical",
      shiftId: ids.shift,
      active: true,
      pin: "5832",
      tag: "TAG-MECHANICAL-47",
    }),
    201,
  );
  const duplicateEmployeeIdResponse = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor com ID duplicado PR 41",
      employeeId: " 000100 ",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "7125",
    }),
    400,
  );
  assert.match(duplicateEmployeeIdResponse.message, /ID do colaborador já está cadastrado/i);

  const electricalSupport = await request(
    "/api/technicians",
    json("POST", {
      name: "Apoio Elétrico PR 50",
      employeeId: "000300",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "6943",
      tag: "TAG-ELECTRICAL-SUPPORT-50",
    }),
    201,
  );

  const duplicatePinResponse = await request(
    "/api/technicians",
    json("POST", {
      name: "PIN duplicado PR 51",
      employeeId: "000400",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "4821",
    }),
    400,
  );
  assert.match(duplicatePinResponse.message, /PIN já está cadastrado/i);

  const duplicatePinUpdateResponse = await request(
    `/api/technicians/${mechanical.id}`,
    json("PATCH", { pin: "4821" }),
    400,
  );
  assert.match(duplicatePinUpdateResponse.message, /PIN já está cadastrado/i);

  ids.electricalTechnician = electrical.id;
  ids.electricalSupportTechnician = electricalSupport.id;
  ids.mechanicalTechnician = mechanical.id;
  assert.equal(electrical.employeeId, "000100");
  const internalElectricalId = electrical.id;
  const listedTechnicians = await request("/api/technicians");
  assert.equal(
    listedTechnicians.find((technician) => technician.id === electrical.id)?.employeeId,
    "000100",
  );

  await prisma.technician.update({
    where: { id: electrical.id },
    data: { employeeId: null },
  });
  const legacyList = await request("/api/technicians");
  assert.equal(
    legacyList.find((technician) => technician.id === electrical.id)?.employeeId,
    null,
    "mantenedor legado sem employeeId deve continuar sendo listado",
  );
  const legacyUpdateWithoutEmployeeId = await request(
    "/api/technicians/" + electrical.id,
    json("PATCH", { active: false }),
    400,
  );
  assert.match(legacyUpdateWithoutEmployeeId.message, /ID do colaborador/i);
  const repairedLegacy = await request(
    "/api/technicians/" + electrical.id,
    json("PATCH", { employeeId: " 000100 " }),
  );
  assert.equal(
    repairedLegacy.id,
    internalElectricalId,
    "Technician.id interno deve permanecer estável",
  );
  assert.equal(repairedLegacy.employeeId, "000100");
  assert.equal(electrical.hasPin, true);
  assert.equal(electrical.hasTag, true);
  assert.equal("pinHash" in electrical, false);
  assert.equal("tagHash" in electrical, false);
  assert.deepEqual(electrical.technicalAreas, ["electrical"]);
  assert.equal(electrical.technicalArea, "electrical");

  for (const [name, employeeId, technicalAreas, expectedMessage] of [
    ["Sem área PR 481E", "000501", [], /pelo menos uma área técnica/i],
    [
      "Área duplicada PR 481E",
      "000502",
      ["electrical", "electrical"],
      /não repita áreas técnicas/i,
    ],
    ["Área de produção PR 481E", "000503", ["quality"], /área técnica inválida/i],
    ["Área inexistente PR 481E", "000504", ["missing_area"], /área técnica inválida/i],
    ["Área inativa PR 481E", "000505", [ids.inactiveMaintenanceCategory], /área técnica inativa/i],
  ]) {
    const invalidAreaResponse = await request(
      "/api/technicians",
      json("POST", {
        name,
        employeeId,
        technicalAreas,
        shiftId: ids.shift,
        active: true,
        pin: "7754",
      }),
      400,
    );
    assert.match(invalidAreaResponse.message, expectedMessage);
  }

  const multiAreaTechnician = await request(
    "/api/technicians",
    json("POST", {
      name: "Celso Multiárea PR 481E",
      employeeId: "000506",
      technicalAreas: ["electrical", "mechanical", ids.category],
      shiftId: ids.shift,
      active: true,
      pin: "7755",
      tag: "TAG-MULTI-AREA-481E",
    }),
    201,
  );
  ids.multiAreaTechnician = multiAreaTechnician.id;
  assert.equal(multiAreaTechnician.technicalArea, "electrical");
  assert.deepEqual(
    [...multiAreaTechnician.technicalAreas].sort(),
    ["electrical", "mechanical", ids.category].sort(),
  );

  for (const area of ["electrical", "mechanical", ids.category]) {
    const filteredTechnicians = await request(
      `/api/technicians?technicalArea=${encodeURIComponent(area)}`,
    );
    assert.ok(filteredTechnicians.some((technician) => technician.id === multiAreaTechnician.id));
  }
  const unrelatedAreaTechnicians = await request("/api/technicians?technicalArea=hot_melt");
  assert.ok(
    unrelatedAreaTechnicians.every((technician) => technician.id !== multiAreaTechnician.id),
  );

  const identifiedMultiAreaByPin = await request(
    "/api/technicians/identify",
    json("POST", { method: "pin", value: "7755" }),
  );
  const identifiedMultiAreaByTag = await request(
    "/api/technicians/identify",
    json("POST", { method: "rfid", value: "TAG-MULTI-AREA-481E" }),
  );
  assert.deepEqual(
    [...identifiedMultiAreaByPin.technicalAreas].sort(),
    ["electrical", "mechanical", ids.category].sort(),
  );
  assert.deepEqual(
    [...identifiedMultiAreaByTag.technicalAreas].sort(),
    ["electrical", "mechanical", ids.category].sort(),
  );

  const reducedMultiArea = await request(
    `/api/technicians/${multiAreaTechnician.id}`,
    json("PATCH", { technicalAreas: ["electrical", "mechanical"] }),
  );
  assert.deepEqual(reducedMultiArea.technicalAreas, ["electrical", "mechanical"]);
  const expandedMultiArea = await request(
    `/api/technicians/${multiAreaTechnician.id}`,
    json("PATCH", { technicalAreas: ["mechanical", "electrical", ids.category] }),
  );
  assert.equal(
    expandedMultiArea.technicalArea,
    "electrical",
    "campo legado deve continuar apontando para uma área vinculada",
  );
  await request(
    `/api/technicians/${multiAreaTechnician.id}`,
    json("PATCH", { technicalAreas: [] }),
    400,
  );
  await request(
    `/api/technicians/${multiAreaTechnician.id}`,
    json("PATCH", { technicalAreas: ["mechanical", "quality"] }),
    400,
  );
  const multiAreaAfterInvalidUpdate = (await request("/api/technicians")).find(
    (technician) => technician.id === multiAreaTechnician.id,
  );
  assert.deepEqual(
    [...multiAreaAfterInvalidUpdate.technicalAreas].sort(),
    ["electrical", "mechanical", ids.category].sort(),
    "atualização inválida não pode salvar associações parcialmente",
  );

  await request(
    `/api/andon-categories/${ids.category}`,
    json("PATCH", { categoryGroup: "production" }),
    409,
  );
  await request(`/api/andon-categories/${ids.category}`, { method: "DELETE" }, 409);

  const incompatibleMultiAreaCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.multiAreaMachineC,
      category: "maintenance",
      subtype: "hot_melt",
      machineCondition: "running",
    }),
    201,
  );
  const incompatibleMultiAreaAttendance = await request(
    `/api/andon-calls/${incompatibleMultiAreaCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "7755" }] }),
    400,
  );
  assert.match(incompatibleMultiAreaAttendance.message, /não pertence à área deste chamado/i);

  const electricalMultiAreaCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.multiAreaMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  await request(
    `/api/andon-calls/${electricalMultiAreaCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "7755" }] }),
  );
  const mechanicalMultiAreaCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.multiAreaMachineB,
      category: "maintenance",
      subtype: "mechanical",
      machineCondition: "running",
    }),
    201,
  );
  const crossAreaConflict = await request(
    `/api/andon-calls/${mechanicalMultiAreaCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "7755" }] }),
    400,
  );
  assert.match(crossAreaConflict.message, /atendimento ativo em outro chamado/i);
  await prisma.technicianSession.updateMany({
    where: { callId: electricalMultiAreaCall.id, endedAt: null },
    data: { endedAt: new Date(), endReason: "test_fixture" },
  });
  await request(
    `/api/andon-calls/${mechanicalMultiAreaCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "7755" }] }),
  );
  const mechanicalMultiAreaSession = await prisma.technicianSession.findFirstOrThrow({
    where: { callId: mechanicalMultiAreaCall.id, technicianId: multiAreaTechnician.id },
  });
  assert.equal(
    mechanicalMultiAreaSession.technicalArea,
    "mechanical",
    "sessão deve registrar a área do chamado, não a área legada principal",
  );

  const updatedSystemSettings = await request(
    "/api/system-settings",
    json("PATCH", {
      virtualKeyboardEnabled: false,
      attendanceMode: "rfid",
      rfidReaderMode: "keyboard_hid",
      rfidInputTerminator: "enter",
      rfidCodeLength: null,
    }),
  );
  assert.equal(updatedSystemSettings.virtualKeyboardEnabled, false);
  const restoredSystemSettings = await request(
    "/api/system-settings",
    json("PATCH", { virtualKeyboardEnabled: true }),
  );
  assert.equal(restoredSystemSettings.virtualKeyboardEnabled, true);

  const defaultWorkOrderSettings = await request("/api/system-settings");
  assert.equal(defaultWorkOrderSettings.requireWorkOrderAtOpen, false);
  assert.equal(
    defaultWorkOrderSettings.restrictMaintenanceCompletionToAttendanceWorkstation,
    false,
  );
  assert.equal(defaultWorkOrderSettings.dashboardSoundMuteTimerEnabled, false);
  assert.equal(defaultWorkOrderSettings.dashboardSoundMuteDurationMinutes, 3);

  const dashboardSoundMuteSettings = await request(
    "/api/system-settings",
    json("PATCH", {
      dashboardSoundMuteTimerEnabled: true,
      dashboardSoundMuteDurationMinutes: 5,
    }),
  );
  assert.equal(dashboardSoundMuteSettings.dashboardSoundMuteTimerEnabled, true);
  assert.equal(dashboardSoundMuteSettings.dashboardSoundMuteDurationMinutes, 5);
  await request(
    "/api/system-settings",
    json("PATCH", { dashboardSoundMuteDurationMinutes: 0 }),
    400,
  );
  await request(
    "/api/system-settings",
    json("PATCH", { dashboardSoundMuteTimerEnabled: "true" }),
    400,
  );
  await request(
    "/api/system-settings",
    json("PATCH", {
      dashboardSoundMuteTimerEnabled: false,
      dashboardSoundMuteDurationMinutes: 3,
    }),
  );

  const legacyWorkOrderCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(legacyWorkOrderCall.workOrderNumber, null);
  await request(
    `/api/andon-calls/${legacyWorkOrderCall.id}/cancel`,
    json("PATCH", { reason: "Compatibilidade de chamado legado sem OS" }),
  );
  const legacyWorkOrderRead = await request(
    `/api/andon-calls?machineId=${ids.workOrderMachine}&status=cancelled`,
  );
  assert.equal(
    legacyWorkOrderRead.find((call) => call.id === legacyWorkOrderCall.id)?.workOrderNumber,
    null,
  );
  assert.equal(legacyWorkOrderRead.find((call) => call.id === legacyWorkOrderCall.id)?.failureClassification, null);
  assert.equal(legacyWorkOrderRead.find((call) => call.id === legacyWorkOrderCall.id)?.failureDescription, null);

  const persistedWorkOrderCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "mechanical",
      workOrderNumber: " 000123   A ",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(persistedWorkOrderCall.workOrderNumber, "000123 A");
  await request(
    `/api/andon-calls/${persistedWorkOrderCall.id}/cancel`,
    json("PATCH", { reason: "Validação de normalização da OS" }),
  );

  await request(
    "/api/system-settings",
    json("PATCH", { requireWorkOrderAtOpen: true }),
  );
  const missingWorkOrderResponse = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    400,
  );
  assert.match(missingWorkOrderResponse.message, /Informe o número da OS para abrir o chamado/i);
  const spacesWorkOrderResponse = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "electrical",
      workOrderNumber: "   ",
      machineCondition: "running",
    }),
    400,
  );
  assert.match(spacesWorkOrderResponse.message, /Informe o número da OS para abrir o chamado/i);

  const leadingZerosWorkOrderCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "production",
      subtype: "quality",
      workOrderNumber: "00000042",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(leadingZerosWorkOrderCall.workOrderNumber, "00000042");
  await request(
    `/api/andon-calls/${leadingZerosWorkOrderCall.id}/cancel`,
    json("PATCH", { reason: "Validação de zeros à esquerda" }),
  );

  const alphanumericWorkOrderCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "production",
      subtype: "leadership",
      workOrderNumber: "OS-ABC-9",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(alphanumericWorkOrderCall.workOrderNumber, "OS-ABC-9");
  await request(
    `/api/andon-calls/${alphanumericWorkOrderCall.id}/cancel`,
    json("PATCH", { reason: "Validação alfanumérica da OS" }),
  );

  const missingBatchWorkOrderResponse = await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.workOrderMachine,
      subtypes: ["electrical", "mechanical"],
      machineCondition: "running",
    }),
    400,
  );
  assert.match(missingBatchWorkOrderResponse.message, /Informe o número da OS para abrir o chamado/i);
  const batchWorkOrderCalls = await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.workOrderMachine,
      subtypes: ["electrical", "mechanical"],
      workOrderNumber: " 000777 ",
      machineCondition: "running",
    }),
    201,
  );
  assert.deepEqual(
    batchWorkOrderCalls.map((call) => call.workOrderNumber),
    ["000777", "000777"],
  );
  for (const call of batchWorkOrderCalls) {
    await request(
      `/api/andon-calls/${call.id}/cancel`,
      json("PATCH", { reason: "Validação de OS compartilhada no lote" }),
    );
  }

  const systemTestWithoutWorkOrder = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "production",
      subtype: "quality",
      origin: "installer_health_check",
      createdBy: "installer-health",
      isSystemTest: true,
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(systemTestWithoutWorkOrder.workOrderNumber, null);
  const finishedSystemTest = await request(
    `/api/andon-calls/${systemTestWithoutWorkOrder.id}/finish`,
    json("PATCH", {}),
  );
  assert.equal(finishedSystemTest.status, "finished");
  assert.equal(finishedSystemTest.failureClassification, null);
  assert.equal(finishedSystemTest.failureDescription, null);
  await request(
    `/api/andon-calls/${systemTestWithoutWorkOrder.id}/failure-details`,
    json("PATCH", {
      failureClassification: "quality_failure",
      failureDescription: "Não aplicável",
    }),
    400,
  );
  assert.equal(await prisma.failureEvent.count({ where: { callId: systemTestWithoutWorkOrder.id } }), 0);
  const invalidSystemTestMetadata = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "production",
      subtype: "leadership",
      origin: "installer_health_check",
      createdBy: "invalid",
      isSystemTest: true,
      machineCondition: "running",
    }),
    400,
  );
  assert.match(invalidSystemTestMetadata.message, /Metadados de teste automático inválidos/i);
  await request(
    "/api/system-settings",
    json("PATCH", { requireWorkOrderAtOpen: false }),
  );

  const machineWorkOrderRequirement = await request(
    `/api/machines/${ids.workOrderMachine}`,
    json("PATCH", { requireWorkOrderAtOpen: true }),
  );
  assert.equal(machineWorkOrderRequirement.requireWorkOrderAtOpen, true);
  const missingMachineWorkOrder = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    400,
  );
  assert.match(missingMachineWorkOrder.message, /Informe o número da OS/i);

  const optionalMachineCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.machine,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(optionalMachineCall.workOrderNumber, null);
  await request(
    `/api/andon-calls/${optionalMachineCall.id}/cancel`,
    json("PATCH", { reason: "Máquina sem exigência individual de OS" }),
  );

  const configuredMachineCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "maintenance",
      subtype: "electrical",
      workOrderNumber: " 000037-A ",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(configuredMachineCall.workOrderNumber, "000037-A");
  await request(
    `/api/andon-calls/${configuredMachineCall.id}/cancel`,
    json("PATCH", { reason: "Exigência individual de OS" }),
  );

  await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.workOrderMachine,
      subtypes: ["electrical", "mechanical"],
      machineCondition: "running",
    }),
    400,
  );
  const configuredMachineBatch = await request(
    "/api/andon-calls/batch",
    json("POST", {
      machineId: ids.workOrderMachine,
      subtypes: ["electrical", "mechanical"],
      workOrderNumber: "OS-37-0002",
      machineCondition: "running",
    }),
    201,
  );
  assert.deepEqual(
    configuredMachineBatch.map((call) => call.workOrderNumber),
    ["OS-37-0002", "OS-37-0002"],
  );
  for (const call of configuredMachineBatch) {
    await request(
      `/api/andon-calls/${call.id}/cancel`,
      json("PATCH", { reason: "Validação em lote da exigência individual de OS" }),
    );
  }

  const machineSystemTestWithoutWorkOrder = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workOrderMachine,
      category: "production",
      subtype: "quality",
      origin: "installer_health_check",
      createdBy: "installer-health",
      isSystemTest: true,
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(machineSystemTestWithoutWorkOrder.workOrderNumber, null);
  await request(
    `/api/andon-calls/${machineSystemTestWithoutWorkOrder.id}/finish`,
    json("PATCH", {}),
  );
  await request(
    `/api/machines/${ids.workOrderMachine}`,
    json("PATCH", { requireWorkOrderAtOpen: false }),
  );

  const identifiedByPin = await request(
    "/api/technicians/identify",
    json("POST", { method: "pin", value: "4821" }),
  );
  assert.equal(identifiedByPin.id, electrical.id, "PIN deve continuar disponível como alternativa");
  const identifiedByRfid = await request(
    "/api/technicians/identify",
    json("POST", { method: "rfid", value: "TAG-ELECTRICAL-47" }),
  );
  assert.equal(
    identifiedByRfid.id,
    electrical.id,
    "RFID deve continuar disponível como alternativa",
  );
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

  await request(
    `/api/andon-calls/${electricalCall.id}/technicians`,
    json("POST", { credentials: [{ method: "rfid", value: "TAG-MECHANICAL-47" }] }),
    400,
  );
  await request(
    `/api/andon-calls/${electricalCall.id}/technicians`,
    json("POST", { credentials: [{ method: "pin", value: "5832" }] }),
    400,
  );

  await request("/api/system-settings", json("PATCH", { attendanceMode: "name" }));
  await request(
    `/api/andon-calls/${electricalCall.id}/technicians`,
    json("POST", { technicianNames: [mechanical.name] }),
    400,
  );
  const withElectricalSupport = await request(
    `/api/andon-calls/${electricalCall.id}/technicians`,
    json("POST", { technicianNames: [electricalSupport.name] }),
    201,
  );
  assert.equal(withElectricalSupport.technicianSessions.length, 2);
  await request("/api/system-settings", json("PATCH", { attendanceMode: "rfid" }));

  const endedByCredential = await request(
    `/api/andon-calls/${electricalCall.id}/technicians/end`,
    json("PATCH", {
      credential: { method: "rfid", value: "TAG-ELECTRICAL-SUPPORT-50" },
      reason: "support_finished",
      notes: "Encerramento direto por tag",
    }),
  );
  const endedSupportSession = endedByCredential.technicianSessions.find(
    (session) => session.technicianId === electricalSupport.id,
  );
  assert.ok(endedSupportSession.endedAt);
  assert.equal(endedSupportSession.endReason, "support_finished");

  const firstAttendanceStartedAt = new Date(Date.now() - 11 * 1000);
  await prisma.andonCall.update({
    where: { id: electricalCall.id },
    data: { currentAttendanceStartedAt: firstAttendanceStartedAt },
  });
  const firstFollowUp = await request(
    `/api/andon-calls/${electricalCall.id}/finish-maintenance`,
    json("PATCH", { notes: "Integração concluída" }),
  );
  assert.equal(firstFollowUp.status, "post_maintenance");
  assert.ok(
    firstFollowUp.attendanceMinutes >= 0.15 && firstFollowUp.attendanceMinutes < 0.5,
    "um atendimento inferior a um minuto deve ser persistido ao iniciar o acompanhamento",
  );
  const firstFollowUpStartedAt = new Date(Date.now() - 20 * 1000);
  await prisma.andonCall.update({
    where: { id: electricalCall.id },
    data: { maintenanceCompletedAt: firstFollowUpStartedAt },
  });

  const returnedToMaintenance = await request(
    `/api/andon-calls/${electricalCall.id}/return-to-maintenance`,
    json("PATCH", { reason: "Falha voltou a ocorrer" }),
  );
  assert.equal(returnedToMaintenance.status, "in_progress");
  assert.equal(returnedToMaintenance.maintenanceReturnCount, 1);
  assert.ok(
    returnedToMaintenance.postMaintenanceMinutes >= 0.25 &&
      returnedToMaintenance.postMaintenanceMinutes < 0.75,
    "um acompanhamento inferior a um minuto deve ser preservado no retorno à manutenção",
  );

  const secondAttendanceStartedAt = new Date(Date.now() - 2 * 60 * 1000);
  await prisma.andonCall.update({
    where: { id: electricalCall.id },
    data: { currentAttendanceStartedAt: secondAttendanceStartedAt },
  });
  const secondFollowUp = await request(
    `/api/andon-calls/${electricalCall.id}/finish-maintenance`,
    json("PATCH", { notes: "Segunda conclusão da manutenção" }),
  );
  assert.equal(secondFollowUp.status, "post_maintenance");
  assert.ok(
    secondFollowUp.attendanceMinutes >= 2.15,
    "o segundo atendimento deve acumular o primeiro período sem zerá-lo",
  );
  assert.ok(
    secondFollowUp.postMaintenanceMinutes >= 0.25 && secondFollowUp.postMaintenanceMinutes < 0.75,
    "o acompanhamento acumulado não pode zerar ao concluir novamente",
  );

  const secondFollowUpStartedAt = new Date(Date.now() - 4 * 60 * 1000);
  await prisma.andonCall.update({
    where: { id: electricalCall.id },
    data: { maintenanceCompletedAt: secondFollowUpStartedAt },
  });
  const finishedMaintenance = await request(
    `/api/andon-calls/${electricalCall.id}/finish`,
    json("PATCH", {
      notes: "Finalização de integração",
      failureClassification: "electrical_failure",
      confirmedMachineSetId: null,
      confirmedMachineSubsetId: null,
    }),
  );
  assert.equal(finishedMaintenance.status, "finished");
  assert.ok(
    finishedMaintenance.postMaintenanceMinutes >= 4.25 &&
      finishedMaintenance.postMaintenanceMinutes < 5,
    "a finalização deve somar todos os períodos de acompanhamento",
  );
  assert.deepEqual(
    new Set(finishedMaintenance.technicianNames),
    new Set(["Mantenedor Elétrico PR 47", "Apoio Elétrico PR 50"]),
  );
  assert.ok(finishedMaintenance.technicianSessions.every((session) => session.endedAt));
  assert.match(finishedMaintenance.notes, /Conclusão da manutenção: Integração concluída/);
  assert.match(finishedMaintenance.notes, /Retorno à manutenção: Falha voltou a ocorrer/);
  assert.match(
    finishedMaintenance.notes,
    /Conclusão da manutenção: Segunda conclusão da manutenção/,
  );
  assert.match(finishedMaintenance.notes, /Finalização de integração/);
  assert.equal(finishedMaintenance.failureClassification, "electrical_failure");
  assert.equal(finishedMaintenance.failureDescription, "Finalização de integração");
  assert.doesNotMatch(finishedMaintenance.notes, /Finalização: Finalização de integração/);
  assert.equal(
    finishedMaintenance.notes.match(/Finalização de integração/g)?.length,
    1,
    "a descrição final não pode ser duplicada",
  );

  const cancelledMechanicalCall = await request(
    `/api/andon-calls/${mechanicalCall.id}/cancel`,
    json("PATCH", { reason: "  Validação do cancelamento  ", cancelledBy: "CI" }),
  );
  assert.equal(cancelledMechanicalCall.cancelReason, "Validação do cancelamento");
  assert.match(cancelledMechanicalCall.notes, /Motivo: Validação do cancelamento/);
  await request(`/api/andon-calls/${qualityCall.id}/attend`, json("PATCH", {}));
  const qualityMachineBeforeFinish = await request(`/api/machines/${ids.machine}`);
  assert.equal(qualityMachineBeforeFinish.machineStatus, "running");
  const qualityFailureCountBeforeFinish = await prisma.failureEvent.count({ where: { machineId: ids.machine } });
  const qualityImpactCountBeforeFinish = await prisma.callImpactInterval.count({ where: { callId: qualityCall.id } });
  assert.equal(qualityImpactCountBeforeFinish, 0);
  const finishedQualityRunning = await request(
    `/api/andon-calls/${qualityCall.id}/finish`,
    json("PATCH", {
      failureClassification: "quality_failure",
      failureDescription: "Falha de qualidade resolvida",
      confirmedMachineSetId: null,
      confirmedMachineSubsetId: null,
    }),
  );
  assert.equal(finishedQualityRunning.status, "finished");
  assert.equal(finishedQualityRunning.failureClassification, "quality_failure");
  assert.equal(finishedQualityRunning.failureDescription, "Falha de qualidade resolvida");
  assert.equal(finishedQualityRunning.machineStoppedMinutes, 0);
  assert.equal(await prisma.failureEvent.count({ where: { machineId: ids.machine } }), qualityFailureCountBeforeFinish);
  assert.equal(await prisma.failureEvent.count({ where: { callId: qualityCall.id } }), 0);
  assert.equal(await prisma.callImpactInterval.count({ where: { callId: qualityCall.id } }), qualityImpactCountBeforeFinish);

  const machineAfterFinish = await request(`/api/machines/${ids.machine}`);
  assert.equal(machineAfterFinish.machineStatus, "running");
  assert.equal(machineAfterFinish.lastStatusChangedAt, qualityMachineBeforeFinish.lastStatusChangedAt);
  assert.equal(machineAfterFinish.currentCallId, null);
  assert.equal(machineAfterFinish.andonStatus, "normal");
  for (const invalidCase of [
    { failureDescription: "Descrição válida" },
    { failureClassification: "quality_failure", failureDescription: "  " },
    { failureClassification: "unidentified_stop", failureDescription: "Descrição válida" },
  ]) {
    await request(
      `/api/andon-calls/${qualityCall.id}/failure-details`,
      json("PATCH", invalidCase),
      400,
    );
  }
  const editedQuality = await request(
    `/api/andon-calls/${qualityCall.id}/failure-details`,
    json("PATCH", {
      failureClassification: "electrical_failure",
      failureDescription: "  Revisão sem parada  ",
    }),
  );
  assert.equal(editedQuality.failureClassification, "electrical_failure");
  assert.equal(editedQuality.failureDescription, "Revisão sem parada");
  assert.equal(await prisma.failureEvent.count({ where: { callId: qualityCall.id } }), 0);
  assert.equal(await prisma.callImpactInterval.count({ where: { callId: qualityCall.id } }), 0);
  assert.equal(
    (await prisma.machine.findUniqueOrThrow({ where: { id: ids.machine } })).machineStatus,
    "running",
  );

  const leadershipRunning = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "leadership",
      machineCondition: "running",
    }),
    201,
  );
  await request(`/api/andon-calls/${leadershipRunning.id}/attend`, json("PATCH", {}));

  const leadershipOpenedAt = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.andonCall.update({
    where: { id: leadershipRunning.id },
    data: {
      openedAt: leadershipOpenedAt,
      attendedAt: leadershipOpenedAt,
      currentAttendanceStartedAt: leadershipOpenedAt,
    },
  });

  const qualityStopped = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "quality",
      machineCondition: "stopped",
    }),
    201,
  );
  await request(`/api/andon-calls/${qualityStopped.id}/attend`, json("PATCH", {}));

  const stoppedAt = new Date(Date.now() - 5 * 60 * 1000);
  const ownedFailureEvent = await prisma.failureEvent.findFirstOrThrow({
    where: {
      machineId: ids.impactMachine,
      callId: qualityStopped.id,
      endedAt: null,
    },
  });
  const ownedImpactInterval = await prisma.callImpactInterval.findFirstOrThrow({
    where: {
      machineId: ids.impactMachine,
      callId: qualityStopped.id,
      endedAt: null,
    },
  });
  await prisma.$transaction([
    prisma.failureEvent.update({
      where: { id: ownedFailureEvent.id },
      data: { startedAt: stoppedAt },
    }),
    prisma.machine.update({
      where: { id: ids.impactMachine },
      data: { lastStatusChangedAt: stoppedAt },
    }),
    prisma.callImpactInterval.update({
      where: { id: ownedImpactInterval.id },
      data: { startedAt: stoppedAt },
    }),
  ]);

  for (const invalidCase of [
    { payload: { notes: "Falha em operação" }, message: /classificação da falha é obrigatória/i },
    { payload: { failureClassification: "quality_failure" }, message: /descrição da falha é obrigatória/i },
    { payload: { failureClassification: "quality_failure", failureDescription: "   " }, message: /descrição da falha é obrigatória/i },
  ]) {
    const rejected = await request(
      `/api/andon-calls/${leadershipRunning.id}/finish`,
      json("PATCH", invalidCase.payload),
      400,
    );
    assert.match(rejected.message, invalidCase.message);
    assert.equal(await prisma.failureEvent.count({ where: { callId: leadershipRunning.id } }), 0);
  }

  const finishedLeadership = await request(
    `/api/andon-calls/${leadershipRunning.id}/finish`,
    json("PATCH", {
      notes: "Apoio encerrado sem localização técnica",
      failureClassification: "quality_failure",
    }),
  );
  assert.equal(finishedLeadership.status, "finished");
  assert.equal(finishedLeadership.failureClassification, "quality_failure");
  assert.equal(finishedLeadership.failureDescription, "Apoio encerrado sem localização técnica");
  assert.equal(await prisma.failureEvent.count({ where: { callId: leadershipRunning.id } }), 0);
  assert.equal(await prisma.callImpactInterval.count({ where: { callId: leadershipRunning.id } }), 0);
  assert.equal((await prisma.failureEvent.findUniqueOrThrow({ where: { id: ownedFailureEvent.id } })).callId, qualityStopped.id);
  assert.equal(finishedLeadership.assetConfirmedAt, null);
  assert.equal(finishedLeadership.confirmedMachineSetId, null);
  assert.equal(
    finishedLeadership.machineStoppedMinutes,
    0,
    "chamado que não causou a parada não pode herdar impacto produtivo de outro chamado",
  );
  const editedLeadership = await request(
    `/api/andon-calls/${leadershipRunning.id}/failure-details`,
    json("PATCH", {
      failureClassification: "electrical_failure",
      failureDescription: "Apoio técnico revisado",
    }),
  );
  assert.equal(editedLeadership.failureDescription, "Apoio técnico revisado");
  assert.equal(await prisma.failureEvent.count({ where: { callId: leadershipRunning.id } }), 0);
  assert.equal(
    await prisma.callImpactInterval.count({ where: { callId: leadershipRunning.id } }),
    0,
  );
  assert.equal(
    (await prisma.failureEvent.findUniqueOrThrow({ where: { id: ownedFailureEvent.id } })).callId,
    qualityStopped.id,
  );

  const machineStillStopped = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(
    machineStillStopped.machineStatus,
    "stopped",
    "finalizar chamado que não originou a parada não pode liberar a máquina",
  );

  const leadershipDuringStop = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "leadership",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(
    leadershipDuringStop.machineCondition,
    "stopped",
    "novos chamados devem herdar a parada ativa sem aceitar condição divergente",
  );

  const openFailureEvents = await prisma.failureEvent.findMany({
    where: { machineId: ids.impactMachine, endedAt: null },
  });
  assert.equal(openFailureEvents.length, 1);
  assert.equal(openFailureEvents[0].callId, qualityStopped.id);

  const originalFailureSnapshot = {
    classification: openFailureEvents[0].classification,
    notes: openFailureEvents[0].notes,
  };

  const invalidFailureDetails = [
    {
      payload: {
        failureDescription: "Sensor sem resposta",
        machineStatus: "stopped",
        impactCallIds: [leadershipDuringStop.id],
      },
      message: /classificação da falha é obrigatória/i,
    },
    {
      payload: {
        failureClassification: "other",
        machineStatus: "stopped",
        impactCallIds: [leadershipDuringStop.id],
      },
      message: /descrição da falha é obrigatória/i,
    },
    {
      payload: {
        failureClassification: "unidentified_stop",
        failureDescription: "Sensor sem resposta",
        machineStatus: "stopped",
        impactCallIds: [leadershipDuringStop.id],
      },
      message: /classificação específica da falha/i,
    },
    {
      payload: {
        failureClassification: "classification_does_not_exist",
        failureDescription: "Sensor sem resposta",
        machineStatus: "stopped",
        impactCallIds: [leadershipDuringStop.id],
      },
      message: /classificação da falha inválida/i,
    },
    {
      payload: {
        failureClassification: ids.failureClassificationValue,
        failureDescription: "Sensor sem resposta",
        machineStatus: "stopped",
        impactCallIds: [leadershipDuringStop.id],
      },
      message: /classificação da falha está inativa/i,
    },
  ];

  for (const invalidCase of invalidFailureDetails) {
    const response = await request(
      `/api/andon-calls/${qualityStopped.id}/finish`,
      json("PATCH", invalidCase.payload),
      400,
    );
    assert.match(response.message, invalidCase.message);

    const unchangedEvent = await prisma.failureEvent.findUniqueOrThrow({
      where: { id: ownedFailureEvent.id },
    });
    assert.equal(unchangedEvent.classification, originalFailureSnapshot.classification);
    assert.equal(unchangedEvent.notes, originalFailureSnapshot.notes);
  }

  await request(`/api/andon-calls/${leadershipDuringStop.id}/attend`, json("PATCH", {}));
  const missingConditionResponse = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", {
      notes: "Condição normalizada",
      failureClassification: "quality_failure",
      failureDescription: "Sensor de inspeção sem resposta",
    }),
    400,
  );
  assert.match(missingConditionResponse.message, /máquina continua em falha/i);
  const eventAfterFailedCondition = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.equal(eventAfterFailedCondition.classification, originalFailureSnapshot.classification);
  assert.equal(eventAfterFailedCondition.notes, originalFailureSnapshot.notes);

  const missingResponsibleCallResponse = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", {
      notes: "Máquina permanece parada sem atribuição",
      failureClassification: "quality_failure",
      failureDescription: "Sensor de inspeção sem resposta",
      machineStatus: "stopped",
    }),
    400,
  );
  assert.match(missingResponsibleCallResponse.message, /selecione ao menos um chamado/i);
  const eventAfterFailedHandoff = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.equal(eventAfterFailedHandoff.classification, originalFailureSnapshot.classification);
  assert.equal(eventAfterFailedHandoff.notes, originalFailureSnapshot.notes);

  const continuedStopOwner = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", {
      notes: "Sensor de inspeção sem resposta",
      failureClassification: "other",
      failureDescription: "  Sensor de inspeção sem resposta  ",
      machineStatus: "stopped",
      impactCallIds: [leadershipDuringStop.id],
    }),
  );
  assert.equal(continuedStopOwner.machineStatusAtFinish, "stopped");
  assert.equal(continuedStopOwner.failureClassification, "other");
  assert.equal(continuedStopOwner.failureDescription, "Sensor de inspeção sem resposta");
  assert.equal(continuedStopOwner.assetConfirmedAt, null);

  const transferredFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.equal(transferredFailureEvent.endedAt, null);
  assert.equal(transferredFailureEvent.callId, leadershipDuringStop.id);
  assert.equal(transferredFailureEvent.classification, "other");
  assert.match(transferredFailureEvent.notes ?? "", /^Sensor de inspeção sem resposta/);
  assert.equal(
    transferredFailureEvent.startedAt.getTime(),
    stoppedAt.getTime(),
    "transferir a responsabilidade não pode reiniciar o timer de falha",
  );
  assert.match(transferredFailureEvent.notes ?? "", /Liderança/);
  assert.doesNotMatch(transferredFailureEvent.notes ?? "", new RegExp(leadershipDuringStop.id));
  assert.doesNotMatch(transferredFailureEvent.notes ?? "", new RegExp(qualityStopped.id));

  const finishedOwnerImpact = await prisma.callImpactInterval.findUniqueOrThrow({
    where: { id: ownedImpactInterval.id },
  });
  assert.ok(finishedOwnerImpact.endedAt);
  assert.ok((finishedOwnerImpact.durationSeconds ?? 0) >= 4 * 60);

  const transferredImpact = await prisma.callImpactInterval.findFirstOrThrow({
    where: { callId: leadershipDuringStop.id, endedAt: null },
  });
  assert.ok(
    transferredImpact.startedAt.getTime() > stoppedAt.getTime(),
    "o novo responsável deve contabilizar impacto somente a partir da transferência",
  );

  const machineStillStoppedAfterHandoff = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(machineStillStoppedAfterHandoff.machineStatus, "stopped");

  const finishedStopOwner = await request(
    `/api/andon-calls/${leadershipDuringStop.id}/finish`,
    json("PATCH", {
      failureClassification: "quality_failure",
      failureDescription: "Sensor legado sem resposta",
    }),
  );
  assert.equal(finishedStopOwner.machineStatusAtFinish, "running");
  assert.equal(finishedStopOwner.failureClassification, "quality_failure");
  assert.equal(finishedStopOwner.failureDescription, "Sensor legado sem resposta");
  assert.equal(finishedStopOwner.assetConfirmedAt, null);
  assert.match(finishedStopOwner.notes ?? "", /Sensor legado sem resposta/);
  assert.doesNotMatch(finishedStopOwner.notes ?? "", /Finalização: Sensor legado sem resposta/);

  const resumedMachine = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(resumedMachine.machineStatus, "running");
  const finishedFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.ok(finishedFailureEvent.endedAt);
  assert.ok((finishedFailureEvent.durationSeconds ?? 0) >= 4 * 60);
  assert.equal(finishedFailureEvent.classification, "quality_failure");
  assert.equal(finishedFailureEvent.notes, "Sensor legado sem resposta");

  const placeholderOnlyCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "quality",
      machineCondition: "stopped",
    }),
    201,
  );
  await request(`/api/andon-calls/${placeholderOnlyCall.id}/attend`, json("PATCH", {}));
  const placeholderEvent = await prisma.failureEvent.findFirstOrThrow({
    where: { callId: placeholderOnlyCall.id },
    orderBy: { startedAt: "desc" },
  });
  assert.equal(placeholderEvent.notes, "Falha registrada na abertura do ANDON");

  const missingStoppedDescription = await request(
    `/api/andon-calls/${placeholderOnlyCall.id}/finish`,
    json("PATCH", { failureClassification: "quality_failure" }),
    400,
  );
  assert.match(missingStoppedDescription.message, /descrição da falha é obrigatória/i);
  await request(
    `/api/andon-calls/${placeholderOnlyCall.id}/finish`,
    json("PATCH", {
      failureClassification: "quality_failure",
      failureDescription: "Falha resolvida no equipamento",
    }),
  );
  const clearedPlaceholderEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: placeholderEvent.id },
  });
  assert.equal(clearedPlaceholderEvent.notes, "Falha resolvida no equipamento");

  const describedAtOpenCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "quality",
      machineCondition: "stopped",
      description: "Sensor óptico intermitente",
    }),
    201,
  );
  await request(`/api/andon-calls/${describedAtOpenCall.id}/attend`, json("PATCH", {}));
  const describedAtOpenFailureEvent = await prisma.failureEvent.findFirstOrThrow({
    where: { callId: describedAtOpenCall.id },
    orderBy: { startedAt: "desc" },
  });
  assert.equal(describedAtOpenFailureEvent.notes, "Falha registrada na abertura do ANDON");

  const finishedDescribedAtOpenCall = await request(
    `/api/andon-calls/${describedAtOpenCall.id}/finish`,
    json("PATCH", {
      failureClassification: "quality_failure",
      failureDescription: "Sensor óptico intermitente",
    }),
  );
  assert.equal(finishedDescribedAtOpenCall.notes, "Sensor óptico intermitente");

  const finishedDescribedAtOpenFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: describedAtOpenFailureEvent.id },
  });
  assert.equal(finishedDescribedAtOpenFailureEvent.notes, "Sensor óptico intermitente");
  const editedPhysical = await request(
    `/api/andon-calls/${describedAtOpenCall.id}/failure-details`,
    json("PATCH", {
      failureClassification: "electrical_failure",
      failureDescription: "Sensor substituído",
    }),
  );
  assert.equal(editedPhysical.failureClassification, "electrical_failure");
  assert.equal(editedPhysical.failureDescription, "Sensor substituído");
  const editedPhysicalEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: describedAtOpenFailureEvent.id },
  });
  assert.equal(editedPhysicalEvent.classification, "electrical_failure");
  assert.equal(editedPhysicalEvent.notes, "Sensor substituído");
  assert.equal(
    editedPhysicalEvent.startedAt.getTime(),
    finishedDescribedAtOpenFailureEvent.startedAt.getTime(),
  );
  assert.equal(
    editedPhysicalEvent.endedAt?.getTime(),
    finishedDescribedAtOpenFailureEvent.endedAt?.getTime(),
  );
  assert.equal(
    editedPhysicalEvent.durationSeconds,
    finishedDescribedAtOpenFailureEvent.durationSeconds,
  );
  assert.equal(await prisma.failureEvent.count({ where: { callId: describedAtOpenCall.id } }), 1);
  assert.doesNotMatch(
    finishedDescribedAtOpenFailureEvent.notes,
    /Falha registrada na abertura do ANDON/,
  );

  const notesOnlyCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "quality",
      machineCondition: "stopped",
    }),
    201,
  );
  await request(`/api/andon-calls/${notesOnlyCall.id}/attend`, json("PATCH", {}));
  const notesOnlyFailureEvent = await prisma.failureEvent.findFirstOrThrow({
    where: { callId: notesOnlyCall.id },
    orderBy: { startedAt: "desc" },
  });

  const finishedNotesOnlyCall = await request(
    `/api/andon-calls/${notesOnlyCall.id}/finish`,
    json("PATCH", {
      notes: "Descrição unificada via notes",
      failureClassification: "quality_failure",
    }),
  );
  assert.equal(finishedNotesOnlyCall.notes, "Descrição unificada via notes");
  assert.doesNotMatch(finishedNotesOnlyCall.notes, /Finalização:/);

  const finishedNotesOnlyFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: notesOnlyFailureEvent.id },
  });
  assert.equal(finishedNotesOnlyFailureEvent.notes, "Descrição unificada via notes");

  const orphanStopToRecover = await request(
    "/api/failure-events",
    json("POST", {
      machineId: ids.impactMachine,
      classification: "unidentified_stop",
      source: "manual",
      machineStatus: "stopped",
      notes: "Falha sem chamado ativo para validar recuperação",
    }),
    201,
  );
  assert.equal(orphanStopToRecover.event.callId, null);

  const runningCallAfterOrphanStop = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "leadership",
      machineCondition: "running",
    }),
    201,
  );
  assert.equal(
    runningCallAfterOrphanStop.machineCondition,
    "running",
    "falha sem chamado ativo deve aceitar a condição pronta para rodar",
  );
  const machineRecoveredWhileOpening = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(machineRecoveredWhileOpening.machineStatus, "running");
  const recoveredOrphanEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: orphanStopToRecover.event.id },
  });
  assert.ok(recoveredOrphanEvent.endedAt);

  await request(
    `/api/andon-calls/${runningCallAfterOrphanStop.id}/cancel`,
    json("PATCH", { reason: "Validação da recuperação de falha órfã" }),
  );

  const orphanStopToClaim = await request(
    "/api/failure-events",
    json("POST", {
      machineId: ids.impactMachine,
      classification: "unidentified_stop",
      source: "manual",
      machineStatus: "stopped",
      notes: "Falha sem chamado ativo para validar nova responsabilidade",
    }),
    201,
  );
  const stoppedCallClaimingOrphan = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.impactMachine,
      category: "production",
      subtype: "quality",
      machineCondition: "stopped",
    }),
    201,
  );
  const claimedOrphanEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: orphanStopToClaim.event.id },
  });
  assert.equal(
    claimedOrphanEvent.callId,
    stoppedCallClaimingOrphan.id,
    "novo chamado parado deve assumir a falha órfã existente",
  );

  await request(
    `/api/andon-calls/${stoppedCallClaimingOrphan.id}/cancel`,
    json("PATCH", { reason: "Validação da recuperação ao cancelar o chamado responsável" }),
  );
  const machineRecoveredOnCancel = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(machineRecoveredOnCancel.machineStatus, "running");
  assert.equal(
    await prisma.failureEvent.count({
      where: { machineId: ids.impactMachine, endedAt: null },
    }),
    0,
    "cancelar o chamado responsável não pode deixar falha órfã aberta",
  );

  const sessionCallA = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.sessionMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const attendedSessionCallA = await request(
    `/api/andon-calls/${sessionCallA.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "4821" }] }),
  );
  assert.equal(attendedSessionCallA.technicianSessions.length, 1);
  assert.equal(attendedSessionCallA.technicianSessions[0].technicianId, electrical.id);

  const sessionCallB = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.sessionMachineB,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const atomicConflict = await request(
    `/api/andon-calls/${sessionCallB.id}/attend`,
    json("PATCH", {
      credentials: [
        { method: "pin", value: "6943" },
        { method: "pin", value: "4821" },
      ],
    }),
    400,
  );
  assert.match(atomicConflict.message, /atendimento ativo em outro chamado/i);
  const unchangedSessionCallB = await prisma.andonCall.findUniqueOrThrow({
    where: { id: sessionCallB.id },
    include: { technicianSessions: true },
  });
  assert.equal(unchangedSessionCallB.status, "open");
  assert.equal(
    unchangedSessionCallB.technicianSessions.length,
    0,
    "a falha de um mantenedor deve reverter todas as sessões do atendimento",
  );

  const sameCallRetry = await request(
    `/api/andon-calls/${sessionCallA.id}/technicians`,
    json("POST", { credentials: [{ method: "rfid", value: "TAG-ELECTRICAL-47" }] }),
    201,
  );
  assert.equal(
    sameCallRetry.technicianSessions.filter(
      (session) => session.technicianId === electrical.id && !session.endedAt,
    ).length,
    1,
    "repetir o mesmo mantenedor no mesmo chamado deve ser idempotente",
  );

  const activeModernSupportSessions = await prisma.technicianSession.count({
    where: { technicianId: electricalSupport.id, endedAt: null },
  });
  assert.equal(
    activeModernSupportSessions,
    0,
    "electricalSupport não pode possuir sessão moderna ativa antes do fixture legado",
  );

  await prisma.technicianSession.create({
    data: {
      callId: sessionCallB.id,
      machineId: ids.sessionMachineB,
      technicianName: electricalSupport.name,
      technicalArea: electricalSupport.technicalArea,
      shiftId: electricalSupport.shiftId,
      shiftName: "Turno CI",
      startedAt: new Date(),
    },
  });
  const legacyActiveSession = await prisma.technicianSession.findFirstOrThrow({
    where: {
      callId: sessionCallB.id,
      technicianId: null,
      technicianName: electricalSupport.name,
      endedAt: null,
    },
  });
  assert.equal(legacyActiveSession.technicianId, null);
  const sessionCallC = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.sessionMachineC,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const legacyConflict = await request(
    `/api/andon-calls/${sessionCallC.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "6943" }] }),
    400,
  );
  assert.match(legacyConflict.message, /atendimento ativo em outro chamado/i);
  await prisma.technicianSession.updateMany({
    where: { callId: sessionCallB.id, technicianId: null, endedAt: null },
    data: { endedAt: new Date(), endReason: "test_fixture" },
  });

  const attendedSessionCallC = await request(
    `/api/andon-calls/${sessionCallC.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "6943" }] }),
  );
  assert.equal(attendedSessionCallC.technicianSessions.length, 1);
  assert.equal(
    attendedSessionCallC.technicianSessions.filter(
      (session) => session.technicianId === electricalSupport.id && !session.endedAt,
    ).length,
    1,
    "sessão legada encerrada deve permitir nova sessão moderna do mesmo mantenedor",
  );
  const addLaterConflict = await request(
    `/api/andon-calls/${sessionCallC.id}/technicians`,
    json("POST", { credentials: [{ method: "pin", value: "4821" }] }),
    400,
  );
  assert.match(addLaterConflict.message, /atendimento ativo em outro chamado/i);
  const sessionCallCAfterConflict = await prisma.technicianSession.count({
    where: { callId: sessionCallC.id, endedAt: null },
  });
  assert.equal(sessionCallCAfterConflict, 1);

  await request(
    `/api/andon-calls/${sessionCallA.id}/technicians/end`,
    json("PATCH", { credential: { method: "pin", value: "4821" } }),
  );
  const addedAfterEnd = await request(
    `/api/andon-calls/${sessionCallC.id}/technicians`,
    json("POST", { credentials: [{ method: "rfid", value: "TAG-ELECTRICAL-47" }] }),
    201,
  );
  assert.equal(
    addedAfterEnd.technicianSessions.filter(
      (session) => session.technicianId === electrical.id && !session.endedAt,
    ).length,
    1,
    "mantenedor liberado ao encerrar deve poder iniciar outro atendimento",
  );
  await request(
    `/api/andon-calls/${sessionCallC.id}/technicians/end`,
    json("PATCH", { credential: { method: "pin", value: "4821" } }),
  );
  await request(
    `/api/andon-calls/${sessionCallC.id}/technicians/end`,
    json("PATCH", { credential: { method: "pin", value: "6943" } }),
  );

  const concurrentSessionCallD = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.sessionMachineD,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const concurrentSessionResponses = await Promise.all(
    [sessionCallB.id, concurrentSessionCallD.id].map((callId) =>
      fetch(`${API_URL}/api/andon-calls/${callId}/attend`, {
        ...json("PATCH", { credentials: [{ method: "pin", value: "4821" }] }),
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  assert.deepEqual(
    concurrentSessionResponses.map((response) => response.status).sort(),
    [200, 400],
    "tentativas concorrentes devem permitir somente um atendimento ativo",
  );
  const finalActiveElectricalSessions = await prisma.technicianSession.count({
    where: { technicianId: electrical.id, endedAt: null },
  });
  assert.equal(finalActiveElectricalSessions, 1);

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

  await request(
    `/api/workstations/${ids.workstation}`,
    json("PATCH", { name: "Workstation A", active: true }),
  );
  for (const [id, name] of [
    [ids.workstationB, "Workstation B"],
    [ids.workstationC, "Workstation C"],
    [ids.inactiveWorkstation, "Workstation inativa"],
  ]) {
    await request("/api/workstations/register", json("POST", { id }));
    await request(`/api/workstations/${id}`, json("PATCH", { name }));
  }
  await request(`/api/workstations/${ids.inactiveWorkstation}`, json("PATCH", { active: false }));

  for (const [id, name] of [
    [ids.workstationMachineA, "Máquina PR 48 workstation A"],
    [ids.workstationMachineB, "Máquina PR 48 workstation B"],
    [ids.workstationMachineC, "Máquina PR 48 workstation C"],
  ]) {
    await request("/api/machines", json("POST", { id, name, productionMode: "scheduled" }), 201);
  }

  const workstationTechnicianA = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor Workstation A",
      employeeId: "000480",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "8642",
    }),
    201,
  );
  const workstationTechnicianB = await request(
    "/api/technicians",
    json("POST", {
      name: "Mantenedor Workstation B",
      employeeId: "000481",
      technicalArea: "electrical",
      shiftId: ids.shift,
      active: true,
      pin: "8643",
    }),
    201,
  );
  ids.workstationTechnicianA = workstationTechnicianA.id;
  ids.workstationTechnicianB = workstationTechnicianB.id;

  const workstationFailureClassification = await request(
    "/api/failure-classifications",
    json("POST", {
      label: "Falha de integração da workstation",
      value: ids.workstationFailureClassificationValue,
      active: true,
    }),
    201,
  );
  assert.equal(workstationFailureClassification.active, true);
  assert.equal(
    workstationFailureClassification.value,
    ids.workstationFailureClassificationValue,
  );

  const finishWorkstationCall = (callId) =>
    request(
      `/api/andon-calls/${callId}/finish`,
      json("PATCH", {
        failureClassification: ids.workstationFailureClassificationValue,
        failureDescription: "Diagnóstico dirigido da restrição por workstation",
        machineStatus: "running",
      }),
    );
  const workstationHeaders = (workstationId) => ({
    "x-andon-workstation-id": workstationId,
  });

  await request(
    "/api/system-settings",
    json("PATCH", { restrictMaintenanceCompletionToAttendanceWorkstation: false }),
  );
  const unrestrictedCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const unrestrictedAttendance = await request(
    `/api/andon-calls/${unrestrictedCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
  );
  assert.equal(unrestrictedAttendance.technicianSessions[0].workstationId, null);
  await request(`/api/andon-calls/${unrestrictedCall.id}/finish-maintenance`, json("PATCH", {}));
  await finishWorkstationCall(unrestrictedCall.id);

  const tracedUnrestrictedCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const tracedUnrestrictedAttendance = await request(
    `/api/andon-calls/${tracedUnrestrictedCall.id}/attend`,
    {
      ...json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
      headers: workstationHeaders(ids.workstation),
    },
  );
  assert.equal(tracedUnrestrictedAttendance.technicianSessions[0].workstationId, ids.workstation);
  await request(`/api/andon-calls/${tracedUnrestrictedCall.id}/finish-maintenance`, {
    ...json("PATCH", {}),
    headers: workstationHeaders(ids.workstationC),
  });
  await finishWorkstationCall(tracedUnrestrictedCall.id);

  const restrictedSettings = await request(
    "/api/system-settings",
    json("PATCH", { restrictMaintenanceCompletionToAttendanceWorkstation: true }),
  );
  assert.equal(restrictedSettings.restrictMaintenanceCompletionToAttendanceWorkstation, true);

  const restrictedCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const missingWorkstationAttendance = await request(
    `/api/andon-calls/${restrictedCall.id}/attend`,
    json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
    400,
  );
  assert.match(missingWorkstationAttendance.message, /identificar esta workstation/i);
  const unknownWorkstationAttendance = await request(
    `/api/andon-calls/${restrictedCall.id}/attend`,
    {
      ...json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
      headers: workstationHeaders("ws_00000000-0000-4000-8000-00000000dead"),
    },
    400,
  );
  assert.match(unknownWorkstationAttendance.message, /identificar esta workstation/i);
  const inactiveWorkstationAttendance = await request(
    `/api/andon-calls/${restrictedCall.id}/attend`,
    {
      ...json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
      headers: workstationHeaders(ids.inactiveWorkstation),
    },
    400,
  );
  assert.match(inactiveWorkstationAttendance.message, /desativada/i);

  const restrictedAttendance = await request(`/api/andon-calls/${restrictedCall.id}/attend`, {
    ...json("PATCH", { credentials: [{ method: "pin", value: "8642" }] }),
    headers: workstationHeaders(ids.workstation),
  });
  assert.equal(restrictedAttendance.technicianSessions[0].workstationId, ids.workstation);

  const missingWorkstationAddition = await request(
    `/api/andon-calls/${restrictedCall.id}/technicians`,
    json("POST", { credentials: [{ method: "pin", value: "8643" }] }),
    400,
  );
  assert.match(missingWorkstationAddition.message, /identificar esta workstation/i);
  const inactiveWorkstationAddition = await request(
    `/api/andon-calls/${restrictedCall.id}/technicians`,
    {
      ...json("POST", { credentials: [{ method: "pin", value: "8643" }] }),
      headers: workstationHeaders(ids.inactiveWorkstation),
    },
    400,
  );
  assert.match(inactiveWorkstationAddition.message, /desativada/i);
  const twoWorkstationAttendance = await request(
    `/api/andon-calls/${restrictedCall.id}/technicians`,
    {
      ...json("POST", { credentials: [{ method: "pin", value: "8643" }] }),
      headers: workstationHeaders(ids.workstationB),
    },
    201,
  );
  assert.ok(
    twoWorkstationAttendance.technicianSessions.some(
      (session) => session.workstationId === ids.workstationB && !session.endedAt,
    ),
  );

  const unauthorizedCompletion = await request(
    `/api/andon-calls/${restrictedCall.id}/finish-maintenance`,
    { ...json("PATCH", {}), headers: workstationHeaders(ids.workstationC) },
    400,
  );
  assert.match(unauthorizedCompletion.message, /workstation|conclua este atendimento/i);
  await request(`/api/andon-calls/${restrictedCall.id}/finish-maintenance`, {
    ...json("PATCH", {}),
    headers: workstationHeaders(ids.workstation),
  });
  await request(
    `/api/andon-calls/${restrictedCall.id}/return-to-maintenance`,
    json("PATCH", { reason: "Validar segunda workstation autorizada" }),
  );
  await request(`/api/andon-calls/${restrictedCall.id}/finish-maintenance`, {
    ...json("PATCH", {}),
    headers: workstationHeaders(ids.workstationB),
  });
  await request(
    `/api/andon-calls/${restrictedCall.id}/return-to-maintenance`,
    json("PATCH", { reason: "Validar workstation desativada" }),
  );

  await request(`/api/workstations/${ids.workstation}`, json("PATCH", { active: false }));
  const inactiveCompletion = await request(
    `/api/andon-calls/${restrictedCall.id}/finish-maintenance`,
    { ...json("PATCH", {}), headers: workstationHeaders(ids.workstation) },
    400,
  );
  assert.match(inactiveCompletion.message, /desativada/i);
  await request(`/api/workstations/${ids.workstation}`, json("PATCH", { active: true }));

  await request(
    `/api/andon-calls/${restrictedCall.id}/technicians/end`,
    json("PATCH", { credential: { method: "pin", value: "8642" }, reason: "handoff_test" }),
  );
  const endedSessionCompletion = await request(
    `/api/andon-calls/${restrictedCall.id}/finish-maintenance`,
    { ...json("PATCH", {}), headers: workstationHeaders(ids.workstation) },
    400,
  );
  assert.match(endedSessionCompletion.message, /workstation|conclua este atendimento/i);
  await request(`/api/andon-calls/${restrictedCall.id}/finish-maintenance`, {
    ...json("PATCH", {}),
    headers: workstationHeaders(ids.workstationB),
  });
  await request(`/api/workstations/${ids.workstationB}`, json("PATCH", { active: false }));
  const finalWithoutWorkstationLock = await finishWorkstationCall(restrictedCall.id);
  assert.equal(finalWithoutWorkstationLock.status, "finished");
  await request(`/api/workstations/${ids.workstationB}`, json("PATCH", { active: true }));

  const legacyRestrictedCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineB,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  await prisma.andonCall.update({
    where: { id: legacyRestrictedCall.id },
    data: {
      status: "in_progress",
      attendedAt: new Date(),
      currentAttendanceStartedAt: new Date(),
      technicianName: "Mantenedor legado workstation",
      technicianNames: ["Mantenedor legado workstation"],
    },
  });
  await prisma.technicianSession.create({
    data: {
      callId: legacyRestrictedCall.id,
      machineId: ids.workstationMachineB,
      technicianName: "Mantenedor legado workstation",
      startedAt: new Date(),
      workstationId: null,
    },
  });
  const legacyCompletion = await request(
    `/api/andon-calls/${legacyRestrictedCall.id}/finish-maintenance`,
    json("PATCH", {}),
  );
  assert.equal(legacyCompletion.status, "post_maintenance");
  await finishWorkstationCall(legacyRestrictedCall.id);

  const mixedRestrictedCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineC,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  await prisma.andonCall.update({
    where: { id: mixedRestrictedCall.id },
    data: {
      status: "in_progress",
      attendedAt: new Date(),
      currentAttendanceStartedAt: new Date(),
      technicianName: "Mantenedor misto workstation",
      technicianNames: ["Mantenedor misto workstation", "Mantenedor moderno workstation"],
    },
  });
  await prisma.technicianSession.createMany({
    data: [
      {
        callId: mixedRestrictedCall.id,
        machineId: ids.workstationMachineC,
        technicianName: "Mantenedor misto workstation",
        startedAt: new Date(),
      },
      {
        callId: mixedRestrictedCall.id,
        machineId: ids.workstationMachineC,
        technicianName: "Mantenedor moderno workstation",
        startedAt: new Date(),
        workstationId: ids.workstation,
      },
    ],
  });
  const mixedUnauthorizedCompletion = await request(
    `/api/andon-calls/${mixedRestrictedCall.id}/finish-maintenance`,
    { ...json("PATCH", {}), headers: workstationHeaders(ids.workstationC) },
    400,
  );
  assert.match(mixedUnauthorizedCompletion.message, /workstation|conclua este atendimento/i);
  await request(`/api/andon-calls/${mixedRestrictedCall.id}/finish-maintenance`, {
    ...json("PATCH", {}),
    headers: workstationHeaders(ids.workstation),
  });
  await finishWorkstationCall(mixedRestrictedCall.id);

  const systemWorkstationCall = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.workstationMachineB,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
      origin: "installer_health_check",
      createdBy: "installer-health",
      isSystemTest: true,
    }),
    201,
  );
  assert.equal(systemWorkstationCall.isSystemTest, true);
  const systemTestTechnicianName = "Mantenedor system test workstation";
  const systemTestStartedAt = new Date();
  await prisma.andonCall.update({
    where: { id: systemWorkstationCall.id },
    data: {
      status: "in_progress",
      attendedAt: systemTestStartedAt,
      currentAttendanceStartedAt: systemTestStartedAt,
      technicianName: systemTestTechnicianName,
      technicianNames: [systemTestTechnicianName],
    },
  });
  const systemTestSession = await prisma.technicianSession.create({
    data: {
      callId: systemWorkstationCall.id,
      machineId: ids.workstationMachineB,
      technicianName: systemTestTechnicianName,
      startedAt: systemTestStartedAt,
      workstationId: null,
    },
  });
  assert.equal(systemTestSession.workstationId, null);
  const systemMaintenanceCompletion = await request(
    `/api/andon-calls/${systemWorkstationCall.id}/finish-maintenance`,
    json("PATCH", {}),
  );
  assert.equal(systemMaintenanceCompletion.status, "post_maintenance");
  const finishedSystemWorkstationCall = await request(
    `/api/andon-calls/${systemWorkstationCall.id}/finish`,
    json("PATCH", { machineStatus: "running" }),
  );
  assert.equal(finishedSystemWorkstationCall.status, "finished");

  await request(
    "/api/system-settings",
    json("PATCH", {
      restrictMaintenanceCompletionToAttendanceWorkstation: false,
      attendanceMode: "name",
    }),
  );

  const individualFollowUpCallA = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.followUpMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const individualAttendanceA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/attend`,
    json("PATCH", {
      technicianNames: [electrical.name, electricalSupport.name, multiAreaTechnician.name],
    }),
  );
  const maintenanceSessionsA = individualAttendanceA.technicianSessions.filter(
    (session) => session.phase === "maintenance" && session.cycleIndex === 1,
  );
  assert.equal(maintenanceSessionsA.length, 3);
  const electricalMaintenanceA = maintenanceSessionsA.find(
    (session) => session.technicianId === electrical.id,
  );
  assert.ok(electricalMaintenanceA);

  const invalidFollowUpSelection = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/finish-maintenance`,
    json("PATCH", { followUpSessionIds: ["session-inexistente"] }),
    400,
  );
  assert.match(invalidFollowUpSelection.message, /seleção de mantenedores/i);

  const selectiveFollowUpA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/finish-maintenance`,
    json("PATCH", { followUpSessionIds: [electricalMaintenanceA.id] }),
  );
  const endedMaintenanceA = selectiveFollowUpA.technicianSessions.filter(
    (session) => session.phase === "maintenance" && session.cycleIndex === 1,
  );
  assert.equal(new Set(endedMaintenanceA.map((session) => session.endedAt)).size, 1);
  const activeFollowUpA = selectiveFollowUpA.technicianSessions.filter(
    (session) => session.phase === "follow_up" && !session.endedAt,
  );
  assert.equal(activeFollowUpA.length, 1);
  assert.equal(activeFollowUpA[0].technicianId, electrical.id);
  assert.equal(activeFollowUpA[0].startedAt, endedMaintenanceA[0].endedAt);

  const individualFollowUpCallB = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.followUpMachineB,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const occupiedInOtherCall = await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/attend`,
    json("PATCH", { technicianNames: [electrical.name] }),
    400,
  );
  assert.match(occupiedInOtherCall.message, /ativo em outro chamado/i);

  const individualAttendanceB = await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/attend`,
    json("PATCH", { technicianNames: [electricalSupport.name] }),
  );
  const supportMaintenanceB = individualAttendanceB.technicianSessions.find(
    (session) => session.technicianId === electricalSupport.id && !session.endedAt,
  );
  assert.ok(supportMaintenanceB);
  await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/finish-maintenance`,
    json("PATCH", { followUpSessionIds: [supportMaintenanceB.id] }),
  );
  const occupiedAsFollower = await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/technicians`,
    json("POST", { technicianNames: [electrical.name] }),
    400,
  );
  assert.match(occupiedAsFollower.message, /ativo em outro chamado/i);

  const endedElectricalFollowUpA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/technicians/${encodeURIComponent(electrical.name)}/end`,
    json("PATCH", { reason: "follow_up_finished" }),
  );
  const electricalFollowUpEndedAt = endedElectricalFollowUpA.technicianSessions.find(
    (session) => session.id === activeFollowUpA[0].id,
  )?.endedAt;
  assert.ok(electricalFollowUpEndedAt);

  const electricalAddedToFollowUpB = await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/technicians`,
    json("POST", { technicianNames: [electrical.name] }),
    201,
  );
  assert.ok(
    electricalAddedToFollowUpB.technicianSessions.some(
      (session) =>
        session.technicianId === electrical.id &&
        session.phase === "follow_up" &&
        session.cycleIndex === 1 &&
        !session.endedAt,
    ),
  );

  const multiAreaFollowUpA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/technicians`,
    json("POST", { technicianNames: [multiAreaTechnician.name] }),
    201,
  );
  const activeMultiAreaFollowUpA = multiAreaFollowUpA.technicianSessions.find(
    (session) =>
      session.technicianId === multiAreaTechnician.id &&
      session.phase === "follow_up" &&
      !session.endedAt,
  );
  assert.ok(activeMultiAreaFollowUpA);
  assert.equal(activeMultiAreaFollowUpA.technicalArea, "electrical");

  const returnedIndividualA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/return-to-maintenance`,
    json("PATCH", { reason: "Novo ciclo individual" }),
  );
  const cycleTwoMaintenanceA = returnedIndividualA.technicianSessions.filter(
    (session) => session.phase === "maintenance" && session.cycleIndex === 2 && !session.endedAt,
  );
  assert.deepEqual(
    cycleTwoMaintenanceA.map((session) => session.technicianId),
    [multiAreaTechnician.id],
  );
  const closedMultiAreaFollowUpA = returnedIndividualA.technicianSessions.find(
    (session) => session.id === activeMultiAreaFollowUpA.id,
  );
  assert.equal(closedMultiAreaFollowUpA.endReason, "returned_to_maintenance");
  assert.equal(cycleTwoMaintenanceA[0].startedAt, closedMultiAreaFollowUpA.endedAt);

  const concludedCycleTwoA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/finish-maintenance`,
    json("PATCH", { followUpSessionIds: [] }),
  );
  assert.equal(
    concludedCycleTwoA.technicianSessions.filter((session) => !session.endedAt).length,
    0,
  );
  const finalizedIndividualA = await request(
    `/api/andon-calls/${individualFollowUpCallA.id}/finish`,
    json("PATCH", {
      failureClassification: "electrical_failure",
      failureDescription: "Validação de acompanhamento individual A",
      machineStatus: "running",
      confirmedMachineSetId: null,
      confirmedMachineSubsetId: null,
    }),
  );
  assert.equal(
    finalizedIndividualA.technicianSessions.find((session) => session.id === activeFollowUpA[0].id)
      ?.endedAt,
    electricalFollowUpEndedAt,
  );

  const finalizedIndividualB = await request(
    `/api/andon-calls/${individualFollowUpCallB.id}/finish`,
    json("PATCH", {
      failureClassification: "electrical_failure",
      failureDescription: "Validação de acompanhamento individual B",
      machineStatus: "running",
      confirmedMachineSetId: null,
      confirmedMachineSubsetId: null,
    }),
  );
  assert.ok(
    finalizedIndividualB.technicianSessions
      .filter((session) => session.phase === "follow_up")
      .every((session) => session.endedAt && session.endReason === "final_call"),
  );

  const concurrentCallA = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.followUpMachineA,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const concurrentAttendanceA = await request(
    `/api/andon-calls/${concurrentCallA.id}/attend`,
    json("PATCH", { technicianNames: [electrical.name] }),
  );
  const concurrentMaintenanceA = concurrentAttendanceA.technicianSessions.find(
    (session) => session.technicianId === electrical.id && !session.endedAt,
  );
  assert.ok(concurrentMaintenanceA);
  const concurrentFollowUpA = await request(
    `/api/andon-calls/${concurrentCallA.id}/finish-maintenance`,
    json("PATCH", { followUpSessionIds: [concurrentMaintenanceA.id] }),
  );
  assert.ok(
    concurrentFollowUpA.technicianSessions.some(
      (session) =>
        session.technicianId === electrical.id && session.phase === "follow_up" && !session.endedAt,
    ),
  );

  const concurrentCallB = await request(
    "/api/andon-calls",
    json("POST", {
      machineId: ids.followUpMachineB,
      category: "maintenance",
      subtype: "electrical",
      machineCondition: "running",
    }),
    201,
  );
  const attendedAfterMachineLock = await runAfterAdvisoryLockWait(
    ids.followUpMachineB,
    () =>
      request(
        `/api/andon-calls/${concurrentCallB.id}/attend`,
        json("PATCH", { technicianNames: [electrical.name] }),
      ),
    () =>
      request(
        `/api/andon-calls/${concurrentCallA.id}/technicians/${encodeURIComponent(electrical.name)}/end`,
        json("PATCH", { reason: "follow_up_finished" }),
      ),
  );
  const endedConcurrentFollowUpA =
    attendedAfterMachineLock.whileBlockedResult.technicianSessions.find(
      (session) =>
        session.technicianId === electrical.id && session.phase === "follow_up" && session.endedAt,
    );
  const concurrentMaintenanceB = attendedAfterMachineLock.result.technicianSessions.find(
    (session) =>
      session.technicianId === electrical.id && session.phase === "maintenance" && !session.endedAt,
  );
  assert.ok(endedConcurrentFollowUpA?.endedAt);
  assert.ok(concurrentMaintenanceB);
  assert.equal(attendedAfterMachineLock.result.attendedAt, concurrentMaintenanceB.startedAt);
  assert.equal(
    attendedAfterMachineLock.result.currentAttendanceStartedAt,
    concurrentMaintenanceB.startedAt,
  );
  assert.ok(
    new Date(concurrentMaintenanceB.startedAt).getTime() >=
      new Date(attendedAfterMachineLock.barrierAt).getTime(),
    "atendimento deve gerar startedAt somente depois de obter o lock da máquina",
  );
  assert.ok(
    new Date(concurrentMaintenanceB.startedAt).getTime() >=
      new Date(endedConcurrentFollowUpA.endedAt).getTime(),
    "sessões do mesmo técnico em chamados distintos não podem se sobrepor",
  );

  const completedAfterTechnicianLock = await runAfterAdvisoryLockWait(
    `andon-technician-session:${electrical.id}`,
    () =>
      request(
        `/api/andon-calls/${concurrentCallB.id}/finish-maintenance`,
        json("PATCH", { followUpSessionIds: [concurrentMaintenanceB.id] }),
      ),
  );
  const closedConcurrentMaintenanceB = completedAfterTechnicianLock.result.technicianSessions.find(
    (session) => session.id === concurrentMaintenanceB.id,
  );
  const activeConcurrentFollowUpB = completedAfterTechnicianLock.result.technicianSessions.find(
    (session) =>
      session.technicianId === electrical.id && session.phase === "follow_up" && !session.endedAt,
  );
  assert.ok(closedConcurrentMaintenanceB?.endedAt);
  assert.ok(activeConcurrentFollowUpB);
  assert.equal(closedConcurrentMaintenanceB.endedAt, activeConcurrentFollowUpB.startedAt);
  assert.ok(
    new Date(activeConcurrentFollowUpB.startedAt).getTime() >=
      new Date(completedAfterTechnicianLock.barrierAt).getTime(),
    "maintenance -> follow_up deve usar timestamp posterior ao lock do técnico",
  );

  const returnedAfterTechnicianLock = await runAfterAdvisoryLockWait(
    `andon-technician-session:${electrical.id}`,
    () =>
      request(
        `/api/andon-calls/${concurrentCallB.id}/return-to-maintenance`,
        json("PATCH", { reason: "Validação concorrente" }),
      ),
  );
  const closedConcurrentFollowUpB = returnedAfterTechnicianLock.result.technicianSessions.find(
    (session) => session.id === activeConcurrentFollowUpB.id,
  );
  const returnedConcurrentMaintenanceB = returnedAfterTechnicianLock.result.technicianSessions.find(
    (session) =>
      session.technicianId === electrical.id &&
      session.phase === "maintenance" &&
      session.cycleIndex === 2 &&
      !session.endedAt,
  );
  assert.ok(closedConcurrentFollowUpB?.endedAt);
  assert.ok(returnedConcurrentMaintenanceB);
  assert.equal(closedConcurrentFollowUpB.endedAt, returnedConcurrentMaintenanceB.startedAt);
  assert.ok(
    new Date(returnedConcurrentMaintenanceB.startedAt).getTime() >=
      new Date(returnedAfterTechnicianLock.barrierAt).getTime(),
    "follow_up -> maintenance deve usar timestamp posterior ao lock do técnico",
  );

  const endedAfterTechnicianLock = await runAfterAdvisoryLockWait(
    `andon-technician-session:${electrical.id}`,
    () =>
      request(
        `/api/andon-calls/${concurrentCallB.id}/technicians/${encodeURIComponent(electrical.name)}/end`,
        json("PATCH", { reason: "support_finished" }),
      ),
  );
  const endedConcurrentMaintenanceB = endedAfterTechnicianLock.result.technicianSessions.find(
    (session) => session.id === returnedConcurrentMaintenanceB.id,
  );
  assert.ok(endedConcurrentMaintenanceB?.endedAt);
  assert.ok(
    new Date(endedConcurrentMaintenanceB.endedAt).getTime() >=
      new Date(endedAfterTechnicianLock.barrierAt).getTime(),
    "encerramento individual deve gerar endedAt somente depois do lock do técnico",
  );

  const addedAfterTechnicianLock = await runAfterAdvisoryLockWait(
    `andon-technician-session:${electricalSupport.id}`,
    () =>
      request(
        `/api/andon-calls/${concurrentCallB.id}/technicians`,
        json("POST", { technicianNames: [electricalSupport.name] }),
        201,
      ),
  );
  const concurrentSupportMaintenanceB = addedAfterTechnicianLock.result.technicianSessions.find(
    (session) =>
      session.technicianId === electricalSupport.id &&
      session.phase === "maintenance" &&
      !session.endedAt,
  );
  assert.ok(concurrentSupportMaintenanceB);
  assert.ok(
    new Date(concurrentSupportMaintenanceB.startedAt).getTime() >=
      new Date(addedAfterTechnicianLock.barrierAt).getTime(),
    "adição de mantenedor deve gerar startedAt somente depois do lock do técnico",
  );

  const concurrentSessions = await prisma.technicianSession.findMany({
    where: { callId: { in: [concurrentCallA.id, concurrentCallB.id] } },
    orderBy: { startedAt: "asc" },
  });
  assert.ok(
    concurrentSessions.every(
      (session) => !session.endedAt || session.startedAt.getTime() <= session.endedAt.getTime(),
    ),
    "nenhuma TechnicianSession encerrada pode possuir duração negativa",
  );

  console.log("Fluxo PostgreSQL/API com setores e credenciais diretas: OK");
}

try {
  await run();
} finally {
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
}
