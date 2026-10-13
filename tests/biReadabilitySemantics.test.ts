import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("BI de leitura: distingue aberturas no período de chamados ativos no snapshot", async () => {
  const [overview, summary, shell] = await Promise.all([
    readFile(new URL("../src/components/bi/BiOverviewWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiExecutiveSummary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/AndonBiPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(overview, /label="Novos chamados"/);
  assert.match(overview, /label="Chamados ativos"/);
  assert.match(overview, /label="Tempo de parada"/);
  assert.match(overview, /label="Tempo médio de manutenção"/);
  assert.match(summary, /"Tempo de parada"/);
  assert.match(shell, /testes automáticos marcados excluídos/);
  assert.match(shell, /h-dvh overflow-hidden/);
});

test("Parada diária usa barras e parcelas por data, sem simular uma tendência de recuperação", async () => {
  const src = await readFile(new URL("../src/components/bi/BiDowntimeTrendCard.tsx", import.meta.url), "utf8");
  assert.match(src, /<BarChart/);
  assert.match(src, /<Bar\s/);
  assert.match(src, /Parada física por dia/);
  assert.match(src, /dias parciais no período móvel/);
  assert.match(src, /Parada no dia/);
  assert.match(src, /tickFormatter=/);
  assert.doesNotMatch(src, /<AreaChart/);
});

test("BI explicita que MTBF é estimativa e esforço técnico soma pessoas", async () => {
  const [reliability, attendance, actors, quality] = await Promise.all([
    readFile(new URL("../src/components/bi/BiReliabilityStrip.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiMaintenanceParticipation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiBadActorsPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiDataHealthPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(reliability, /estimativa por calendário/);
  assert.match(reliability, /Máquina|máquina|população/);
  assert.match(attendance, /Soma de horas por técnico, inclusive simultâneas/);
  assert.match(actors, /Máquinas críticas · Bad Actors/);
  assert.match(actors, /table-fixed text-left text-xs/);
  assert.match(quality, /Qualidade dos dados · Investigação/);
});

test("PDF identifica a fonte como ambiente consultado sem negar testes manuais", async () => {
  const [report, machine] = await Promise.all([
    readFile(new URL("../src/services/andonBiPdfReport.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonBiMachinePdfReport.ts", import.meta.url), "utf8"),
  ]);
  assert.match(report, /Ambiente consultado · Testes marcados excluídos/);
  assert.match(report, /Testes manuais não identificados/);
  assert.doesNotMatch(report, /Sem dados de teste/);
  assert.match(machine, /ambientes de homologação podem conter testes manuais/);
});
