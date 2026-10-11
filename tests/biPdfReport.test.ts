import assert from "node:assert/strict";
import test from "node:test";

import { buildExecutiveReportHtml, type ExecutiveReportData } from "../src/services/andonBiPdfReport.ts";

function fixture(): ExecutiveReportData {
  const period = {
    start: "2026-10-04T12:00:00.000Z",
    end: "2026-10-11T12:00:00.000Z",
    effectiveEnd: "2026-10-11T12:00:00.000Z",
  };
  const filters = {
    period: "7d" as const,
    machineId: "machine9",
    subtype: "",
    classification: "",
  };
  const data = {
    filters,
    options: {
      machines: [{ id: "machine9", name: "Máquina <9>", isActive: true }],
      sectors: [{ id: "eletrica", displayName: "Elétrica", active: true, categoryGroup: "maintenance" }],
      classifications: [
        { id: "fault", label: "Sensor & proteção", value: "sensor", active: true },
      ],
    },
    overview: {
      meta: {
        metricDefinitionVersion: "bi-mvp-4",
        generatedAt: "2026-10-11T12:00:00.000Z",
        timeZone: "America/Sao_Paulo",
        period,
      },
      kpis: {
        callsOpened: 4,
        activeCallsNow: 2,
        callsFinished: 1,
        mttaMinutes: 28,
        avgMaintenanceMinutes: 48,
        downtimeMinutes: 7620,
        physicalStopEpisodes: 1,
        mtbfEstimatedMinutes: 2480,
        avgDowntimePerEpisodeMinutes: 7620,
        maintenanceReturnRatePercent: 0,
        classificationCoveragePercent: 100,
      },
      coverage: { mttaSampleSize: 2, maintenanceTimeSampleSize: 1 },
      comparison: {
        downtimeMinutes: { direction: "up", deltaPercent: 10, current: 7620, previous: 6000 },
      },
      highlights: {
        topMachine: { machineId: "machine9", machineName: "Máquina <9>", downtimeMinutes: 7620, sharePercent: 100 },
      },
      classificationPareto: [{ label: "sensor", count: 1 }],
    },
    reliability: {
      assets: [{
        machineId: "machine9",
        machineName: "Máquina <9>",
        downtimeMinutes: 7620,
        physicalStopEpisodes: 1,
        mtbfEstimatedMinutes: 2480,
        callsOpened: 4,
        activeCallCount: 2,
      }],
      dataHealth: {
        activeCallsOver24h: 1,
        openFailureEventsOver24h: 1,
        activeSessionsOver24h: 1,
        finishedCallsMissingClassification: 0,
        standaloneFailureEvents: 1,
      },
    },
    maintenance: {
      totals: {
        maintenancePersonMinutes: 460,
        followUpPersonMinutes: 30,
        technicianCount: 2,
        activeSessionCount: 1,
      },
      technicians: [{
        technicianName: "Daniel <script>alert(1)</script>",
        maintenanceMinutes: 250,
        followUpMinutes: 30,
        totalPersonMinutes: 280,
        callCount: 1,
      }],
      technicalAreas: [{
        technicalArea: "eletrica",
        maintenanceMinutes: 460,
        followUpMinutes: 30,
        technicianCount: 2,
      }],
    },
    failures: {
      totals: { repeated24h: 1, repeated7d: 1, repeated30d: 2, maintenanceReturnCycles: 1 },
      groups: [{
        machineName: "Máquina <9>",
        classification: "sensor",
        calls: 2,
        repeats24h: 1,
        repeats7d: 1,
        repeats30d: 2,
      }],
    },
  };
  return data as unknown as ExecutiveReportData;
}

test("gera documento A4 em três seções com filtros e indicadores reais", () => {
  const html = buildExecutiveReportHtml(fixture());
  assert.match(html, /@page \{ size: A4 portrait/);
  assert.match(html, /Relatório executivo de manutenção/);
  assert.match(html, /Ativos críticos e reincidências/);
  assert.match(html, /Equipe, integridade e metodologia/);
  assert.match(html, /Últimos 7 dias/);
  assert.match(html, /126h/);
  assert.match(html, /Reincidência diagnóstica/);
  assert.match(html, /Participação técnica/);
  assert.match(html, /MTBF estimado/);
  assert.match(html, /Sem dados de teste/);
  assert.match(html, /Página 3\/3/);
});

test("escapa nomes cadastrados e textos de diagnóstico para impedir HTML injetado", () => {
  const html = buildExecutiveReportHtml(fixture());
  assert.match(html, /Máquina &lt;9&gt;/);
  assert.match(html, /Sensor &amp; proteção/);
  assert.match(html, /Daniel &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /126h 60min/);
});

test("não fabrica zeros quando a amostra é desconhecida", () => {
  const data = fixture();
  data.overview.kpis.mttaMinutes = null;
  data.overview.kpis.mtbfEstimatedMinutes = null;
  data.overview.kpis.activeCallsNow = null;
  data.failures.totals.repeatRate30dPercent = null;
  const html = buildExecutiveReportHtml(data);
  assert.match(html, /Snapshot operacional atual/);
  assert.match(html, /MTTA/);
  assert.match(html, /MTBF estimado/);
  assert.match(html, /<div class="kpi-value">—<\/div>/);
});

test("documento mostra advertência explícita de integridade em dados abertos", () => {
  const html = buildExecutiveReportHtml(fixture());
  assert.match(html, /Atenção à qualidade do dado/);
  assert.match(html, /não registros únicos/);
  assert.match(html, /Não equivale/);
  assert.match(html, /não em horas produtivas/);
});
