import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const PERIOD="startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00";
const CATEGORIES=["active-calls","open-events","active-sessions","unclassified-calls","unlinked-events"] as const;
const url=(category:string,suffix="")=>
  `/api/analytics/data-quality-details?${PERIOD}&category=${category}${suffix}`;
const principal=(scope:"selected"|"all",ids:string[]):Principal=>({
  userId:"quality-manager",login:"quality.user",displayName:"Manager",roleLabel:"Gestor",
  accountType:"person",isPrimaryAdmin:false,machineScope:scope,machineIds:ids,
  permissions:["bi.read","history.read"],sessionId:"quality-session",
  workstationId:"ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose:"normal",authenticatedAt:new Date(),
});

test("B2.4C/4c: every data-quality detail query is machine scoped before pagination and redacts foreign linked IDs",async(t)=>{
  const oldFlag=process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const orig={
    catalog:prisma.failureClassification.findMany,
    callCount:prisma.andonCall.count,
    callRows:prisma.andonCall.findMany,
    eventCount:prisma.failureEvent.count,
    eventRows:prisma.failureEvent.findMany,
    sessionCount:prisma.technicianSession.count,
    sessionRows:prisma.technicianSession.findMany,
  };
  const q={
    call:[] as any[], event:[] as any[], session:[] as any[],
  };
  let catalogReads=0;
  let scope:"selected"|"all"="selected";
  let ids=["37"],bind=true;
  const accepted=(where:any,id:string)=> !where ||
    (typeof where==="string" ? where===id : where.in.includes(id));
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  prisma.failureClassification.findMany=(async()=>{catalogReads++;return []}) as unknown as typeof orig.catalog;
  prisma.andonCall.count=(async(query:unknown)=>{q.call.push(query);return 0}) as unknown as typeof orig.callCount;
  prisma.andonCall.findMany=(async(query:unknown)=>{q.call.push(query);return []}) as unknown as typeof orig.callRows;
  prisma.failureEvent.count=(async(query:unknown)=>{
    q.event.push(query);
    const where=(query as any).where;
    return where.callId===null?0:(accepted(where.machineId,"37")?1:0);
  }) as unknown as typeof orig.eventCount;
  prisma.failureEvent.findMany=(async(query:unknown)=>{
    q.event.push(query);
    if((query as any).where.callId===null ||
      !accepted((query as any).where.machineId,"37"))return [];
    return [{
      id:"event-37",
      machineId:"37",
      machine:{name:"Máquina 37",isActive:true},
      callId:"call-38-secret",
      call:{machineId:"38"},
      startedAt:new Date("2026-10-01T13:00:00Z"),
      endedAt:null,
      classification:"mechanical",
      notes:"Falha física na Máquina 37",
    }];
  }) as unknown as typeof orig.eventRows;
  prisma.technicianSession.count=(async(query:unknown)=>{q.session.push(query);return 0}) as unknown as typeof orig.sessionCount;
  prisma.technicianSession.findMany=(async(query:unknown)=>{q.session.push(query);return []}) as unknown as typeof orig.sessionRows;
  const app=Fastify();
  app.addHook("preHandler",async req=>{
    if(bind)bindAuthorizedMachineReadPrincipal(req,principal(scope,ids));
  });
  await registerAnalyticsRoutes(app);
  t.after(async()=>{
    await app.close();
    prisma.failureClassification.findMany=orig.catalog;
    prisma.andonCall.count=orig.callCount;
    prisma.andonCall.findMany=orig.callRows;
    prisma.failureEvent.count=orig.eventCount;
    prisma.failureEvent.findMany=orig.eventRows;
    prisma.technicianSession.count=orig.sessionCount;
    prisma.technicianSession.findMany=orig.sessionRows;
    if(oldFlag===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=oldFlag;
  });

  for(const category of CATEGORIES){
    const reads=catalogReads;
    const denied=await app.inject({url:url(category,"&machineId=38")});
    assert.equal(denied.statusCode,404,`${category}: ${denied.body}`);
    assert.equal(catalogReads,reads,"no catalog access for forbidden machine");
  }
  assert.equal(q.call.length+q.event.length+q.session.length,0);
  assert.equal((await app.inject({method:"HEAD",url:url("active-sessions","&machineId=38")})).statusCode,404);

  for(const category of CATEGORIES){
    const response=await app.inject({url:url(category)});
    assert.equal(response.statusCode,200,`${category}: ${response.body}`);
    assert.equal(response.json().meta.category,category);
    assert.equal(response.json().pageSize,6);
  }
  assert.equal(q.call.length,4,"two call detail categories, count and rows");
  assert.equal(q.event.length,4,"two event detail categories, count and rows");
  assert.equal(q.session.length,2,"active sessions count and rows");
  for(const query of q.call)assert.deepEqual(query.where.machineId,{in:["37"]});
  for(const query of q.event){
    assert.deepEqual(query.where.machineId,{in:["37"]});
    assert.deepEqual(query.where.AND[0].OR[1].AND[1].call.is.machineId,{notIn:["37"]});
  }
  for(const query of q.session){
    assert.deepEqual(query.where.machineId,{in:["37"]});
    assert.deepEqual(query.where.call.machineId,{in:["37"]});
  }
  const open=await app.inject({url:url("open-events")});
  assert.equal(open.statusCode,200,open.body);
  assert.equal(open.json().total,1);
  assert.equal(open.json().items[0].callId,null,"foreign linked call is redacted");
  assert.equal(open.json().items[0].description,"Falha física na Máquina 37");
  assert(!open.body.includes("call-38-secret"));

  const beforeScopedCalls=q.call.length;
  ids=[];
  for(const category of CATEGORIES){
    const result=await app.inject({url:url(category)});
    assert.equal(result.statusCode,200,result.body);
    assert.deepEqual(result.json().items,[]);
  }
  for(const query of q.call.slice(beforeScopedCalls)) {
    assert.deepEqual(query.where.machineId,{in:[]});
  }
  assert.deepEqual(q.event.at(-1).where.machineId,{in:[]});
  assert.deepEqual(q.session.at(-1).where.call.machineId,{in:[]});

  scope="all";
  const global=await app.inject({url:url("active-calls")});
  assert.equal(global.statusCode,200,global.body);
  assert.equal(Object.hasOwn(q.call.at(-1).where,"machineId"),false);

  bind=false;
  const beforeUnbound=catalogReads;
  const unbound=await app.inject({url:url("open-events")});
  assert.equal(unbound.statusCode,403,unbound.body);
  assert.equal(catalogReads,beforeUnbound,"no catalog reads without central binding");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  const legacy=await app.inject({url:url("active-calls")});
  assert.equal(legacy.statusCode,200,legacy.body);
  assert.equal(Object.hasOwn(q.call.at(-1).where,"machineId"),false);
});
