import assert from "node:assert/strict";
import test from "node:test";
import { buildGlobalHistoryPageCsv } from "../src/services/globalHistoryPageCsv";
import type { GlobalHistoryCallSummary } from "../src/services/globalHistoryService";
import {
  globalHistorySearchPath,
  globalHistorySummaryPath,
} from "../src/utils/globalHistoryQuery";
import type { GlobalHistorySearchFilters } from "../src/services/globalHistoryService";

const filters: GlobalHistorySearchFilters = {
  query:"motor & sensor",machineId:"15",subtype:"electrical",status:"finished",
  technician:"Carlos",failureClassification:"failure",reasonId:"maintenance",
  origin:"real",period:"custom",customDate:"2026-11-12",timeFrom:"22:00",timeBefore:"06:00",
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
