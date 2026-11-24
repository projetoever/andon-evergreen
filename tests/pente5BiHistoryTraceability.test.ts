import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildBiCallTrace } from "../src/components/history/CallBiParticipationPanel";

const call = (changes: Record<string, unknown> = {}) => ({
  status: "finished",
  isSystemTest: false,
  openedAt: "2026-11-24T10:00:00Z",
  attendedAt: "2026-11-24T10:05:00Z",
  finishedAt: "2026-11-24T10:20:00Z",
  failureResponsibility: "maintenance",
  analyticsDisposition: "include",
  failureClassification: "mechanical",
  maintenanceReturnCount: 0,
  technicianSessions: [{ id: "session1" }],
  impactIntervals: [{id: "impact1"}],
  callReasonSnapshot: {
    reasonNameSnapshot: "Manutenção",
    optionNameSnapshot: "Mecânica",
    nature: "corrective_failure",
    maintenanceKpiPolicy: "eligible",
    analyticsDisposition: "include",
  },
  ...changes,
});

test("PENTE5-H: corrective maintenance has structural candidate but physical contribution remains conditional", () => {
  const result = buildBiCallTrace(call());
  assert.equal(result.correctiveCandidate, true);
  assert.equal(result.returnEligible, true);
  assert.equal(result.rows.find(row => row.key === "mtta")?.verdict, "candidate");
  assert.equal(result.rows.find(row => row.key === "mttr")?.verdict, "needs_evidence");
  assert.equal(result.rows.find(row => row.key === "mtbf")?.verdict, "needs_evidence");
  assert.equal(result.rows.find(row => row.key === "physical")?.verdict, "recorded");
  assert.equal(result.rows.find(row => row.key === "return")?.verdict, "candidate");
});

test("PENTE5-H: Group Setup remains physical/technician evidence, not corrective", () => {
  const result = buildBiCallTrace(call({
    callReasonSnapshot: {
      reasonNameSnapshot: "SETUP", optionNameSnapshot: "Mecânica",
      nature: "planned_setup", maintenanceKpiPolicy: "excluded",
      analyticsDisposition: "include",
    },
  }));
  assert.equal(result.origin,"group");
  assert.equal(result.correctiveCandidate,false);
  for(const field of ["mtta", "mttr", "mtbf", "return"])
    assert.equal(result.rows.find(row=>row.key===field)?.verdict, "excluded", field);
  assert.equal(result.rows.find(row=>row.key==="physical")?.verdict, "recorded");
  assert.equal(result.rows.find(row=>row.key==="technical")?.verdict, "recorded");
});

test("PENTE5-H: legacy no reason snapshot does not fabricate group or opening channel", () => {
  const result = buildBiCallTrace(call({callReasonSnapshot:null,impactIntervals:[],technicianSessions:[]}));
  assert.equal(result.origin,"no_group_snapshot");
  assert.equal(result.correctiveCandidate,true, "legacy follows preexisting candidate path only");
  assert.equal(result.rows.find(row=>row.key==="physical")?.verdict, "unknown");
});

test("PENTE5-H: classification exclusion, cancelled and system test never become corrective or return samples", () => {
  for(const variation of [
    {isSystemTest:true},
    {status:"cancelled"},
    {analyticsDisposition:"test"},
    {failureClassification:"duplicate"},
  ]) {
    const r=buildBiCallTrace(call(variation));
    assert.equal(r.callExcluded,true);
    assert.equal(r.correctiveCandidate,false);
    assert.equal(r.returnEligible,false);
    assert.equal(r.rows.find(row=>row.key==="operational")?.verdict,"excluded");
  }
});

test("PENTE5-H: non-include group policy is flagged for operational BI query audit",()=>{
  const r=buildBiCallTrace(call({callReasonSnapshot:{
    reasonNameSnapshot:"Teste",optionNameSnapshot:"Mecânica",
    nature:"corrective_failure",maintenanceKpiPolicy:"eligible",analyticsDisposition:"test",
  }}));
  assert.equal(r.groupDispositionExcluded,true);
  assert.equal(r.correctiveCandidate,false);
  assert.equal(r.rows.find(row=>row.key==="operational")?.verdict,"unknown");
});

test("PENTE5-H: machine/global views reuse one evidence panel; API preserves scoped history", async()=>{
  const [globalView,machineView,detail,route] = await Promise.all([
    readFile(new URL("../src/components/history/GlobalHistoryDetailSections.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/pages/MachineCallHistoryPage.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/services/globalHistoryService.ts",import.meta.url),"utf8"),
    readFile(new URL("../server/src/routes/andonCalls.ts",import.meta.url),"utf8"),
  ]);
  assert.match(globalView,/<CallBiParticipationPanel call=\{call\}\/>/);
  assert.match(machineView,/<CallBiParticipationPanel call=\{call\}\/>/);
  assert.match(detail,/maintenanceKpiPolicy\?: string/);
  assert.match(route,/scopedGlobalCallDetailWhere\(request\.params\.callId, allowedIds\)/);
  assert.match(route,/where: \{ callId: call\.id, machineId: call\.machineId \}/);
  assert.match(route,/maintenanceKpiPolicy: true, analyticsDisposition: true, suggestedResponsibility: true/);
});
