import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const URL = "/api/analytics/failure-intelligence?startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00";
const principal = (scope: "selected" | "all", machines: string[]): Principal => ({
  userId:"bi-recurring",login:"manager",displayName:"Manager",roleLabel:"Gestor",
  accountType:"person",isPrimaryAdmin:false,machineScope:scope,machineIds:machines,
  permissions:["bi.read"],sessionId:"bi-recurring-session",
  workstationId:"ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose:"normal",authenticatedAt:new Date(),
});
const call = (id: string, machineId: string, openedAt: string, finishedAt: string, workOrderNumber: string) => ({
  id,machineId,machine:{name:"Máquina "+machineId},subtype:"mechanical",
  openedAt:new Date(openedAt),finishedAt:new Date(finishedAt),status:"finished",
  failureClassification:"motor",failureResponsibility:"maintenance",
  analyticsDisposition:"include",failureDescription:"Diagnóstico "+machineId,
  workOrderNumber,maintenanceReturnCount:0,isSystemTest:false,
  confirmedMachineSetId:null,confirmedMachineSetNameSnapshot:null,
  confirmedMachineSubsetId:null,confirmedMachineSubsetNameSnapshot:null,
  machineSetId:null,machineSetNameSnapshot:null,machineSubsetId:null,machineSubsetNameSnapshot:null,
});
test("B2.4C/3: failure recurrence history never exposes other machines or cross-machine denominators",async(t)=>{
  const before=process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const originalCatalog=prisma.failureClassification.findMany;
  const originalCalls=prisma.andonCall.findMany;
  const calls=[
    call("old37","37","2026-09-30T19:00:00Z","2026-09-30T20:00:00Z","OS37-OLD"),
    call("new37","37","2026-10-01T12:00:00Z","2026-10-01T15:00:00Z","OS37-CURRENT"),
    call("secret38","38","2026-10-01T12:00:00Z","2026-10-01T15:00:00Z","OS38-SECRET"),
  ];
  let catalogReads=0,bind=true;
  let scope: "selected" | "all"="selected";
  let machines=["37"];
  const queries:any[]=[];
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  prisma.failureClassification.findMany=(async()=>{catalogReads++;return []}) as unknown as typeof originalCatalog;
  prisma.andonCall.findMany=(async(query:any)=>{
    queries.push(query);
    const requested=query.where.machineId;
    return calls.filter(item=>requested===undefined ||
      (typeof requested==="string" ? requested===item.machineId : requested.in.includes(item.machineId)));
  }) as unknown as typeof originalCalls;
  const app=Fastify();
  app.addHook("preHandler",async(req)=>{
    if(bind)bindAuthorizedMachineReadPrincipal(req,principal(scope,machines));
  });
  await registerAnalyticsRoutes(app);
  t.after(async()=>{
    await app.close();
    prisma.failureClassification.findMany=originalCatalog;
    prisma.andonCall.findMany=originalCalls;
    if(before===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=before;
  });

  const denied=await app.inject({url:URL+"&machineId=38"});
  assert.equal(denied.statusCode,404,denied.body);
  assert.equal(catalogReads,0);
  assert.equal(queries.length,0);
  const deniedHead=await app.inject({method:"HEAD",url:URL+"&machineId=38"});
  assert.equal(deniedHead.statusCode,404);
  assert.equal(catalogReads,0);

  const allowed=await app.inject({url:URL});
  assert.equal(allowed.statusCode,200,allowed.body);
  assert.deepEqual(queries.at(-1).where.machineId,{in:["37"]});
  assert.equal(allowed.json().totals.diagnosedFinishedCalls,1);
  assert.equal(allowed.json().totals.repeated24h,1,
    "30-day preceding history on the authorized machine remains available");
  assert.equal(allowed.json().coverage.includedHistoryCalls,2);
  assert(!allowed.body.includes("OS38-SECRET"));
  assert(!allowed.body.includes("secret38"));
  assert(!allowed.body.includes("Máquina 38"));

  const explicit=await app.inject({url:URL+"&machineId=37"});
  assert.equal(explicit.statusCode,200,explicit.body);
  assert.equal(queries.at(-1).where.machineId,"37");

  machines=[];
  const none=await app.inject({url:URL});
  assert.equal(none.statusCode,200,none.body);
  assert.equal(none.json().totals.diagnosedFinishedCalls,0);
  assert.deepEqual(queries.at(-1).where.machineId,{in:[]});

  scope="all";
  const global=await app.inject({url:URL});
  assert.equal(global.statusCode,200,global.body);
  assert.equal(global.json().totals.diagnosedFinishedCalls,2);
  assert.equal(Object.hasOwn(queries.at(-1).where,"machineId"),false);

  bind=false;
  const unbound=await app.inject({url:URL});
  assert.equal(unbound.statusCode,403,unbound.body);
  assert.equal(queries.length,4,"unbound request cannot read historical calls");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  const legacy=await app.inject({url:URL});
  assert.equal(legacy.statusCode,200,legacy.body);
  assert.equal(legacy.json().totals.diagnosedFinishedCalls,2);
  assert.equal(Object.hasOwn(queries.at(-1).where,"machineId"),false);
});
