import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMachinePdfHtml } from "../src/services/andonBiMachinePdfReport.ts";
import type { AnalyticsMachine360 } from "../src/types/analytics.ts";

function data(): AnalyticsMachine360 {
  const x = {
    machine: { id: "m9", name: "Máquina <9>", isActive: false, machineStatus: "stopped", productionMode: "manual" },
    meta: {
      generatedAt: "2026-10-13T08:00:00Z", timeZone: "America/Sao_Paulo",
      period: { start: "2026-10-06T08:00:00Z", end: "2026-10-13T08:00:00Z", effectiveEnd: "2026-10-13T08:00:00Z" },
      filters: { machineId: "m9", subtype: "mechanical", classification: "sensor" },
    },
    kpis: {
      downtimeMinutes: 90, physicalStopEpisodes: 1, mtbfEstimatedMinutes: 0,
      mttaMinutes: 20, avgMaintenanceMinutes: null, avgDowntimePerEpisodeMinutes: 90,
      callsOpened: 2, callsFinished: 1, callsActiveNow: 1,
      maintenanceReturnCycles: 1, activeSessionsNow: 1,
    },
    dataHealth: { openFailureEvents: 1 },
    diagnoses: [{ classification: "sensor", count: 1 }],
    recurrence: {
      totals: {
        diagnosedFinishedCalls: 1, repeated24h: 1, repeated7d: 1, repeated30d: 1,
        repeatedSet30d: 1, repeatedSubset30d: 1, maintenanceReturnCycles: 1,
        withSetSnapshot: 1, withSubsetSnapshot: 1,
      },
      groups: [{
        setName: "Transportador", subsetName: "Sensor <script>", classification: "sensor",
        calls: 1, repeats30d: 1, lastFinishedAt: "2026-10-13T06:00:00Z",
      }],
      groupsTruncated: false, totalTimelineCases: 1, timelineTruncated: false,
      timeline: [{
        callId: "a", finishedAt: "2026-10-13T06:00:00Z", classification: "sensor",
        setName: "Transportador", subsetName: "Sensor <script>",
        workOrderNumber: "OS-1", description: "Sensor", returnCycles: 1,
        previousDiagnosisHours: 2, previousSetHours: 2, previousSubsetHours: 2,
        repeat24h: true, repeat7d: true, repeat30d: true,
        repeatSet30d: true, repeatSubset30d: true,
      }],
      semantics: {
        lookback: "30 dias antes", hierarchy: "Diagnóstico e local iguais",
      },
    },
  };
  return x as unknown as AnalyticsMachine360;
}

test("BI-11 gera duas páginas A4 por máquina sem falsificar MTBF de máquina inativa", () => {
  const html = buildMachinePdfHtml(data(), new Map([["sensor", "Sensor & falha"]]));
  assert.match(html, /@page \{ size: A4 portrait; margin: 0;/);
  assert.equal((html.match(/<section class="page">/g) ?? []).length, 2);
  assert.match(html, /Machine 360 · Máquina &lt;9&gt;/);
  assert.match(html, /Repetições ≤30d/);
  assert.match(html, /Mesmo subconjunto ≤30d/);
  assert.match(html, /<span>Intervalo entre paradas \(calendário\)<\/span><strong>—<\/strong>/);
  assert.match(html, /Sensor &amp; falha/);
  assert.match(html, /Sensor &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Somente leitura/);
});

test("BI-11 expõe análise de componentes em abas e abre relatório via impressão nativa", async () => {
  const [overlay, components, route, serverScript] = await Promise.all([
    readFile(new URL("../src/components/bi/BiMachine360Overlay.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/bi/BiMachineRecurrence.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/analytics.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/package.json", import.meta.url), "utf8"),
  ]);
  assert.match(overlay, /BiMachineRecurrence/);
  assert.match(overlay, /Reincidências e componentes/);
  assert.match(overlay, /activeView === "overview"/);
  assert.match(overlay, /event\.key !== "Escape"/);
  assert.match(overlay, /buildMachinePdfHtml/);
  assert.match(overlay, /openReportPrintDialog/);
  assert.match(components, /ResizeObserver/);
  assert.match(components, /Mesmo subconjunto/);
  assert.match(components, /previousDiagnosisHours/);
  assert.match(route, /buildMachine360Recurrence/);
  assert.match(route, /confirmedMachineSubsetId/);
  assert.match(serverScript, /machine360Recurrence\.test\.ts/);
});
