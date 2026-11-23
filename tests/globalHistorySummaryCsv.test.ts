import assert from "node:assert/strict";
import test from "node:test";
import { buildGlobalHistoryPageCsv } from "../src/services/globalHistoryPageCsv";
import type { GlobalHistoryCallSummary } from "../src/services/globalHistoryService";
import {
  globalHistorySearchPath,
  globalHistorySummaryPath,
  globalHistoryExportPath,
} from "../src/utils/globalHistoryQuery";
import type { GlobalHistorySearchFilters } from "../src/services/globalHistoryService";

const filters: GlobalHistorySearchFilters = {
  query:"motor & sensor",machineId:"15",subtype:"electrical",status:"finished",criticality:"critical",
  technician:"Carlos",failureClassification:"failure",reasonId:"maintenance",
  origin:"real",period:"custom",sort:"updated",customDate:"2026-11-12",timeFrom:"22:00",timeBefore:"06:00",
};

test("HIST-05: aggregate reuses every filter without page limit or offset", () => {
  const page=new URL(globalHistorySearchPath(filters,25),"https://andon.test");
  const summary=new URL(globalHistorySummaryPath(filters),"https://andon.test");
  assert.equal(summary.pathname,"/api/andon-calls/history/summary");
  assert.equal(summary.searchParams.has("offset"),false);
  assert.equal(summary.searchParams.has("limit"),false);
  for(const [key,value] of page.searchParams)
    if(key!=="limit"&&key!=="offset")
      assert.equal(summary.searchParams.get(key),value,key);
});

test("HIST-05: page CSV quotes semicolons and neutralizes formulas in untrusted values", () => {
  const call={
    id:"c-1",machineId:"15",machine:{name:"=HYPERLINK(\"http://example.invalid\")"},
    workOrderNumber:" +SUM(1,1)",category:"maintenance",subtype:"electrical",
    status:"finished",criticality:"high",failureClassification:"motor;\"correia\"",
    technicianName:"@CMD",technicianNames:["-2+2"],
    isSystemTest:false,openedAt:"2026-11-12T11:00:00Z",
    finishedAt:"2026-11-12T12:00:00Z",updatedAt:"2026-11-12T12:00:00Z",
    callReasonSnapshot:null,
  } satisfies GlobalHistoryCallSummary;
  const csv=buildGlobalHistoryPageCsv([call]);
  assert(csv.includes('"\'=HYPERLINK('),"formula in machine label must be prefixed");
  assert(csv.includes('"\' +SUM('),"leading-space formula must be neutralized");
  assert(csv.includes('"\'-2+2"'),"technician formula must be neutralized");
  assert(csv.includes('"motor;\"\"correia\"\""'),"quotes and semicolons retained");
  assert(csv.split("\r\n").length===2,"one header and one permitted record");
  assert(!csv.includes("undefined"),"missing values must be blank");
  const empty=buildGlobalHistoryPageCsv([]);
  assert.equal(empty.split("\r\n").length,1,"no invented records");
});


test("HIST-12: page CSV retains historical criticality, movement and immutable reason nature", () => {
  const call = {
    id: "history_123", machineId: "37", machine: { name: "Máquina 37" },
    workOrderNumber: "OS-103", category: "maintenance", subtype: "mechanical",
    status: "finished", criticality: "critical", failureClassification: "bearing",
    technicianName: null, technicianNames: ["Ana", "Carlos"],
    isSystemTest: false,
    openedAt: "2026-11-14T10:00:00.000Z",
    finishedAt: "2026-11-14T11:00:00.000Z",
    updatedAt: "2026-11-14T12:30:00.000Z",
    callReasonSnapshot: {
      reasonId: "reason_01", reasonNameSnapshot: "Manutenção corretiva",
      optionId: "mechanical_01", optionNameSnapshot: "Mecânica",
      nature: "corrective_failure",
    },
  } satisfies GlobalHistoryCallSummary;
  const csv = buildGlobalHistoryPageCsv([call]);
  const [header, line] = csv.split("\r\n");
  assert(header.includes('"Última movimentação"'));
  assert(header.includes('"Criticidade"'));
  assert(header.includes('"Natureza do chamado"'));
  assert(line.includes('"critical"'));
  assert(line.includes('"corrective_failure"'));
  assert(line.includes('"Manutenção corretiva"'));
  assert(line.includes('"Mecânica"'));
  assert(line.includes('"Ana, Carlos"'));
  assert(line.includes('"history_123"'));
  assert.equal(line.split(";").length, header.split(";").length,
    "columns must remain aligned for a simple authorized record");
});

