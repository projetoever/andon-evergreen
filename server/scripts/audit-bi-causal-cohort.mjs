#!/usr/bin/env node
/**
 * Read-only causal cohort audit. Uses a PostgreSQL READ ONLY transaction.
 * No default access to the industrial database: requires --ack-live-read.
 * Run from server/ after build, with DATABASE_URL in the process environment.
 * Example (isolated clone): node scripts/audit-bi-causal-cohort.mjs --machine=37 --start=2026-10-21T00:00:00-03:00 --end=2026-10-28T00:00:00-03:00
 */
import { PrismaClient } from "@prisma/client";
import { analyticsEligibility } from "../dist/analytics/eligibility.js";
import { buildBiCausalCohortAudit } from "../dist/analytics/biCausalCohortAudit.js";

function arg(name) {
  return process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const machineId=arg("machine");
const startText=arg("start");
const endText=arg("end");
const hasZone=(v)=>typeof v==="string" && /(Z|[+-]\d{2}:\d{2})$/i.test(v);
const start=hasZone(startText)?new Date(startText):null;
const end=hasZone(endText)?new Date(endText):null;
const valid=Boolean(machineId && /^[a-zA-Z0-9_-]{1,100}$/.test(machineId) &&
  start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) &&
  end>start && end-start<=31*24*60*60*1000);
if (!valid) {
  process.stderr.write("Uso: node scripts/audit-bi-causal-cohort.mjs --machine=37 --start=<ISO com fuso> --end=<ISO com fuso> [--ack-live-read]\n");
  process.exitCode=2;
} else {
  const url=new URL(process.env.DATABASE_URL??"postgres://invalid.invalid/not_configured");
  if(url.pathname!=="/andon_test" && !process.argv.includes("--ack-live-read")) {
    process.stderr.write("Fora de andon_test: requer --ack-live-read e autorização do responsável local. Nenhuma consulta realizada.\n");
    process.exitCode=2;
  } else {
    const db=new PrismaClient();
    try {
      const result=await db.$transaction(async(tx)=>{
        // Must be the FIRST statement after BEGIN; all remaining operations
        // are Prisma SELECTs in this same PostgreSQL read-only transaction.
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const machine=await tx.machine.findUnique({
          where:{id:machineId},select:{id:true,name:true,createdAt:true},
        });
        if(!machine)throw new Error("Máquina não encontrada na base selecionada");
        const catalog=await tx.failureClassification.findMany({
          select:{value:true,analyticsDisposition:true},
        });
        const policy=analyticsEligibility(catalog);
        const eventSelect={
          id:true,machineId:true,startedAt:true,endedAt:true,
          classification:true,failureResponsibility:true,analyticsDisposition:true,callId:true,
          call:{select:{isSystemTest:true}},
        };
        let raw=await tx.failureEvent.findMany({
          where:{
            ...policy.eventWhere,machineId,
            startedAt:{lt:end},
            OR:[{endedAt:null},{endedAt:{gt:start}}],
          },
          select:eventSelect,
        });
        // Match the overview's transitive restoration of preceding physically
        // touching/overlapping intervals, otherwise MTTR could be shortened.
        for(let iteration=0;raw.length;iteration++){
          const earliest=new Date(Math.min(...raw.map(e=>e.startedAt.getTime())));
          const earlier=await tx.failureEvent.findMany({
            where:{...policy.eventWhere,machineId,startedAt:{lt:earliest},
              OR:[{endedAt:null},{endedAt:{gte:earliest}}]},
            select:eventSelect,
          });
          if(!earlier.length)break;
          if(iteration>=127)throw new Error("Histórico excessivamente fragmentado");
          raw=[...new Map([...raw,...earlier].map(e=>[e.id,e])).values()];
        }
        if(raw.length>10000)throw new Error("Volume superior ao limite de auditoria; use base isolada.");
        const eventData=raw.filter(e=>e.call?.isSystemTest!==true).map(e=>({
          id:e.id,machineId:e.machineId,machineName:machine.name,
          startedAt:e.startedAt,endedAt:e.endedAt,classification:e.classification,
          failureResponsibility:e.failureResponsibility,analyticsDisposition:e.analyticsDisposition,
          callId:e.callId,linkedCallIsSystemTest:e.call?.isSystemTest===true,
        }));
        const earliest=eventData.length
          ? new Date(Math.min(start.getTime(),...eventData.map(e=>e.startedAt.getTime())))
          : start;
        const [impacts,production]=await Promise.all([
          tx.callImpactInterval.findMany({
            where:{machineId,startedAt:{lt:end},OR:[{endedAt:null},{endedAt:{gt:earliest}}],
              call:policy.callWhere},
            select:{id:true,machineId:true,startedAt:true,endedAt:true,
              call:{select:{failureResponsibility:true}}},
          }),
          tx.machineProductionEvent.findMany({
            where:{machineId,startedAt:{lt:end},OR:[{endedAt:null},{endedAt:{gt:start}}]},
            select:{machineId:true,productionMode:true,startedAt:true,endedAt:true},
          }),
        ]);
        return buildBiCausalCohortAudit({
          machineId,asset:{machineId,exposureStartedAt:machine.createdAt},
          events:eventData,productionEvents:production,
          impacts:impacts.map(i=>({
            id:i.id,machineId:i.machineId,startedAt:i.startedAt,endedAt:i.endedAt,
            failureResponsibility:i.call.failureResponsibility,
          })),
          start,effectiveEnd:end,
          timeZone:process.env.ANDON_TIME_ZONE?.trim()||"America/Sao_Paulo",
        });
      },{maxWait:5000,timeout:30000});
      process.stdout.write(JSON.stringify(result,null,2)+"\n");
    }catch(error){
      process.stderr.write("Auditoria falhou: "+(error instanceof Error?error.message:"erro desconhecido")+"\n");
      process.exitCode=1;
    }finally{
      await db.$disconnect();
    }
  }
}
