import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const URL = "/api/analytics/reliability?startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00";
const principal = (scope: "all" | "selected", ids: string[]): Principal => ({
  userId: "reliability-user", login: "bi.manager", displayName: "Manager",
  roleLabel: "Gestor", accountType: "person", isPrimaryAdmin: false,
  machineScope: scope, machineIds: ids, permissions: ["bi.read"],
  sessionId: "session-reliability",
  workstationId: "ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose: "normal", authenticatedAt: new Date(),
});

test("B2.4C/4a: reliability applies server scope to every SQL population and redacts foreign linked calls", async (t) => {
  const before = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const originals = {
    catalog: prisma.failureClassification.findMany,
    machines: prisma.machine.findMany,
    calls: prisma.andonCall.findMany,
    count: prisma.andonCall.count,
    events: prisma.failureEvent.findMany,
    sessions: prisma.technicianSession.findMany,
  };
  const q = {machines: [] as any[], calls: [] as any[], counts: [] as any[],
    events: [] as any[], sessions: [] as any[]};
  let catalogReads=0, bind=true;
  let scope: "all" | "selected"="selected";
  let ids=["37"];
  const allMachines=["37","38"].map(id=>({
    id, name: "Máquina "+id, isActive: true, createdAt: new Date("2026-09-01T00:00:00Z"),
  }));
  const foreignLinkedEvent = {
    id:"event-37-cross", machineId:"37",
    startedAt:new Date("2026-10-01T12:00:00Z"),
    endedAt:new Date("2026-10-01T13:00:00Z"),
    classification:"mechanical",failureResponsibility:"maintenance",analyticsDisposition:"include",
    callId:"call-38-secret",
    call:{machineId:"38",isSystemTest:true,subtype:"secret-sector"},
  };
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  prisma.failureClassification.findMany=(async()=>{catalogReads++;return []}) as unknown as typeof originals.catalog;
  prisma.machine.findMany=(async(query:unknown)=>{
    q.machines.push(query);
    const where=(query as any).where;
    return allMachines.filter(machine=>
      (!where.id || (typeof where.id==="string" ? where.id===machine.id : where.id.in.includes(machine.id)))
    );
  }) as unknown as typeof originals.machines;
  prisma.andonCall.findMany=(async(query:unknown)=>{q.calls.push(query);return []}) as unknown as typeof originals.calls;
  prisma.andonCall.count=(async(query:unknown)=>{q.counts.push(query);return 0}) as unknown as typeof originals.count;
  prisma.failureEvent.findMany=(async(query:unknown)=>{
    q.events.push(query);
    const where=(query as any).where;
    const allowed=where.machineId===undefined || (typeof where.machineId==="string"
      ? where.machineId==="37" : where.machineId.in.includes("37"));
    return where.endedAt===null || !allowed ? [] : [foreignLinkedEvent];
  }) as unknown as typeof originals.events;
  prisma.technicianSession.findMany=(async(query:unknown)=>{q.sessions.push(query);return []}) as unknown as typeof originals.sessions;
  const app=Fastify();
  app.addHook("preHandler",async(req)=>{
    if(bind)bindAuthorizedMachineReadPrincipal(req,principal(scope,ids));
  });
  await registerAnalyticsRoutes(app);
  t.after(async()=>{
    await app.close();
    prisma.failureClassification.findMany=originals.catalog;
    prisma.machine.findMany=originals.machines;
    prisma.andonCall.findMany=originals.calls;
    prisma.andonCall.count=originals.count;
    prisma.failureEvent.findMany=originals.events;
    prisma.technicianSession.findMany=originals.sessions;
    if(before===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=before;
  });

  const denied=await app.inject({url:URL+"&machineId=38"});
  assert.equal(denied.statusCode,404,denied.body);
  const deniedHead=await app.inject({method:"HEAD",url:URL+"&machineId=38"});
  assert.equal(deniedHead.statusCode,404);
  assert.equal(catalogReads,0);
  for(const queries of Object.values(q))assert.equal(queries.length,0);

  const selected=await app.inject({url:URL+"&includeInactive=true"});
  assert.equal(selected.statusCode,200,selected.body);
  assert.deepEqual(selected.json().assets.map((a:{machineId:string})=>a.machineId),["37"]);
  assert.equal(selected.json().assets[0].downtimeMinutes,60,
    "authorized physical event survives even if linked foreign call is a test");
  assert.equal(selected.json().dataHealth.standaloneFailureEvents,1,
    "foreign linked call ID is not exposed or used for statistics");
  assert(!selected.body.includes("call-38-secret"));
  assert(!selected.body.includes("secret-sector"));
  assert.equal(q.calls.length,2);
  assert.equal(q.counts.length,1);
  assert.equal(q.events.length,2);
  assert.equal(q.sessions.length,1);
  assert.deepEqual(q.machines[0].where.id,{in:["37"]});
  for(const query of q.calls)assert.deepEqual(query.where.machineId,{in:["37"]});
  assert.deepEqual(q.counts[0].where.machineId,{in:["37"]});
  for(const query of q.events){
    assert.deepEqual(query.where.machineId,{in:["37"]});
    assert.deepEqual(query.where.AND[0].OR[1].AND[1].call.is.machineId,{notIn:["37"]});
    assert.doesNotMatch(JSON.stringify(query.where.AND[0].OR[1].AND[0]),/"call"/);
  }
  assert.deepEqual(q.sessions[0].where.machineId,{in:["37"]});
  assert.deepEqual(q.sessions[0].where.call.machineId,{in:["37"]});

  const selectedSector=await app.inject({url:URL+"&subtype=secret-sector"});
  assert.equal(selectedSector.statusCode,200,selectedSector.body);
  assert.equal(selectedSector.json().assets[0].downtimeMinutes,0,
    "foreign call subtype cannot label an authorized physical event");
  assert.deepEqual(q.events.at(-1).where.call.is.machineId,{in:["37"]});

  ids=[];
  const empty=await app.inject({url:URL});
  assert.equal(empty.statusCode,200,empty.body);
  assert.deepEqual(empty.json().assets,[]);
  assert.deepEqual(q.machines.at(-1).where.id,{in:[]});
  assert.deepEqual(q.events.at(-1).where.machineId,{in:[]});

  scope="all";
  const full=await app.inject({url:URL});
  assert.equal(full.statusCode,200,full.body);
  assert.equal(full.json().assets.length,2);
  assert.equal(Object.hasOwn(q.calls.at(-1).where,"machineId"),false);

  bind=false;
  const noBinding=await app.inject({url:URL});
  assert.equal(noBinding.statusCode,403,noBinding.body);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  const legacy=await app.inject({url:URL});
  assert.equal(legacy.statusCode,200,legacy.body);
  assert.equal(legacy.json().assets.length,2);
});