test("HIST-12: page CSV neutralizes formula prefixes disguised by zero-width characters", () => {
  const call = {
    id: "history_456", machineId: "37",
    machine: { name: "\u200B=HYPERLINK(\"https://invalid.example\")" },
    workOrderNumber: "\u2060@SUM(1,2)",
    category: "maintenance", subtype: "mechanical",
    status: "finished", criticality: "high",
    failureClassification: "\u202E+1+1",
    technicianName: "\r=SUM(1,2)", technicianNames: [],
    isSystemTest: false,
    openedAt: "2026-11-14T10:00:00.000Z",
    finishedAt: null, updatedAt: "2026-11-14T10:00:00.000Z",
    callReasonSnapshot: null,
  } satisfies GlobalHistoryCallSummary;
  const csv = buildGlobalHistoryPageCsv([call]);
  assert(csv.includes("\"'\u200B=HYPERLINK("));
  assert(csv.includes("\"'\u2060@SUM("));
  assert(csv.includes("\"'\u202E+1+1\""));
  assert(csv.includes("\"'\r=SUM("));
  assert(!csv.includes("undefined"));
  assert(csv.includes(";\"mechanical\";\"\";\"'\u202E+1+1\""), "legacy nature stays blank without inventing KPI classification");
});


test("HIST-13: audited export URI preserves ALL applied filters but never page offset/limit", () => {
  const url = new URL(globalHistoryExportPath(filters), "https://andon.test");
  const summary = new URL(globalHistorySummaryPath(filters), "https://andon.test");
  assert.equal(url.pathname, "/api/andon-calls/history/export");
  assert.equal(url.searchParams.has("limit"), false);
  assert.equal(url.searchParams.has("offset"), false);
  assert.equal(url.searchParams.get("machineId"), "15");
  assert.equal(url.searchParams.get("sort"), "updated");
  assert.equal(url.searchParams.get("criticality"), "critical");
  assert.equal(url.searchParams.get("reasonId"), "maintenance");
  assert.equal(url.searchParams.get("origin"), "real");
  assert.equal(url.searchParams.get("technician"), "Carlos");
  assert.equal(url.searchParams.get("timeFrom"), null, "local times are converted to ISO");
  assert.equal(url.searchParams.get("openedFrom"), summary.searchParams.get("openedFrom"));
  assert.equal(url.searchParams.get("openedBefore"), summary.searchParams.get("openedBefore"));
});

test("HIST-13: full-history CSV source and UI never silently export only the current 25 rows", async () => {
  const [page, service, csv, sqlRoute, scope, workstation] = await Promise.all([
    import("node:fs/promises").then(x => x.readFile(new URL("../src/pages/GlobalCallHistoryPage.tsx", import.meta.url), "utf8")),
    import("node:fs/promises").then(x => x.readFile(new URL("../src/services/globalHistoryService.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(x => x.readFile(new URL("../src/services/globalHistoryPageCsv.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(x => x.readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(x => x.readFile(new URL("../server/src/security/centralScopedMachineReads.ts", import.meta.url), "utf8")),
    import("node:fs/promises").then(x => x.readFile(new URL("../server/src/security/workstationAccess.ts", import.meta.url), "utf8")),
  ]);
  assert.match(page, /getAuditedGlobalHistoryExport\(requested\)/);
  assert.match(page, /machineId: machineContextLocked \? requestedMachineId : applied\.machineId/);
  assert.match(page, /payload\.total !== payload\.items\.length/);
  assert.match(page, /downloadGlobalHistoryFilteredCsv\(payload\.items\)/);
  assert.match(page, /exportInFlightRef\.current = true/);
  assert.match(service, /globalHistoryExportPath\(filters\)/);
  assert.match(csv, /saveHistoryCsv\(items, 500, "filtrado"\)/);
  assert.match(csv, /saveHistoryCsv\(items, 25, "pagina"\)/);
  assert.match(sqlRoute, /resolveSession\(tx/);
  assert.match(sqlRoute, /appendAudit\(tx/);
  assert.match(sqlRoute, /TransactionIsolationLevel\.RepeatableRead/);
  assert.match(sqlRoute, /items\.length !== total/);
  assert.match(sqlRoute, /HISTORY_EXPORT_MAX_ROWS = 500/);
  assert.match(scope, /pathname === "\/api\/andon-calls\/history\/export"/);
  assert.match(workstation, /path === "\/api\/andon-calls\/history\/export"/);
});
