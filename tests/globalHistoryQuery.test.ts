import assert from "node:assert/strict";
import test from "node:test";
import {
  dateRangeForGlobalHistory,
  globalHistorySearchPath,
} from "../src/utils/globalHistoryQuery";
import type { GlobalHistorySearchFilters } from "../src/services/globalHistoryService";

const filters = (patch: Partial<GlobalHistorySearchFilters> = {}): GlobalHistorySearchFilters =>
  ({ query:"", machineId:"all", subtype:"", status:"all", criticality:"all", technician:"",
    failureClassification:"", reasonId:"", origin:"all", period:"30d", customDate:"",
    ...patch });

test("HIST-03: query encodes machine, classification, text and all current filter families", () => {
  const url = globalHistorySearchPath(filters({
    query: "OS 22 & motor", machineId: "15", status: "finished",
    criticality: "high", subtype: "electrical", technician: "João Silva",
    failureClassification: "mechanical_failure", reasonId: "maintenance",
    origin: "real", period: "all",
  }), 25);
  const parsed = new URL(url, "https://andon.test");
  assert.equal(parsed.pathname, "/api/andon-calls/history/search");
  assert.equal(parsed.searchParams.get("query"), "OS 22 & motor");
  assert.equal(parsed.searchParams.get("machineId"), "15");
  assert.equal(parsed.searchParams.get("status"), "finished");
  assert.equal(parsed.searchParams.get("criticality"), "high");
  assert.equal(parsed.searchParams.get("subtype"), "electrical");
  assert.equal(parsed.searchParams.get("technician"), "João Silva");
  assert.equal(parsed.searchParams.get("failureClassification"), "mechanical_failure");
  assert.equal(parsed.searchParams.get("reasonId"), "maintenance");
  assert.equal(parsed.searchParams.get("origin"), "real");
  assert.equal(parsed.searchParams.get("offset"), "25");
  assert.equal(parsed.searchParams.get("limit"), "25");
});

test("HIST-03: all machines/period does not send fake server scope", () => {
  const p = new URL(globalHistorySearchPath(filters({ period: "all" })), "https://andon.test").searchParams;
  for (const key of ["machineId", "status", "criticality", "origin", "openedFrom", "openedBefore"]) {
    assert.equal(p.has(key), false, key);
  }
});

test("HIST-03: custom period uses LOCAL full-day boundaries before ISO serialization", () => {
  const range = dateRangeForGlobalHistory("custom", "2026-11-12");
  assert.equal(range.openedFrom, new Date(2026, 10, 12).toISOString());
  assert.equal(range.openedBefore, new Date(2026, 10, 13).toISOString());
  for (const bad of ["", "2026-02-30", "2026-11-31", "12/11/2026"]) {
    assert.throws(() => dateRangeForGlobalHistory("custom", bad), /Selecione uma data válida/);
  }
});

test("HIST-03: today/7d/30d include correct local calendar days, not sliding hours", () => {
  const now = new Date(2026, 10, 12, 18, 35, 0);
  const today = dateRangeForGlobalHistory("today", "", now);
  const week = dateRangeForGlobalHistory("7d", "", now);
  const month = dateRangeForGlobalHistory("30d", "", now);
  assert.equal(today.openedFrom, new Date(2026, 10, 12).toISOString());
  assert.equal(week.openedFrom, new Date(2026, 10, 6).toISOString());
  assert.equal(month.openedFrom, new Date(2026, 9, 14).toISOString());
  assert.equal(today.openedBefore, new Date(2026, 10, 13).toISOString());
  assert.equal(week.openedBefore, today.openedBefore);
  assert.equal(month.openedBefore, today.openedBefore);
});


test("HIST-07: custom date filters exact local working-hour bounds", () => {
  const selected = filters({ period:"custom", customDate:"2026-11-12", timeFrom:"08:15", timeBefore:"16:45" });
  const p = new URL(globalHistorySearchPath(selected), "https://andon.test").searchParams;
  assert.equal(p.get("openedFrom"), new Date(2026, 10, 12, 8, 15).toISOString());
  assert.equal(p.get("openedBefore"), new Date(2026, 10, 12, 16, 45).toISOString());
});

test("HIST-07: overnight shift extends to the NEXT calendar day in local time", () => {
  const range = dateRangeForGlobalHistory("custom", "2026-11-12", new Date(), "22:00", "06:00");
  assert.equal(range.openedFrom, new Date(2026, 10, 12, 22).toISOString());
  assert.equal(range.openedBefore, new Date(2026, 10, 13, 6).toISOString());
  const earlyOnly = dateRangeForGlobalHistory("custom", "2026-11-12", new Date(), "", "06:00");
  assert.equal(earlyOnly.openedFrom, new Date(2026, 10, 12).toISOString());
  assert.equal(earlyOnly.openedBefore, new Date(2026, 10, 12, 6).toISOString());
});

test("HIST-07: invalid clocks and zero-length ranges reject before querying API", () => {
  for (const bad of ["25:00", "08:60", "8:00", "23:59:00"]) {
    assert.throws(() => dateRangeForGlobalHistory("custom", "2026-11-12", new Date(), bad, ""), /horário válido/);
  }
  assert.throws(() => dateRangeForGlobalHistory("custom", "2026-11-12", new Date(), "08:00", "08:00"), /diferentes/);
  const now = new Date(2026, 10, 12, 12);
  const baseline = dateRangeForGlobalHistory("30d", "", now);
  const timeIgnored = dateRangeForGlobalHistory("30d", "", now, "22:00", "06:00");
  assert.deepEqual(timeIgnored, baseline, "clock limits are applied only with a selected date");
});
