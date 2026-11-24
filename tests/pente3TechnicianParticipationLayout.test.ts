import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GlobalHistoryDetailSections } from "../src/components/history/GlobalHistoryDetailSections";
import type { GlobalHistoryCallDetail, GlobalHistoryTechnicianSession } from "../src/services/globalHistoryService";
import { historyTechnicianTotals } from "../src/utils/globalHistoryDetailMetrics";
import { translateLabel } from "../src/i18n/translate";

const fixture = (sessions: GlobalHistoryTechnicianSession[]): GlobalHistoryCallDetail => ({
  id: "test-call", machineId: "M37", openedAt: "2026-11-23T19:12:00.000Z",
  attendedAt: null, maintenanceCompletedAt: null, finishedAt: null,
  technicianSessions: sessions, technicianTimeAllocations: [],
  impactIntervals: [], productionHistory: [], failureEvents: [],
  auditEvents: [], diagnosisAudits: [],
} as unknown as GlobalHistoryCallDetail);

const count = (html: string, marker: string) =>
  (html.match(new RegExp(marker, "g")) ?? []).length;

const celso: GlobalHistoryTechnicianSession[] = [
  {
    id: "session-attend", technicianId: "t1", technicianName: "Celso",
    phase: "maintenance", startedAt: "2026-11-23T19:12:00.000Z",
    endedAt: "2026-11-23T19:12:42.000Z",
    endReason: "maintenance_completed", notes: null,
  },
  {
    id: "session-followup", technicianId: "t1", technicianName: "Celso",
    phase: "follow_up", startedAt: "2026-11-23T19:13:00.000Z",
    endedAt: "2026-11-23T19:13:12.000Z",
    endReason: "final_call", notes: null,
  },
];

test("PENTE 3 technician layout: two real Celso sessions share one full-width summary", () => {
  const html = renderToStaticMarkup(createElement(GlobalHistoryDetailSections, { call: fixture(celso) }));
  assert.equal(count(html, "data-history-technician-group"), 1);
  assert.equal(count(html, "data-history-technician-session"), 2);
  assert.match(html, /xl:grid-cols-2/);
  assert.match(html, /sm:grid-cols-3/);
  assert.match(html, /Sessão 1/);
  assert.match(html, /Sessão 2/);
  assert.match(html, /Manutenção concluída/);
  assert.match(html, /Finalização da ocorrência/);
  // Rendered times are snapshots; formatting and grouping do not recalculate totals.
  const [total] = historyTechnicianTotals(celso);
  assert.equal(total.sessions, 2);
  assert.equal(total.measuredSessions, 2);
  assert.ok(Math.abs(total.maintenanceMinutes - 0.7) < 1e-9);
  assert.ok(Math.abs(total.followUpMinutes - 0.2) < 1e-9);
});

test("PENTE 3 technician layout: independent people, unknown identity and incomplete sessions survive", () => {
  const sessions: GlobalHistoryTechnicianSession[] = [
    ...celso,
    {
      id: "other", technicianId: "t2", technicianName: "Alex",
      phase: "maintenance", startedAt: "2026-11-23T19:14:00Z",
      endedAt: null, notes: "Conferindo mecanismo", endReason: null,
    },
    {
      id: "unknown", technicianId: null, technicianName: "",
      phase: "maintenance", startedAt: "2026-11-23T19:15:00Z",
      endedAt: null, notes: null, endReason: "other",
    },
  ];
  const html = renderToStaticMarkup(createElement(GlobalHistoryDetailSections, { call: fixture(sessions) }));
  assert.equal(count(html, "data-history-technician-group"), 2);
  assert.equal(count(html, "data-history-technician-session"), 4);
  assert.match(html, /Sessões sem mantenedor identificado/);
  assert.match(html, /Total parcial: há sessões sem duração comprovada/);
  assert.match(html, /Sessão sem encerramento registrado/);
  const totals = historyTechnicianTotals(sessions);
  assert.equal(totals.length, 2);
  assert.equal(totals.find(row => row.key === "t2")?.measuredSessions, 0);
});

test("PENTE 3 technician layout: legacy allocation never becomes a fabricated session", () => {
  const call = { ...fixture([]), technicianTimeAllocations: [
    { technicianName: "Celso", minutes: 5, source: "legacy",
      startedAt: null, endedAt: null },
  ] } as GlobalHistoryCallDetail;
  const html = renderToStaticMarkup(createElement(GlobalHistoryDetailSections, { call }));
  assert.equal(count(html, "data-history-technician-group"), 0);
  assert.equal(count(html, "data-history-technician-session"), 0);
  assert.match(html, /Alocações legadas registradas/);
});

test("PENTE 3 technician layout: responsive grouping is display-only and translations are complete", async () => {
  const s = await readFile(new URL("../src/components/history/GlobalHistoryDetailSections.tsx", import.meta.url), "utf8");
  assert.match(s, /historyTechnicianTotals\(sessions\)/);
  assert.match(s, /historySessionMinutes\(session\)/);
  assert.match(s, /formatSessionEndReason\(session\.endReason\)/);
  assert.match(s, /xl:grid-cols-2/);
  assert.match(s, /sm:grid-cols-3/);
  assert.doesNotMatch(s, /reduce\([^)]*duration|dangerouslySetInnerHTML|eval\(/);
  for (const label of ["Sessão {0}", "Sessões detalhadas", "Sessões sem mantenedor identificado"])
    for (const language of ["en", "zh-TW"] as const)
      assert.notEqual(translateLabel(language, label), label);
});
