import {
  addOperationalDays,
  operationalDateKey,
  operationalDayStart,
  type AnalyticsFailureEventRecord,
} from "./overview.js";

export type ProductionModeInterval = {
  machineId: string;
  productionMode: string;
  startedAt: Date;
  endedAt: Date | null;
};

export type ProductionAsset = {
  machineId: string;
  exposureStartedAt: Date;
};

export type PlannedProductionInput = {
  assets: ProductionAsset[] | null;
  productionEvents: ProductionModeInterval[];
  failureEvents: AnalyticsFailureEventRecord[];
  start: Date;
  effectiveEnd: Date;
  timeZone: string;
};

type Interval = { start: number; end: number };
const MINUTE = 60_000;
const round2 = (v: number) => Math.round(v * 100) / 100;
const asInterval = (a: number,b: number): Interval => ({start:a,end:b});
function overlap(a: Interval, b: Interval) {
  return Math.max(0, Math.min(a.end,b.end)-Math.max(a.start,b.start));
}
function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter(i=>i.end>i.start).sort((a,b)=>a.start-b.start||a.end-b.end);
  const out: Interval[] = [];
  for (const x of sorted) {
    const last = out[out.length-1];
    if (!last || x.start>last.end) out.push({...x});
    else last.end=Math.max(last.end,x.end);
  }
  return out;
}
const isScheduled = (mode: string) => mode === "scheduled" || mode === "production";

function physicalIntervals(events: AnalyticsFailureEventRecord[], start: number, end: number) {
  const byMachine = new Map<string, Interval[]>();
  for (const event of events) {
    if (event.linkedCallIsSystemTest) continue;
    const a=Math.max(start,event.startedAt.getTime());
    const b=Math.min(end,event.endedAt?.getTime()??end);
    if(b<=a)continue;
    const entries=byMachine.get(event.machineId)??[];
    entries.push(asInterval(a,b));
    byMachine.set(event.machineId,entries);
  }
  return new Map([...byMachine].map(([id,items])=>[id,merge(items)]));
}

/** Only closed physical union episodes with their real end inside the window.
 * These are observed restoration durations, not technician person-time. */
export function calculateObservedRestorationMttr(
  events: AnalyticsFailureEventRecord[], start: Date, effectiveEnd: Date,
) {
  const byMachine = new Map<string,Interval[]>();
  for (const event of events) {
    if (event.linkedCallIsSystemTest) continue;
    const entries=byMachine.get(event.machineId)??[];
    entries.push(asInterval(event.startedAt.getTime(),event.endedAt?.getTime()??Infinity));
    byMachine.set(event.machineId,entries);
  }
  let total=0, episodes=0;
  for (const group of byMachine.values()) {
    for (const interval of merge(group)) {
      if (interval.end>=start.getTime() && interval.end<effectiveEnd.getTime() &&
          Number.isFinite(interval.end) && interval.end>interval.start) {
        total+=interval.end-interval.start;
        episodes++;
      }
    }
  }
  return { mttrMinutes:episodes?round2(total/MINUTE/episodes):null, resolvedEpisodes:episodes };
}

/** A schedule is eligible only when an explicit production-mode event covers
 * its entire observation interval, including the start. Gaps, overlap and
 * unknown values are not interpreted as scheduled production. */
function confirmedSchedule(events: ProductionModeInterval[], interval: Interval): Interval[] | null {
  const raw=events.filter(e=>e.startedAt.getTime()<interval.end &&
    (e.endedAt?.getTime()??Infinity)>interval.start)
    .map(e=>({start:Math.max(interval.start,e.startedAt.getTime()),
      end:Math.min(interval.end,e.endedAt?.getTime()??interval.end),mode:e.productionMode}))
    .sort((a,b)=>a.start-b.start||a.end-b.end);
  let cursor=interval.start;
  const scheduled: Interval[]=[];
  for (const event of raw) {
    if (event.end<=event.start) continue;
    if (event.start!==cursor || !["scheduled","production","not_scheduled"].includes(event.mode)) return null;
    if(isScheduled(event.mode))scheduled.push(asInterval(event.start,event.end));
    cursor=event.end;
  }
  if(cursor!==interval.end) return null;
  return scheduled;
}
function splitByLocalDay(interval: Interval, timeZone: string, callback:(date:string,ms:number)=>void) {
  let cursor=interval.start;
  for(let guard=0;cursor<interval.end && guard<100;guard++){
    const key=operationalDateKey(new Date(cursor),timeZone);
    const next=operationalDayStart(addOperationalDays(key,1),timeZone).getTime();
    if(next<=cursor)throw new Error("Limite de data operacional inválido");
    const to=Math.min(next,interval.end);
    callback(key,to-cursor);
    cursor=to;
  }
  if(cursor!==interval.end) throw new Error("Janela temporal excede limite de segurança");
}

