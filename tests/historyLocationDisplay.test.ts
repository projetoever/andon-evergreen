import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildHistoryCsv } from "../src/services/exportService";
import type { AndonCall } from "../src/types/andon";
import { getEffectiveAssetLocationLabel } from "../src/utils/assetLocationUtils";

const closedCall: AndonCall = {
  id: "call-history-1",
  machineId: "11",
  machineSetNameSnapshot: "Linha de abertura",
  machineSubsetNameSnapshot: "Módulo de abertura",
  confirmedMachineSetNameSnapshot: "Linha confirmada",
  confirmedMachineSubsetNameSnapshot: "Módulo confirmado",
  assetConfirmedAt: "2026-09-22T12:00:00.000Z",
  assetConfirmedBy: "Técnico",
  assetLocationChanged: true,
  assetChangeReason: "Ativo corrigido na finalização",
  category: "maintenance",
  subtype: "electrical",
  status: "finished",
  criticality: "high",
  machineCondition: "stopped",
  openedAt: "2026-09-22T10:00:00.000Z",
  attendedAt: "2026-09-22T10:05:00.000Z",
  currentAttendanceStartedAt: null,
  maintenanceCompletedAt: "2026-09-22T10:30:00.000Z",
  finishedAt: "2026-09-22T10:35:00.000Z",
  technicianName: "Técnico",
  technicianNames: ["Técnico"],
  technicianArea: "electrical",
  callWaitingMinutes: 5,
  attendanceMinutes: 25,
  postMaintenanceMinutes: 5,
  maintenanceReturnCount: 0,
  totalCallMinutes: 35,
  machineStoppedMinutes: 35,
  notes: "Falha elétrica",
  createdBy: null,
  origin: "kiosk",
  isSystemTest: false,
  updatedAt: "2026-09-22T10:35:00.000Z",
};

test("usa localização confirmada e mantém fallback histórico da abertura", () => {
  assert.equal(
    getEffectiveAssetLocationLabel(closedCall, "Não informado"),
    "Linha confirmada › Módulo confirmado",
  );

  assert.equal(
    getEffectiveAssetLocationLabel(
      {
        machineSetNameSnapshot: "Linha legada",
        machineSubsetNameSnapshot: "Módulo legado",
      },
      "Não informado",
    ),
    "Linha legada › Módulo legado",
  );
});

test("simplifica a tabela global para uma localização e timestamps terminais", async () => {
  const table = await readFile(
    new URL("../src/components/history/HistoryTable.tsx", import.meta.url),
    "utf8",
  );

  assert.match(table, /getEffectiveAssetLocationLabel/);
  assert.equal(table.match(/>\s*Localização\s*</g)?.length, 1);
  assert.match(table, /Conclusão da manutenção/);
  assert.match(table, /Finalizado em/);
  assert.match(table, /Motivo da correção/);
  assert.match(table, /call\.isSystemTest/);
  assert.match(table, /Teste automático/);

  for (const removedLabel of [
    "Localização efetiva",
    "Localização na abertura",
    "Localização confirmada",
    "Confirmação do ativo",
    "Confirmado por",
    "Confirmado em",
    "Origem",
    "Aberto",
    "Atendido",
  ]) {
    assert.doesNotMatch(table, new RegExp(removedLabel));
  }
});

