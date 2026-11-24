import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { scopedGlobalCallDetailWhere } from "../services/globalCallHistoryDetail.js";
import { bindAuthorizedMachineReadPrincipal, isScopedMachineReadRoute } from "../security/centralScopedMachineReads.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

const principal = (permissions: string[], ids = ["15"]): Principal => ({
  userId:"user1", login:"historian",displayName:"Historian",
  roleLabel:"Gerente", accountType:"person",isPrimaryAdmin:false,
  machineScope:"selected",machineIds:ids,permissions,
  sessionId:"sess1", workstationId:"ws1",purpose:"normal",authenticatedAt:new Date(),
});

test("HIST-04: exact ID and server-side machine scope always intersect before query", () => {
  assert.deepEqual(scopedGlobalCallDetailWhere("call15",["15"]), {
    AND: [{id:"call15"},{machineId:{in:["15"]}}],
  });
  assert.deepEqual(scopedGlobalCallDetailWhere("call11",[]), {
    AND: [{id:"call11"},{machineId:{in:[]}}],
  });
  assert.deepEqual(scopedGlobalCallDetailWhere("call15",null), {
    AND: [{id:"call15"}],
  });
  for(const bad of ["","a/b","../admin", "a".repeat(161)])
    assert.throws(()=>scopedGlobalCallDetailWhere(bad,["15"]));
  assert.equal(isScopedMachineReadRoute("GET","/api/andon-calls/history/detail/call15"),true);
  assert.equal(isScopedMachineReadRoute("HEAD","/api/andon-calls/history/detail/call15"),true);
  assert.equal(isScopedMachineReadRoute("POST","/api/andon-calls/history/detail/call15"),false);
  assert.equal(isScopedMachineReadRoute("GET","/api/andon-calls/history/detail/../../bad"),false);
});

