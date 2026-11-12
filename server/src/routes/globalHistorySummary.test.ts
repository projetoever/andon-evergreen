import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { summarizeScopedGlobalHistory } from "../services/globalCallHistorySummary.js";
import {
  isScopedMachineReadRoute,
  bindAuthorizedMachineReadPrincipal,
} from "../security/centralScopedMachineReads.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

const person = (permissions: string[], machineIds = ["15"]): Principal => ({
  userId:"u",login:"manager",displayName:"Manager",roleLabel:"Gerente",
  accountType:"person",isPrimaryAdmin:false,machineScope:"selected",machineIds,
  permissions,sessionId:"s",workstationId:"ws",purpose:"normal",authenticatedAt:new Date(),
});

test("HIST-05: grouping counts whole filtered result with distinct real/system origin", () => {
  const result=summarizeScopedGlobalHistory([
    {status:"finished",category:"maintenance",isSystemTest:false,_count:{_all:12}},
    {status:"finished",category:"maintenance",isSystemTest:true,_count:{_all:2}},
    {status:"cancelled",category:"production",isSystemTest:false,_count:{_all:3}},
  ]);
  assert.equal(result.total,17);
  assert.deepEqual(result.byOrigin,{real:15,system:2});
  assert.deepEqual(result.byStatus,[
    {status:"finished",count:14},
    {status:"cancelled",count:3},
  ]);
  assert.deepEqual(result.byCategory,[
    {category:"maintenance",count:14},
    {category:"production",count:3},
  ]);
  assert.deepEqual(summarizeScopedGlobalHistory([]),{
    total:0,byStatus:[],byCategory:[],byOrigin:{real:0,system:0},
  });
  assert.throws(()=>summarizeScopedGlobalHistory([
    {status:"finished",category:"maintenance",isSystemTest:false,_count:{_all:-1}},
  ]));
});

test("HIST-05: summary route requires flag, history.read and SQL machineScope", async t => {
  const old={
    central:process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    history:process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED,
    groupBy:prisma.andonCall.groupBy,
  };
  let groups=0;
  let lastWhere: unknown;
  prisma.andonCall.groupBy=(async(args: any)=>{
    groups++;
    lastWhere=args.where;
    assert.deepEqual(args.by,["status","category","isSystemTest"]);
    assert.deepEqual(args._count,{_all:true});
    return [
      {status:"finished",category:"maintenance",isSystemTest:false,_count:{_all:3}},
    ];
  }) as typeof old.groupBy;
  t.after(()=>{
    prisma.andonCall.groupBy=old.groupBy;
    if(old.central===undefined)delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=old.central;
    if(old.history===undefined)delete process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED=old.history;
  });
  const app=Fastify();
  let grants=["andon.read","history.read"];
  app.addHook("preHandler",async request=>{
    bindAuthorizedMachineReadPrincipal(request,person(grants));
  });
  await registerAndonCallRoutes(app);
  t.after(()=>app.close());
  assert.equal(isScopedMachineReadRoute("GET","/api/andon-calls/history/summary"),true);
  assert.equal(isScopedMachineReadRoute("HEAD","/api/andon-calls/history/summary"),true);
  assert.equal(isScopedMachineReadRoute("POST","/api/andon-calls/history/summary"),false);
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="1";
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="0";
  let response=await app.inject({url:"/api/andon-calls/history/summary"});
  assert.equal(response.statusCode,403,response.body);
  assert.equal(groups,0);
  process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED="1";
  grants=["andon.read"];
  response=await app.inject({url:"/api/andon-calls/history/summary"});
  assert.equal(response.statusCode,403,response.body);
  assert.equal(groups,0);
  grants=["andon.read","history.read"];
  response=await app.inject({
    url:"/api/andon-calls/history/summary?machineId=11&status=finished&origin=real",
  });
  assert.equal(response.statusCode,200,response.body);
  assert.equal(response.headers["cache-control"],"no-store");
  assert.equal(response.json().total,3);
  assert.deepEqual(response.json().byOrigin,{real:3,system:0});
  assert.deepEqual((lastWhere as any).AND,[
    {machineId:"11"},{machineId:{in:["15"]}},
  ]);
  assert.equal((lastWhere as any).status,"finished");
  assert.equal((lastWhere as any).isSystemTest,false);
  response=await app.inject({url:"/api/andon-calls/history/summary?status=unknown"});
  assert.equal(response.statusCode,400);
  assert.equal(groups,1,"invalid filter must not execute database aggregation");
  process.env.ANDON_CENTRAL_ACCESS_ENABLED="0";
  response=await app.inject({url:"/api/andon-calls/history/summary"});
  assert.equal(response.statusCode,403);
  assert.equal(groups,1);
});
