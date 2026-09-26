import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("unifica chamados, falhas vinculadas e ocorrências órfãs por máquina", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /const stopHistory = machine\.stopHistory/);
  assert.match(history, /failureEventsByCallId\.get\(event\.callId\) \?\? \[\]/);
  assert.match(history, /linkedEvents\.push\(event\)/);
  assert.match(history, /failureEventsByCallId\.set\(event\.callId, linkedEvents\)/);
  assert.match(history, /showFailureImpact: boolean/);
  assert.match(history, /\{showFailureImpact &&/);
  assert.match(
    history,
    /linkedFailureEvents\.map\(\(event\) => renderFailureEvent\(event, false\)\)/,
  );
  assert.match(history, /!event\.callId \|\| !callIds\.has\(event\.callId\)/);
  assert.match(history, /orphanFailureEvents\.push\(event\)/);
  assert.match(history, /Ocorrências de falha sem chamado vinculado/);
  assert.match(
    history,
    /orphanFailureEvents\.map\(\(event\) => renderFailureEvent\(event, true\)\)/,
  );
  assert.match(history, /new Date\(b\.stoppedAt\).*new Date\(a\.stoppedAt\)/s);
});

test("preserva edição de falha e catálogo central no histórico unificado", async () => {
  const history = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(history, /getFailureClassificationConfigs\(\)/);
  assert.match(history, /catalogByValue\.get\(value\)/);
  assert.match(history, /option\.active \|\| option\.value === editingClassification/);
  assert.match(history, /Catálogo central de classificações indisponível/);
  assert.match(history, /updateMachineStopEventDescription\(/);
  assert.match(history, /editingText\.trim\(\)/);
  assert.match(history, /Selecione uma classificação específica para a ocorrência/);
});

test("remove Apuração somente da interface e preserva os tempos técnicos", async () => {
  const [history, types] = await Promise.all([
    readFile(new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/types/andon.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(history, /Apuração:/);
  assert.doesNotMatch(history, /formatTimeAllocationSource/);
  assert.match(history, /buildTechnicianTimeAllocations/);
  assert.match(history, /Início: \{formatDateTime\(row\.startedAt\)\}/);
  assert.match(history, /Fim: \{formatDateTime\(row\.endedAt\)\}/);
  assert.match(types, /source: TechnicianTimeAllocationSource/);
});

test("mantém somente um acesso normal e reutiliza a página na rota legada", async () => {
  const [actions, legacyRoute, stopPanel] = await Promise.all([
    readFile(new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/routes/machines.$machineId_.failure-history.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineStopHistoryPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.equal(actions.match(/Histórico de chamados/g)?.length, 1);
  assert.equal(actions.match(/\/machines\/\$machineId\/call-history/g)?.length, 1);
  assert.doesNotMatch(actions, /Histórico de falhas/);
  assert.doesNotMatch(actions, /\/machines\/\$machineId\/failure-history/);
  assert.match(legacyRoute, /import \{ MachineCallHistoryPage \}/);
  assert.match(legacyRoute, /<MachineCallHistoryPage/);
  assert.doesNotMatch(legacyRoute, /MachineFailureHistoryPage/);
  assert.match(stopPanel, /<StopHistoryList stopHistory=\{machine\.stopHistory\}/);
});
