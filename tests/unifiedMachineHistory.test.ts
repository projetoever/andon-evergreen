import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(header, />\s*Histórico\s*</);
  assert.match(header, /aria-label="Voltar ao painel"/);
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
  assert.match(callPanel, /text-\[clamp\(1\.5rem,2\.25vw,2\.5rem\)\]/);
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


test("ações da máquina usam altura responsiva e fluxo centralizado", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /activeTechnicianCount/);
  assert.match(source, /hasDenseOperationalContent/);
  assert.match(source, /layoutStage === "idle"/);
  assert.match(source, /layoutStage === "open"/);
  assert.match(source, /layoutStage === "active"/);
  assert.match(source, /min-h-\[clamp\(6rem,10\.5vh,8rem\)\]/);
  assert.match(source, /min-h-\[clamp\(7rem,14vh,9\.5rem\)\]/);
  assert.match(source, /min-h-\[clamp\(5rem,8\.5vh,6\.25rem\)\]/);
  assert.match(source, /: "min-h-12 text-sm"/);
  assert.match(source, /min-h-\[clamp\(5\.5rem,10vh,6\.75rem\)\]/);
  assert.match(source, /sm:max-w-\[46rem\]/);
  assert.match(source, /min-h-11 w-full px-2 text-xs sm:flex-1 sm:max-w-\[38rem\]/);
  assert.match(source, /flex flex-wrap items-stretch justify-center/);
  assert.match(source, /> Atender selecionado/);
  assert.match(source, /> Cancelar selecionado/);
});

test("histórico fica imediatamente à esquerda de fixar tela com a mesma escala", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url),
    "utf8",
  );

  const historyIndex = source.indexOf('aria-label="Histórico da máquina"');
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
  const historyIndex = source.indexOf('aria-label="Histórico da máquina"', pairStart);
  const lockIndex = source.indexOf("onClick={onToggleScreenLock}", pairStart);
  assert.ok(pairStart >= 0);
  assert.ok(historyIndex > pairStart);
  assert.ok(lockIndex > historyIndex);
});


test("chamado aberto prioriza acessibilidade com ações significativamente maiores", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /layoutStage === "open"[\s\S]*min-h-\[clamp\(7rem,14vh,9\.5rem\)\]/,
  );
  assert.match(
    source,
    /layoutStage === "open"[\s\S]*min-h-\[clamp\(5\.5rem,10vh,6\.75rem\)\]/,
  );
  assert.match(source, /xl:text-2xl/);
  assert.match(source, /md:text-lg/);
  assert.match(source, /hasDenseOperationalContent/);
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

  assert.match(statusPanel, /min-h-\[3\.25rem\]/);
  assert.match(callPanel, /min-h-\[3\.25rem\]/);
  assert.match(statusPanel, /xl:min-h-\[9\.5rem\]/);
  assert.match(callPanel, /xl:min-h-\[9\.5rem\]/);
  assert.match(statusPanel, /xl:grid-rows-1 xl:items-stretch/);
  assert.match(callPanel, /xl:auto-rows-fr/);
  assert.doesNotMatch(statusPanel, /grid min-h-0 flex-1 content-start/);
  assert.doesNotMatch(callPanel, /grid min-h-0 flex-1 content-start/);
  assert.match(statusPanel, /<dl className="mt-1\.5 shrink-0">/);
  assert.match(callPanel, /<dl className="mt-1\.5 grid shrink-0/);
  assert.match(statusPanel, /Tempo total em falha/);
  assert.match(callPanel, /label="Aguardando"/);
  assert.match(callPanel, /label="Em atendimento"/);
  assert.match(callPanel, /label="Acompanhamento"/);
  assert.match(callPanel, /label="Total"/);
});


test("conteúdo denso continua compactando as ações automaticamente", async () => {
  const source = await readFile(
    new URL("../src/components/machines/MachineActionPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /activeTechnicianCount > 0/);
  assert.match(source, /currentCall\?\.status === "post_maintenance"/);
  assert.match(source, /Boolean\(maintenanceCompletionHint\)/);
  assert.match(source, /: "min-h-12 text-sm"/);
  assert.match(
    source,
    /: "min-h-11 w-full px-2 text-xs sm:flex-1 sm:max-w-\[38rem\] sm:text-sm"/,
  );
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

  assert.match(statusPanel, /xl:grid-rows-1 xl:items-stretch/);
  assert.match(statusPanel, /xl:h-full/);
  assert.match(callPanel, /xl:auto-rows-fr/);
  assert.match(statusPanel, /mt-1\.5 shrink-0/);
  assert.match(callPanel, /mt-1\.5 grid shrink-0/);
});
