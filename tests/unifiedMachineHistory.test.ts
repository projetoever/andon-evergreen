import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MachineActionPanel } from "../src/components/machines/MachineActionPanel";
import type { AndonCall } from "../src/types/andon";
import type { Machine } from "../src/types/machine";

import {
  formatMachinePanelDurationMinutes,
  formatMachineStoppedDurationMinutes,
} from "../src/utils/durationUtils";

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
  assert.match(history, /buildTechnicianParticipationSummaries/);
  assert.match(history, /Primeiro início: \{formatDateTime\(row\.startedAt\)\}/);
  assert.match(history, /Último fim: \{formatDateTime\(row\.endedAt\)\}/);
  assert.match(history, /Total individual/);
  assert.match(history, /Tempo total legado/);
  assert.match(types, /source: TechnicianTimeAllocationSource/);
});

test("mantém um acesso compacto ao histórico no cabeçalho e reutiliza a rota legada", async () => {
  const [header, actions, legacyRoute, stopPanel] = await Promise.all([
    readFile(
      new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
      "utf8",
    ),
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

  assert.match(header, /to="\/machines\/\$machineId\/call-history"/);
  assert.match(header, />\s*\{t\("Histórico"\)\}\s*</);
  assert.match(header, /aria-label=\{t\("Voltar ao painel"\)\}/);
  assert.doesNotMatch(actions, /Histórico de chamados/);
  assert.doesNotMatch(actions, /Voltar ao painel/);
  assert.doesNotMatch(actions, /\/machines\/\$machineId\/call-history/);
  assert.doesNotMatch(actions, /Histórico de falhas/);
  assert.doesNotMatch(actions, /\/machines\/\$machineId\/failure-history/);
  assert.match(legacyRoute, /import \{ MachineCallHistoryPage \}/);
  assert.match(legacyRoute, /<MachineCallHistoryPage/);
  assert.doesNotMatch(legacyRoute, /MachineFailureHistoryPage/);
  assert.match(stopPanel, /<StopHistoryList stopHistory=\{machine\.stopHistory\}/);
});

test("tela da máquina destaca os temporizadores sem recriar navegação inferior", async () => {
  const [statusPanel, callPanel, actions] = await Promise.all([
    readFile(
      new URL("../src/components/machines/MachineCurrentStatusPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(statusPanel, /text-\[clamp\(2rem,3vw,3\.25rem\)\]/);
  assert.match(callPanel, /text-\[clamp\(1rem,10cqw,2\.5rem\)\]/);
  assert.match(callPanel, /Aguardando/);
  assert.match(callPanel, /Em atendimento/);
  assert.match(callPanel, /Acompanhamento/);
  assert.match(callPanel, /Total/);
  assert.doesNotMatch(actions, /secondaryActionClass/);
});


test("temporizadores de chamado exibem no máximo duas unidades", () => {
  assert.equal(formatMachinePanelDurationMinutes(45 / 60), "45 s");
  assert.equal(formatMachinePanelDurationMinutes(22 + 15 / 60), "22 min 15 s");
  assert.equal(formatMachinePanelDurationMinutes(73.5), "1 h 13 min");
  assert.equal(formatMachinePanelDurationMinutes(2 * 1440 + 4 * 60 + 12), "2 d 04 h");
});

test("temporizador de parada mantém até três unidades", () => {
  assert.equal(formatMachineStoppedDurationMinutes(59 + 59 / 60), "59 min 59 s");
  assert.equal(formatMachineStoppedDurationMinutes(89 + 18 / 60), "1 h 29 min 18 s");
  assert.equal(
    formatMachineStoppedDurationMinutes(24 * 60 + 3 * 60 + 12),
    "1 d 03 h 12 min",
  );
});

test("painéis da máquina usam o formato compacto nos temporizadores destacados", async () => {
  const [statusPanel, callPanel] = await Promise.all([
    readFile(
      new URL("../src/components/machines/MachineCurrentStatusPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(statusPanel, /formatMachineStoppedDurationMinutes\(stoppedMin\)/);
  assert.match(callPanel, /formatMachinePanelDurationMinutes\(waiting\)/);
  assert.match(callPanel, /formatMachinePanelDurationMinutes\(attending\)/);
  assert.match(callPanel, /formatMachinePanelDurationMinutes\(postMaintenance\)/);
  assert.match(callPanel, /formatMachinePanelDurationMinutes\(total\)/);
});


test("aviso de workstation não muda o tamanho das ações nem libera conclusão bloqueada", () => {
  const call = {
    id: "mechanical",
    status: "in_progress",
    category: "maintenance",
    subtype: "mechanical",
    technicianSessions: [],
  } as unknown as AndonCall;
  const props = {
    machine: { machineStatus: "stopped" } as Machine,
    currentCall: call,
    activeCalls: [call],
    selectedCallId: call.id,
    categories: [
      {
        id: "mechanical",
        displayName: "Mecânica",
        color: "#F59E0B",
        categoryGroup: "maintenance" as const,
        active: true,
        displayOrder: 1,
      },
    ],
    hasActiveStopOwner: true,
    onOpenSubtype() {},
    onSelectCall() {},
    onAttend() {},
    onCancelCall() {},
    onFinish() {},
    onCompleteMaintenance() {},
    onReturnToMaintenance() {},
  };
  const allowed = renderToStaticMarkup(createElement(MachineActionPanel, props));
  const blocked = renderToStaticMarkup(
    createElement(MachineActionPanel, {
      ...props,
      maintenanceCompletionDisabled: true,
      maintenanceCompletionHint: "Conclua na estação de origem",
      maintenanceCompletionHintTone: "danger",
    }),
  );
  const buttonClasses = (html: string) =>
    Array.from(html.matchAll(/<button[^>]*class="([^"]*)"/g), (match) => match[1]);
  assert.deepEqual(buttonClasses(blocked), buttonClasses(allowed));
  assert.match(blocked, /<button[^>]*disabled=""/);
  assert.doesNotMatch(allowed, /<button[^>]*disabled=""/);
  assert.match(blocked, /Conclua na estação de origem/);
  assert.match(blocked, /Use a estação do atendimento/);
});

test("histórico fica imediatamente à esquerda de fixar tela com a mesma escala", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
    "utf8",
  );

  const historyIndex = source.indexOf('aria-label={t("Histórico da máquina")}');
  const historyStart = source.lastIndexOf("<Link", historyIndex);
  const lockIndex = source.indexOf("onClick={onToggleScreenLock}");
  const lockStart = source.lastIndexOf("<button", lockIndex);

  assert.ok(historyStart >= 0);
  assert.ok(historyIndex > historyStart);
  assert.ok(lockStart > historyIndex);
  assert.ok(lockIndex > lockStart);
  assert.match(
    source.slice(historyStart, lockStart),
    /h-9.*text-\[11px\].*md:h-10/s,
  );
  assert.match(
    source.slice(lockStart),
    /h-9.*text-\[11px\].*md:h-10/s,
  );
});


test("histórico e fixar tela permanecem juntos em qualquer quebra responsiva", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /inline-flex shrink-0 items-center gap-1\.5/);
  const pairStart = source.indexOf('className="inline-flex shrink-0 items-center gap-1.5"');
  const historyIndex = source.indexOf('aria-label={t("Histórico da máquina")}', pairStart);
  const lockIndex = source.indexOf("onClick={onToggleScreenLock}", pairStart);
  assert.ok(pairStart >= 0);
  assert.ok(historyIndex > pairStart);
  assert.ok(lockIndex > historyIndex);
});


test("status e chamado alinham os temporizadores na zona superior", async () => {
  const [statusPanel, callPanel] = await Promise.all([
    readFile(
      new URL("../src/components/machines/MachineCurrentStatusPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(statusPanel, /min-h-\[2\.5rem\]/);
  assert.match(callPanel, /min-h-\[2\.5rem\]/);
  assert.match(statusPanel, /machine-detail-facts/);
  assert.match(callPanel, /machine-detail-facts/);
  assert.match(statusPanel, /lg:grid-rows-1 lg:items-stretch/);
  assert.match(callPanel, /lg:auto-rows-fr/);
  assert.doesNotMatch(statusPanel, /grid min-h-0 flex-1 content-start/);
  assert.doesNotMatch(callPanel, /grid min-h-0 flex-1 content-start/);
  assert.match(statusPanel, /<dl className="mt-1\.5 shrink-0">/);
  assert.match(callPanel, /<dl className="mt-1\.5 grid shrink-0/);
  assert.match(statusPanel, /Tempo total em falha/);
  assert.match(callPanel, /label=\{t\("Aguardando"\)\}/);
  assert.match(callPanel, /label=\{t\("Em atendimento"\)\}/);
  assert.match(callPanel, /label=\{t\("Acompanhamento"\)\}/);
  assert.match(callPanel, /label=\{t\("Total"\)\}/);
});


test("cartões de status preenchem a faixa informativa e contadores seguem logo abaixo", async () => {
  const [statusPanel, callPanel] = await Promise.all([
    readFile(
      new URL("../src/components/machines/MachineCurrentStatusPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/machines/MachineCurrentCallPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(statusPanel, /lg:grid-rows-1 lg:items-stretch/);
  assert.match(statusPanel, /lg:h-full/);
  assert.match(callPanel, /lg:auto-rows-fr/);
  assert.match(statusPanel, /mt-1\.5 shrink-0/);
  assert.match(callPanel, /mt-1\.5 grid shrink-0/);
});
