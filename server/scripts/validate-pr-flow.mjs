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
  shift: "pr47-shift",
  electricalTechnician: "pr47-tech-electrical",
  electricalSupportTechnician: "pr50-tech-electrical-support",
  mechanicalTechnician: "pr47-tech-mechanical",
  unusedSetType: "pr51-unused-set-type",
  unusedSubsetType: "pr51-unused-subset-type",
  inactiveSet: "pr51-inactive-set",
  inactiveSubset: "pr51-inactive-subset",
  category: "pr48_pneumatic",
  unusedCategory: "pr48_unused",
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

async function cleanup() {
  const machineIds = [ids.machine, ids.raceMachine, ids.impactMachine];
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
        in: [ids.electricalTechnician, ids.electricalSupportTechnician, ids.mechanicalTechnician],
      },
    },
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

  const deletedSetType = await request(
    `/api/machine-set-types/${ids.unusedSetType}`,
    { method: "DELETE" },
  );
  assert.equal(deletedSetType.deleted, true);
  assert.equal(
    (await prisma.machineSet.findUniqueOrThrow({ where: { id: ids.inactiveSet } })).typeId,
    null,
    "a exclusão do catálogo deve preservar o conjunto inativo sem o vínculo removido",
  );

  const deletedSubsetType = await request(
    `/api/machine-subset-types/${ids.unusedSubsetType}`,
    { method: "DELETE" },
  );
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
  const electricalSupport = await request(
    "/api/technicians",
    json("POST", {
      name: "Apoio Elétrico PR 50",
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

  const finishedLeadership = await request(
    `/api/andon-calls/${leadershipRunning.id}/finish`,
    json("PATCH", { notes: "Apoio encerrado sem localização técnica" }),
  );
  assert.equal(finishedLeadership.status, "finished");
  assert.equal(finishedLeadership.assetConfirmedAt, null);
  assert.equal(finishedLeadership.confirmedMachineSetId, null);
  assert.equal(
    finishedLeadership.machineStoppedMinutes,
    0,
    "chamado que não causou a parada não pode herdar impacto produtivo de outro chamado",
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

  await request(`/api/andon-calls/${leadershipDuringStop.id}/attend`, json("PATCH", {}));
  const missingConditionResponse = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", { notes: "Condição normalizada" }),
    400,
  );
  assert.match(missingConditionResponse.message, /máquina continua em falha/i);

  const missingResponsibleCallResponse = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", {
      notes: "Máquina permanece parada sem atribuição",
      machineStatus: "stopped",
    }),
    400,
  );
  assert.match(missingResponsibleCallResponse.message, /selecione ao menos um chamado/i);

  const continuedStopOwner = await request(
    `/api/andon-calls/${qualityStopped.id}/finish`,
    json("PATCH", {
      notes: "Atendimento finalizado, mas a máquina continua parada",
      machineStatus: "stopped",
      impactCallIds: [leadershipDuringStop.id],
    }),
  );
  assert.equal(continuedStopOwner.machineStatusAtFinish, "stopped");
  assert.equal(continuedStopOwner.assetConfirmedAt, null);

  const transferredFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.equal(transferredFailureEvent.endedAt, null);
  assert.equal(transferredFailureEvent.callId, leadershipDuringStop.id);
  assert.equal(
    transferredFailureEvent.startedAt.getTime(),
    stoppedAt.getTime(),
    "transferir a responsabilidade não pode reiniciar o timer de falha",
  );

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
    json("PATCH", { notes: "Último chamado simultâneo encerrado" }),
  );
  assert.equal(finishedStopOwner.machineStatusAtFinish, "running");
  assert.equal(finishedStopOwner.assetConfirmedAt, null);

  const resumedMachine = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(resumedMachine.machineStatus, "running");
  const finishedFailureEvent = await prisma.failureEvent.findUniqueOrThrow({
    where: { id: ownedFailureEvent.id },
  });
  assert.ok(finishedFailureEvent.endedAt);
  assert.ok((finishedFailureEvent.durationSeconds ?? 0) >= 4 * 60);

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

  await request(`/api/andon-calls/${runningCallAfterOrphanStop.id}/cancel`, {
    method: "PATCH",
  });

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

  await request(`/api/andon-calls/${stoppedCallClaimingOrphan.id}/cancel`, {
    method: "PATCH",
  });
  const machineRecoveredOnCancel = await request(`/api/machines/${ids.impactMachine}`);
  assert.equal(machineRecoveredOnCancel.machineStatus, "running");
  assert.equal(
    await prisma.failureEvent.count({
      where: { machineId: ids.impactMachine, endedAt: null },
    }),
    0,
    "cancelar o chamado responsável não pode deixar falha órfã aberta",
  );

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
