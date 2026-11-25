import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MAX_DASHBOARD_CARDS, splitMachinesByProductionPriority,
} from "../src/utils/dashboardPriorityUtils";
import {
  buildPrioritySnapshot, diffPrioritySnapshots,
} from "../server/src/domain/machinePriorityHistory";
import { canShowPriorityMachineHistory } from "../src/utils/priorityHistoryVisibility";
import type { ModuleAccess } from "../src/types/modules";

const machine = (n: number) => ({
  id: String(n), displayOrder: n, priorityOrder: n,
  isActive: true, machineStatus: "running" as const,
  andonStatus: "none" as const, currentCallId: null,
  productionMode: "scheduled" as const,
});
const all = Array.from({length: 23}, (_, i) => machine(i + 1));
const byId = new Map(all.map(m => [m.id, m]));
const ids = all.map(m => m.id);

test("PENTE2: P1..Pn snapshots include only active machines and audit count changes", () => {
  const current = buildPrioritySnapshot(ids, byId, 5);
  const one = buildPrioritySnapshot(ids, byId, 1);
  const twenty = buildPrioritySnapshot(ids, byId, 20);
  assert.equal(current.priorityRankById.size, 5);
  assert.equal(one.priorityRankById.size, 1);
  assert.equal(twenty.priorityRankById.size, 20);
  assert.equal(twenty.priorityRankById.get("20"), 20);
  assert.equal(twenty.priorityRankById.get("21"), undefined);
  const changes = diffPrioritySnapshots(ids, current, twenty);
  assert.equal(changes.length, 15);
  assert.equal(changes[0].machineId, "6");
  assert.equal(changes[0].previousPriorityRank, null);
  assert.equal(changes[0].newPriorityRank, 6);
  const inactive = new Map(byId);
  inactive.set("2", {...machine(2), isActive: false});
  const snapshot = buildPrioritySnapshot(ids, inactive, 3);
  assert.deepEqual([...snapshot.priorityRankById.entries()], [["1",1],["3",2],["4",3]]);
});

test("PENTE2: ranked machines remain contiguous across paginated Dashboard cards", () => {
  for (const count of [1, 5, 8, 14, 15, 20, 23]) {
    const pages = splitMachinesByProductionPriority(all, [], MAX_DASHBOARD_CARDS, count);
    const flattened = pages.flat();
    assert.equal(flattened.length, all.length);
    assert.equal(new Set(flattened.map(m => m.id)).size, all.length);
    assert.deepEqual(flattened.slice(0, count).map(m => m.id), ids.slice(0, count));
    for (const page of pages) assert.ok(page.length <= MAX_DASHBOARD_CARDS);
  }
  const alerted = all.map(m => m.id === "23" ? {...m, machineStatus: "stopped" as const} : m);
  const pageFive = splitMachinesByProductionPriority(alerted, [], 14, 5);
  assert.ok(pageFive[0].some(m => m.id === "23"),
    "the legacy P1-P5 mode must retain operational urgency for free page slots");
  const pageTwenty = splitMachinesByProductionPriority(alerted, [], 14, 20);
  assert.ok(pageTwenty[1].some(m => m.id === "23"),
    "operationally urgent unranked machines must fill free slots after ranked machines");
  const sample = splitMachinesByProductionPriority(all, [], 14, 20);
  assert.equal(sample[0].length, 14);
  assert.deepEqual(sample[1].slice(0, 6).map(m => m.id), ids.slice(14, 20));
});

const access = (scope: "all"|"selected", machineIds: string[], granted: boolean): ModuleAccess => ({
  centralAccessEnabled: true,
  globalHistory: {available: true, allowed: granted},
  principal: {
    userId: "u", login: "reader", displayName: "Reader", roleLabel: "Manager",
    purpose: "normal", machineScope: scope, machineIds,
  },
} as ModuleAccess);

test("PENTE2: history button only appears after Admin-issued server grant AND machine scope", () => {
  assert.equal(canShowPriorityMachineHistory(access("all", [], true), "37"), true);
  assert.equal(canShowPriorityMachineHistory(access("all", [], false), "37"), false);
  assert.equal(canShowPriorityMachineHistory(access("selected", ["37"], true), "37"), true);
  assert.equal(canShowPriorityMachineHistory(access("selected", ["38"], true), "37"), false);
  assert.equal(canShowPriorityMachineHistory(null, "37"), false);
  const disabled = access("all", [], true);
  disabled.globalHistory = {available:false,allowed:true};
  assert.equal(canShowPriorityMachineHistory(disabled, "37"), false);
  const noSession = access("all", [], true);
  noSession.principal = null;
  assert.equal(canShowPriorityMachineHistory(noSession, "37"), false);
});

test("PENTE2: existing central PUT remains the only priority-count writer with locks and CAS", async () => {
  const paths = [
    "../server/src/access/centralPriorityOrderWrite.ts",
    "../server/src/routes/dashboardPriority.ts",
    "../src/pages/DashboardPriorityPage.tsx",
    "../src/components/machines/MachineGrid.tsx",
    "../src/pages/DashboardPage.tsx",
    "../server/prisma/migrations/20261125173000_priority_highlight_count/migration.sql",
  ];
  const [central, routes, page, grid, dashboard, migration] = await Promise.all(paths.map(path =>
    readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(central, /assertPermission\(principal, "priorities\.write"\)/);
  assert.match(central, /assertFullMachineScope\(principal\)/);
  assert.match(central, /lockMachinePriorityFlow\(tx\)/);
  assert.match(central, /priority_highlight_changed/);
  assert.match(central, /priority_highlight_count_out_of_range/);
  assert.match(central, /priorityHighlightCount: nextHighlightCount/);
  assert.match(routes, /priorityHighlightCount: config\?\.priorityHighlightCount \?\? 5/);
  assert.match(page, /canShowPriorityMachineHistory\(access, row\.id\)/);
  assert.match(page, /hasUnsavedChanges/);
  assert.match(grid, /highlightIndividualPriority=\{priorityRanks\.size > 5\}/);
  assert.match(dashboard, /priorityHighlightCount=\{priorityHighlightCount\}/);
  assert.match(migration, /ADD COLUMN "priorityHighlightCount" INTEGER NOT NULL DEFAULT 5/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