test("simplifica o histórico da máquina sem perder correção, cancelamento ou ID", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(history.match(/Localização: \{effectiveAssetLocation\}/g)?.length, 1);
  assert.match(
    history,
    /new Date\(b\.finishedAt \?\? b\.openedAt\).*new Date\(a\.finishedAt \?\? a\.openedAt\)/s,
  );
  assert.match(history, /formatDateTime\(call\.finishedAt \?\? call\.openedAt\)/);
  assert.match(history, /Conclusão da manutenção/);
  assert.match(history, /"Cancelado em" : "Finalizado em"/);
  assert.match(history, /Justificativa da correção/);
  assert.match(history, /Justificativa do cancelamento/);
  assert.match(history, /\{call\.cancelReason\}/);
  assert.match(history, /<CallIdLabel callId=\{call\.id\}/);
  assert.doesNotMatch(history, /Apuração:/);
  assert.doesNotMatch(history, /formatTimeAllocationSource/);
  assert.doesNotMatch(history, />Origem:/);

  for (const removedLabel of [
    "Localização efetiva",
    "Localização confirmada",
    "Confirmação do ativo",
    "Confirmado por",
    "Confirmado em",
    "Aberto em",
    "Atendido em",
    "Origem:",
  ]) {
    assert.doesNotMatch(history, new RegExp(removedLabel));
  }
});

test("gera CSV com localização única e timestamps padronizados", () => {
  const csv = buildHistoryCsv([closedCall]);
  const [header, row] = csv.split("\r\n");
  const columns = header.split(";");

  assert.equal(columns.filter((column) => column === "Localização").length, 1);
  assert.ok(columns.includes("Conclusão da manutenção"));
  assert.ok(columns.includes("Finalizado em"));
  assert.ok(columns.includes("Motivo da correção"));
  assert.match(row, /Linha confirmada › Módulo confirmado/);
  assert.match(row, /Ativo corrigido na finalização/);

  for (const removedColumn of [
    "Origem",
    "Localização efetiva",
    "Localização na abertura",
    "Localização confirmada",
    "Situação da confirmação",
    "Confirmado por",
    "Confirmado em",
    "Aberto em",
    "Atendido em",
  ]) {
    assert.ok(!columns.includes(removedColumn));
  }
});

test("preserva snapshots e metadados internos no Backup JSON", async () => {
  const [types, schema, route, locationUtils, backupPanel, backupSchema, exportService] =
    await Promise.all([
      readFile(new URL("../src/types/andon.ts", import.meta.url), "utf8"),
      readFile(new URL("../server/prisma/schema.prisma", import.meta.url), "utf8"),
      readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/utils/assetLocationUtils.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/components/settings/DataBackupPanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/services/backupSchema.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/exportService.ts", import.meta.url), "utf8"),
    ]);

  for (const source of [types, schema]) {
    assert.match(source, /machineSetCodeSnapshot/);
    assert.match(source, /machineSetNameSnapshot/);
    assert.match(source, /machineSubsetCodeSnapshot/);
    assert.match(source, /machineSubsetNameSnapshot/);
    assert.match(source, /confirmedMachineSetNameSnapshot/);
    assert.match(source, /confirmedMachineSubsetNameSnapshot/);
    assert.match(source, /assetConfirmedAt/);
    assert.match(source, /assetConfirmedBy/);
    assert.match(source, /assetLocationChanged/);
    assert.match(source, /assetChangeReason/);
  }

  assert.match(types, /origin: CallOrigin/);
  assert.match(types, /openedAt: string/);
  assert.match(types, /attendedAt: string \| null/);
  for (const timestamp of ["openedAt", "attendedAt", "maintenanceCompletedAt", "finishedAt"]) {
    assert.match(backupSchema, new RegExp(`${timestamp}: isoString`));
  }
  assert.match(backupPanel, /exportBackupToJson\(\{/);
  assert.match(backupPanel, /\bcalls,\s*settings,/);
  assert.match(backupPanel, /Exportar Backup JSON/);
  assert.match(exportService, /JSON\.stringify\(data, null, 2\)/);
  assert.match(route, /const openingSetKey = assetSnapshotKey/);
  assert.match(route, /const openingSubsetKey = assetSnapshotKey/);
  assert.match(locationUtils, /export function getOpeningAssetLocation\(/);
  assert.match(locationUtils, /call\.machineSetCodeSnapshot/);
  assert.match(locationUtils, /call\.machineSubsetCodeSnapshot/);
});
