import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateRc23 } from "./check-rc23.mjs";
const original = JSON.parse(readFileSync(new URL("./rc23-acceptance.json", import.meta.url),"utf8"));
const copy = () => structuredClone(original);
const accept = () => {
  const m = copy();
  m.installedCommit = m.candidateCommit;
  m.gates = m.gates.map(g => ({
    ...g, implementation:"implemented", operator:"approved",
    acceptance:{status:"approved",approvedBy:"operador",approvedAt:"2026-11-23",
      evidence:["https://github.com/projetoever/andon-evergreen/issues/595#evidencia"]},
  }));
  m.operatorFinalAcceptance={status:"approved",approvedBy:"operador",
    approvedAt:"2026-11-23",evidence:["https://github.com/projetoever/andon-evergreen/issues/595#termo"]};
  m.externalApprovals=m.externalApprovals.map(a=>({...a,status:"approved",approvedBy:"TI / titular",
    approvedAt:"2026-11-23",evidence:["https://github.com/projetoever/andon-evergreen/issues/595#autorizacao"]}));
  m.reportAuthorization={status:"approved",approvedBy:"operador",approvedAt:"2026-11-23",
    evidence:["https://github.com/projetoever/andon-evergreen/issues/595#relat1"]};
  return m;
};
test("RC gate: green CI + current Health do not authorize release when P0 or P1 physical HML is absent", () => {
  const x=evaluateRc23(copy(), {headCommit:original.candidateCommit});
  assert.equal(x.valid,true);
  assert.equal(x.labGo,false);
  assert.equal(x.industrialCommercialGo,false);
  assert.equal(x.reportAllowed,false);
  assert(x.labBlockers.some(b=>b.startsWith("RC04 P0: reprovado")));
  assert(x.labBlockers.some(b=>b.includes("SHA instalado")));
  assert(x.externalBlockers.some(b=>b.includes("ti_firewall_ca")));
});
test("RC gate: tampered/stale HEAD, duplicate or absent P0 fails closed", () => {
  const m=accept();
  assert.equal(evaluateRc23(m,{headCommit:"b".repeat(40)}).labGo,false);
  m.gates.push({...m.gates[0]});
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).valid,false);
  m.gates.pop();
  m.gates=m.gates.filter(g=>g.id!=="RC04");
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).valid,false);
});
test("RC gate: one P0 cannot be accepted with CI alone or waived via P1", () => {
  const m=accept();
  const gate=m.gates.find(g=>g.id==="RC04");
  gate.operator="failed";
  m.p1Waivers=[{id:"RC04",status:"approved",approvedBy:"operador",
    approvedAt:"2026-11-23",reason:"Não alterar política operacional",
    evidence:["https://github.com/projetoever/andon-evergreen/issues/570"]}];
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,false);
  gate.operator="approved";
  gate.acceptance.evidence=[];
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,false);
});
test("RC gate: P1 waiver needs signed evidence; failed test is never waived", () => {
  const m=accept();const g=m.gates.find(x=>x.id==="RC06");
  g.operator="pending";g.acceptance=undefined;
  m.p1Waivers=[{id:"RC06",status:"approved",approvedBy:"operador",approvedAt:"2026-11-23",
    reason:"Somente demonstração em laboratório, risco residual registrado",
    evidence:["https://github.com/projetoever/andon-evergreen/issues/595#p1-waiver"]}];
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,true);
  m.p1Waivers[0].evidence=[];
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,false);
  m.p1Waivers[0].evidence=["https://github.com/projetoever/andon-evergreen/issues/595#p1-waiver"];
  g.operator="failed";
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,false);
});
test("RC gate: CI for a previous merged SHA never authorizes a newer candidate", () => {
  const m=accept();
  m.ci.mergedCommit="b".repeat(40);
  const rejected=evaluateRc23(m,{headCommit:m.candidateCommit});
  assert.equal(rejected.labGo,false);
  assert(rejected.labBlockers.some(b=>b.includes("CI aprovada")));
  m.ci.mergedCommit=m.candidateCommit;
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).labGo,true);
});

test("RC gate: field acceptance never grants factory/commercial or RELAT1 without separate permits", () => {
  const m=accept();
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).industrialCommercialGo,true);
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).reportAllowed,true);
  m.externalApprovals[0].status="pending";
  m.reportAuthorization.status="pending";
  const r=evaluateRc23(m,{headCommit:m.candidateCommit});
  assert.equal(r.labGo,true);
  assert.equal(r.industrialCommercialGo,false);
  assert.equal(r.reportAllowed,false);
  m.reportAuthorization.status="approved";
  m.gates.find(g=>g.id==="RC02").operator="pending";
  assert.equal(evaluateRc23(m,{headCommit:m.candidateCommit}).reportAllowed,false);
});
