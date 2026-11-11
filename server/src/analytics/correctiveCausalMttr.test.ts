import assert from "node:assert/strict";
import test from "node:test";
import { buildCorrectiveCausalEpisodes, buildCausalEpisodes } from "./causality.js";
import { buildExecutiveOverview, calculatePhysicalDowntimeByMachine, type AnalyticsFailureEventRecord } from "./overview.js";

const date = (value: string) => new Date(value);
const setup: AnalyticsFailureEventRecord = {
  id: "setup_stop", machineId: "37", machineName: "Máquina 37",
  startedAt: date("2026-11-11T10:00:00Z"), endedAt: date("2026-11-11T10:30:00Z"),
  classification: "mechanical", failureResponsibility: "maintenance",
  linkedCallIsSystemTest: false, callId: "setup_call",
  correctiveReasonCandidate: false,
};
const corrective: AnalyticsFailureEventRecord = {
  id: "corrective_stop", machineId: "37", machineName: "Máquina 37",
  startedAt: date("2026-11-11T11:00:00Z"), endedAt: date("2026-11-11T11:20:00Z"),
  classification: "mechanical", failureResponsibility: "maintenance",
  linkedCallIsSystemTest: false, callId: "corrective_call",
  correctiveReasonCandidate: true,
};

test("S4-C: Setup stop stays physical but cannot prove a corrective episode", () => {
  const events = [setup, corrective];
  assert.equal(buildCausalEpisodes(events).filter(row => row.responsibility === "maintenance").length, 2);
  const episodes = buildCorrectiveCausalEpisodes(events);
  assert.deepEqual(episodes.map(row => row.responsibility), ["unassigned", "maintenance"]);
  const physical = calculatePhysicalDowntimeByMachine(events,
    date("2026-11-11T09:00:00Z"), date("2026-11-11T12:00:00Z"));
  assert.equal(physical[0]?.downtimeMinutes, 50);
  const result = buildExecutiveOverview({
    calls: [], failureEvents: events, causalEpisodes: buildCausalEpisodes(events),
    correctiveCausalEpisodes: episodes,
    activeCallsNow: 0, reliabilityAssets: null,
    start: date("2026-11-11T09:00:00Z"), end: date("2026-11-11T12:00:00Z"),
    effectiveEnd: date("2026-11-11T12:00:00Z"), generatedAt: date("2026-11-11T12:00:00Z"),
    timeZone: "America/Sao_Paulo", filters: {},
  });
  assert.equal(result.kpis.downtimeMinutes, 50);
  assert.equal(result.kpis.physicalStopEpisodes, 2);
  assert.equal(result.kpis.mttrMinutes, 20);
});

test("S4-C: setup impact overrides false maintenance diagnosis conservatively", () => {
  const impacts = [{
    id: "setup_impact", machineId: "37",
    startedAt: setup.startedAt, endedAt: setup.endedAt,
    failureResponsibility: "maintenance",
    correctiveReasonCandidate: false,
  }];
  const episodes = buildCorrectiveCausalEpisodes([setup], impacts);
  assert.equal(episodes[0].responsibility, "unassigned");
});

test("S4-C: legacy physical maintenance event keeps established attribution", () => {
  const legacy = { ...corrective, id: "legacy", correctiveReasonCandidate: undefined };
  assert.equal(buildCorrectiveCausalEpisodes([legacy])[0].responsibility, "maintenance");
});