export function buildPlannedProductionKpis(input: PlannedProductionInput) {
  const { assets, productionEvents, failureEvents, start, effectiveEnd, timeZone }=input;
  const restoration=calculateObservedRestorationMttr(failureEvents,start,effectiveEnd);
  const startMs=start.getTime(), endMs=effectiveEnd.getTime();
  const empty={
    availabilityPercent:null as number|null,
    plannedMtbfMinutes:null as number|null,
    scheduledMinutes:0, scheduledDowntimeMinutes:0, operatingMinutes:0,
    productionFailureEpisodes:0, coveredMachineCount:0, uncoveredMachineCount:assets?.length??0,
    populationCount:assets?.length??0,
    resolvedMttrMinutes:restoration.mttrMinutes,
    resolvedEpisodes:restoration.resolvedEpisodes,
    daily:[] as Array<{date:string;availabilityPercent:number|null;scheduledMinutes:number;scheduledDowntimeMinutes:number}>,
    availabilityStatus:assets===null?"dimension_filtered":"insufficient_schedule",
    methodology:{
      availability:"(Minutos programados - parada coincidente com programação) / minutos programados × 100. Apenas máquinas com histórico completo de modo de produção entram no cálculo.",
      mtbf:"Tempo programado sem parada / episódios de parada que atingem o período programado. Sem eventos de falha, MTBF indisponível.",
      mttr:"Média da duração integral de episódios físicos encerrados na janela; não é tempo médio de manutenção nem soma de horas de técnicos.",
      caveat:"Modo Produção Programada é um registro manual da máquina, não um calendário de turnos. Se não for atualizado fielmente, a disponibilidade não representa a programação real.",
    },
  };
  if (!assets || endMs<=startMs) return empty;

  const failures=physicalIntervals(failureEvents,startMs,endMs);
  const eventsByMachine = new Map<string,ProductionModeInterval[]>();
  for(const event of productionEvents) {
    const records=eventsByMachine.get(event.machineId)??[];
    records.push(event);eventsByMachine.set(event.machineId,records);
  }
  let scheduledMs=0, stoppedScheduledMs=0, episodes=0, covered=0, uncovered=0;
  const dailyMap=new Map<string,{scheduledMs:number;downtimeMs:number}>();
  const addDay=(key:string,kind:"scheduledMs"|"downtimeMs",ms:number)=>{
    const d=dailyMap.get(key)??{scheduledMs:0,downtimeMs:0};
    d[kind]+=ms;dailyMap.set(key,d);
  };
  for(const asset of assets){
    const assetStart=Math.max(startMs,asset.exposureStartedAt.getTime());
    if(assetStart>=endMs)continue;
    const scheduled=confirmedSchedule(eventsByMachine.get(asset.machineId)??[],asInterval(assetStart,endMs));
    if(!scheduled){uncovered++;continue;}
    covered++;
    const failure=failures.get(asset.machineId)??[];
    for(const segment of scheduled){
      scheduledMs+=segment.end-segment.start;
      splitByLocalDay(segment,timeZone,(date,ms)=>addDay(date,"scheduledMs",ms));
      for(const outage of failure){
        const x=overlap(segment,outage);
        if(x<=0)continue;
        stoppedScheduledMs+=x;
        splitByLocalDay(asInterval(Math.max(segment.start,outage.start),Math.min(segment.end,outage.end)),
          timeZone,(date,ms)=>addDay(date,"downtimeMs",ms));
      }
    }
    episodes+=failure.filter(outage=>scheduled.some(segment=>overlap(outage,segment)>0)).length;
  }
  const operatingMs=Math.max(0,scheduledMs-stoppedScheduledMs);
  const scheduledMinutes=round2(scheduledMs/MINUTE);
  const scheduledDowntimeMinutes=round2(stoppedScheduledMs/MINUTE);
  const availabilityPercent=scheduledMs>0?round2((operatingMs/scheduledMs)*100):null;
  const plannedMtbfMinutes=episodes>0?round2(operatingMs/MINUTE/episodes):null;
  if (covered>0) {
    let cursor=startMs;
    for(let guard=0;cursor<endMs && guard<40;guard++) {
      const key=operationalDateKey(new Date(cursor),timeZone);
      if(!dailyMap.has(key)) dailyMap.set(key,{scheduledMs:0,downtimeMs:0});
      const next=operationalDayStart(addOperationalDays(key,1),timeZone).getTime();
      if(next<=cursor)throw new Error("Calendário de produção inválido");
      cursor=next;
    }
  }
  const daily=[...dailyMap].map(([date,d])=>({
    date,scheduledMinutes:round2(d.scheduledMs/MINUTE),
    scheduledDowntimeMinutes:round2(d.downtimeMs/MINUTE),
    availabilityPercent:d.scheduledMs>0?round2((d.scheduledMs-d.downtimeMs)/d.scheduledMs*100):null,
  })).sort((a,b)=>a.date.localeCompare(b.date));
  return {
    ...empty,
    availabilityPercent,plannedMtbfMinutes,
    scheduledMinutes,scheduledDowntimeMinutes,
    operatingMinutes:round2(operatingMs/MINUTE),
    productionFailureEpisodes:episodes,
    coveredMachineCount:covered,uncoveredMachineCount:uncovered,
    availabilityStatus:scheduledMs>0?"available":covered===0?"insufficient_schedule":"no_programmed_minutes",
    daily,
  };
}