test("HIST-04: OFF, no history grant, out-of-scope IDs never disclose records",async t=>{
  const flags={
    central:process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    history:process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED,
  };
  const originals={
    find:prisma.andonCall.findFirst,
    event:prisma.failureEvent.findMany,
    production:prisma.machineProductionEvent.findMany,
    audit:prisma.auditEvent.findMany,
    diagnosis:prisma.failureDiagnosisAudit.findMany,
    raw:prisma.$queryRaw,
  };
  let callReads=0,eventReads=0,productionReads=0,rawReads=0,auditReads=0,diagnosisReads=0;
  let where:unknown;
  let canSee=false;
  let current:unknown=null;
  prisma.andonCall.findFirst=(async(args:any)=>{callReads++;where=args.where;return current;}) as typeof originals.find;
  prisma.failureEvent.findMany=(async(args:any)=>{
    eventReads++;
    assert.deepEqual(args.where,{callId:"call15",machineId:"15"});
    return [{id:"evt1",callId:"call15",machineId:"15",startedAt:new Date("2026-11-12T12:00:00Z"),endedAt:null,
      classification:"electrical_failure",notes:"Sensor"}];
  }) as typeof originals.event;
  prisma.machineProductionEvent.findMany=(async (args: any) => {
    productionReads++;
    assert.equal(args.where.machineId,"15");
    assert.equal(args.take,1001);
    assert.deepEqual(Object.keys(args.select).sort(),
      ["id","machineId","productionMode","startedAt","endedAt"].sort());
    return [{id:"p1",machineId:"15",productionMode:"scheduled",
      startedAt:new Date("2026-11-12T11:50:00Z"),
      endedAt:new Date("2026-11-12T13:00:00Z")}];
  }) as typeof originals.production;
  prisma.auditEvent.findMany=(async(args:any)=>{
    auditReads++;
    assert.deepEqual(args.where, {resourceType:"andon_call",resourceId:"call15",machineId:"15"});
    assert.deepEqual(Object.keys(args.select).sort(), ["action","actorName","id","occurredAt","result"].sort());
    return [{ id:"a1", occurredAt:new Date("2026-11-12T12:10:00Z"),
      action:"calls.attend", result:"success", actorName:"Ana" }];
  }) as typeof originals.audit;
  prisma.failureDiagnosisAudit.findMany=(async(args:any)=>{
    diagnosisReads++;
    assert.deepEqual(args.where,{callId:"call15",machineId:"15"});
    assert(!("ipAddress" in args.select));
    return [{ id:"d1", createdAt:new Date("2026-11-12T12:15:00Z"),
      technicianName:"Ana", previousClassification:"none", newClassification:"motor",
      previousResponsibility:null,newResponsibility:null,
      previousDisposition:null,newDisposition:null }];
  }) as typeof originals.diagnosis;
  prisma.$queryRaw=(async()=>{rawReads++;return [];}) as typeof originals.raw;
  t.after(()=>{
    prisma.andonCall.findFirst=originals.find;
    prisma.failureEvent.findMany=originals.event;
    prisma.machineProductionEvent.findMany=originals.production;
    prisma.auditEvent.findMany=originals.audit;
    prisma.failureDiagnosisAudit.findMany=originals.diagnosis;
    prisma.$queryRaw=originals.raw;
    if(flags.central===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=flags.central;
    if(flags.history===undefined)delete process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED=flags.history;
  });
  const app=Fastify();
  app.addHook("preHandler",async req=>bindAuthorizedMachineReadPrincipal(req,
    principal(canSee?["andon.read","history.read","history.global.read"]:["andon.read"])));
  await registerAndonCallRoutes(app);
  t.after(()=>app.close());
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="0";
  let response=await app.inject({url:"/api/andon-calls/history/detail/call15"});
  assert.equal(response.statusCode,403,response.body);
  assert.equal(response.json().error,"global_history_disabled");
  assert.equal(callReads,0);
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="1";
  response=await app.inject({url:"/api/andon-calls/history/detail/call15"});
  assert.equal(response.statusCode,403,response.body);
  assert.equal(response.json().error,"permission_denied");
  assert.equal(callReads,0);
  canSee=true;
  response=await app.inject({url:"/api/andon-calls/history/detail/call11"});
  assert.equal(response.statusCode,404,response.body);
  assert.equal(response.json().error,"history_call_not_found");
  assert.equal(eventReads,0);
  assert.equal(productionReads,0);
  assert.equal(auditReads,0);
  assert.equal(diagnosisReads,0);
  assert.equal(rawReads,0);
  assert.deepEqual(where,{AND:[{id:"call11"},{machineId:{in:["15"]}}]});
  current={
    id:"call15",machineId:"15",machine:{id:"15",name:"Máquina 15"},
    technicianSessions:[],technicianTimeAllocations:[],impactIntervals:[],
    callReasonSnapshot:null,
    openedAt:new Date("2026-11-12T12:00:00Z"),
  };
  response=await app.inject({url:"/api/andon-calls/history/detail/call15"});
  assert.equal(response.statusCode,200,response.body);
  assert.equal(response.headers["cache-control"],"no-store");
  assert.equal(response.json().call.id,"call15");
  assert.equal(response.json().call.failureEvents.length,1);
  assert.equal(response.json().call.machineId,"15");
  assert.equal(response.json().call.auditEvents.length,1);
  assert.equal(response.json().call.auditEvents[0].action,"calls.attend");
  assert.equal(response.json().call.diagnosisAudits.length,1);
  assert.equal(response.json().call.auditTruncated,false);
  assert.equal(response.json().call.productionHistory.length,1);
  assert.equal(response.json().call.productionHistory[0].machineId,"15");
  assert.equal(response.json().call.productionHistoryTruncated,false);
  assert.equal(response.body.includes("ipAddress"),false,"no network identity in History");
  assert.equal(response.body.includes("before"),false,"no raw audit metadata in History");
  assert.deepEqual(where,{AND:[{id:"call15"},{machineId:{in:["15"]}}]});
  assert.equal(eventReads,1);
  assert.equal(productionReads,1);
  assert.equal(auditReads,1);
  assert.equal(diagnosisReads,1);
  assert.equal(rawReads,1);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  response=await app.inject({url:"/api/andon-calls/history/detail/call15"});
  assert.equal(response.statusCode,403);
  assert.equal(eventReads,1);
  assert.equal(auditReads,1);
  assert.equal(diagnosisReads,1);
});
