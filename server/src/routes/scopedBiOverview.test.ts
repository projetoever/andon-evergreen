import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const principal = (scope: "all" | "selected", ids: string[]): Principal => ({
  userId:"bi-overview-user",login:"manager",displayName:"Manager",roleLabel:"Gestor",
  accountType:"person",isPrimaryAdmin:false,machineScope:scope,machineIds:ids,
  permissions:["bi.read"],sessionId:"overview-session",
  workstationId:"ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose:"normal",authenticatedAt:new Date(),
});
const url=(suffix="")=>"/api/analytics/overview?startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00"+suffix;

test("B2.4C: overview and previous-period cohorts obey one authenticated machine scope",async(t)=>{
  const before=process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const original={
    catalog:prisma.failureClassification.findMany,
    calls:prisma.andonCall.findMany,
    callCount:prisma.andonCall.count,
    events:prisma.failureEvent.findMany,
    impacts:prisma.callImpactInterval.findMany,
    machines:prisma.machine.findMany,
    production:prisma.machineProductionEvent.findMany,
    transaction:prisma.$transaction,
  };
  const queries:{calls:unknown[];counts:unknown[];events:unknown[];impacts:unknown[];machines:unknown[];production:unknown[]}={
    calls:[],counts:[],events:[],impacts:[],machines:[],production:[],
  };
  let catalogReads=0, bind=true;
  let scope: "all" | "selected"="selected";
  let ids=["37"];
  let eventsFixture=false;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  prisma.failureClassification.findMany=(async()=>{
    catalogReads++;
    return [];
  }) as unknown as typeof original.catalog;
  prisma.andonCall.findMany=(async(q:unknown)=>{queries.calls.push(q);return []}) as unknown as typeof original.calls;
  prisma.andonCall.count=(async(q:unknown)=>{queries.counts.push(q);return 0}) as unknown as typeof original.callCount;
  prisma.machine.findMany=(async(q:unknown)=>{
    queries.machines.push(q);
    return eventsFixture?[{id:"37",createdAt:new Date("2026-09-01T00:00:00Z")}]:[];
  }) as unknown as typeof original.machines;
  prisma.failureEvent.findMany=(async(q:unknown)=>{
    queries.events.push(q);
    const where=(q as any).where;
    // Expansion query must not replay the initial event indefinitely.
    if(!eventsFixture || where.OR.some((item: any)=>Object.hasOwn(item,"machineId")))return [];
    return [{
      id:"event-37",machineId:"37",
      startedAt:new Date("2026-10-01T15:00:00Z"),
      endedAt:new Date("2026-10-01T16:00:00Z"),
      classification:"mechanical",failureResponsibility:"maintenance",
      analyticsDisposition:"include",
      callId:"call-38-secret",
      machine:{name:"Máquina 37"},
      call:{machineId:"38",subtype:"mechanical",isSystemTest:false},
    }];
  }) as unknown as typeof original.events;
  prisma.callImpactInterval.findMany=(async(q:unknown)=>{
    queries.impacts.push(q);
    return [];
  }) as unknown as typeof original.impacts;
  prisma.machineProductionEvent.findMany=(async(q:unknown)=>{
    queries.production.push(q);
    return [{machineId:"37",productionMode:"scheduled",
      startedAt:new Date("2026-10-01T03:00:00Z"),
      endedAt:new Date("2026-10-02T03:00:00Z")}];
  }) as unknown as typeof original.production;
  prisma.$transaction=(async(args:unknown)=>{
    if(!Array.isArray(args))throw Error("Only array transaction expected");
    return Promise.all(args);
  }) as unknown as typeof original.transaction;
  const app=Fastify();
  app.addHook("preHandler",async(request)=>{
    if(bind)bindAuthorizedMachineReadPrincipal(request,principal(scope,ids));
  });
  await registerAnalyticsRoutes(app);
  t.after(async()=>{
    await app.close();
    prisma.failureClassification.findMany=original.catalog;
    prisma.andonCall.findMany=original.calls;
    prisma.andonCall.count=original.callCount;
    prisma.machine.findMany=original.machines;
    prisma.failureEvent.findMany=original.events;
    prisma.callImpactInterval.findMany=original.impacts;
    prisma.machineProductionEvent.findMany=original.production;
    prisma.$transaction=original.transaction;
    if(before===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=before;
  });
  const denied=await app.inject({url:url("&machineId=38")});
  assert.equal(denied.statusCode,404,denied.body);
  assert.equal(catalogReads,0,"deny foreign machine before catalog or data read");
  assert.deepEqual(queries.calls,[]);
  const deniedHead=await app.inject({method:"HEAD",url:url("&machineId=38")});
  assert.equal(deniedHead.statusCode,404);
  assert.equal(catalogReads,0);

  const allowed=await app.inject({url:url()});
  assert.equal(allowed.statusCode,200,allowed.body);
  assert.equal(allowed.json().kpis.callsOpened,0);
  assert.equal(queries.calls.length,2,"current and previous period");
  assert.equal(queries.counts.length,5,"one scoped active-call snapshot plus both eligibility populations in current and previous periods");
  assert.equal(queries.machines.length,2);
  assert.equal(queries.events.length,2);
  for(const q of queries.calls)assert.deepEqual((q as any).where.machineId,{in:["37"]});
  for(const q of queries.counts)assert.deepEqual((q as any).where.machineId,{in:["37"]});
  for(const q of queries.events) {
    const where=(q as any).where;
    assert.deepEqual(where.machineId,{in:["37"]});
    // The second branch MUST ignore all foreign-call attributes except
    // machineId itself; physical-event snapshots decide eligibility.
    const foreignBranch=where.AND[0].OR[1];
    assert.deepEqual(foreignBranch.AND[1].call.is.machineId,{notIn:["37"]});
    assert.doesNotMatch(JSON.stringify(foreignBranch.AND[0]), /"call"/);
    assert.match(JSON.stringify(foreignBranch.AND[0]), /"analyticsDisposition"/);
  }
  for(const q of queries.machines)assert.deepEqual((q as any).where.id,{in:["37"]});

  eventsFixture=true;
  const linked=await app.inject({url:url("&machineId=37")});
  assert.equal(linked.statusCode,200,linked.body);
  assert.equal(linked.json().kpis.downtimeMinutes,60,"physical event stays in scope");
  assert(!linked.body.includes("call-38-secret"),"foreign-machine call ID is not disclosed");
  assert.deepEqual((queries.impacts.at(-1) as any).where.call.machineId,{in:["37"]});
  assert.equal(queries.production.at(-1) && (queries.production.at(-1) as any).where.machineId.in[0],"37");
  const foreignSector = await app.inject({url:url("&machineId=37&subtype=mechanical")});
  assert.equal(foreignSector.statusCode,200,foreignSector.body);
  assert.equal(foreignSector.json().kpis.downtimeMinutes,0,
    "linked call on machine 38 must not assign sector mechanical to machine 37 event");
  eventsFixture=false;

  ids=[];
  const empty=await app.inject({url:url()});
  assert.equal(empty.statusCode,200,empty.body);
  assert.equal(empty.json().kpis.callsOpened,0);
  assert.deepEqual((queries.calls.at(-1) as any).where.machineId,{in:[]});

  scope="all";
  const global=await app.inject({url:url()});
  assert.equal(global.statusCode,200,global.body);
  assert.equal(Object.hasOwn((queries.calls.at(-1) as any).where,"machineId"),false);

  bind=false;
  const noBinding=await app.inject({url:url()});
  assert.equal(noBinding.statusCode,403,noBinding.body);
  assert.equal(noBinding.json().statusCode,403);
  assert(!noBinding.body.includes("37"));

  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  const legacy=await app.inject({url:url()});
  assert.equal(legacy.statusCode,200,legacy.body);
  assert.equal(Object.hasOwn((queries.calls.at(-1) as any).where,"machineId"),false);
});
