import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  compareWorkstationsForDisplay, workstationPresenceRank,
} from "../src/services/workstationDisplayOrder";

const station = (
  id: string,
  opts: {
    name?: string; active?: boolean; pendingApproval?: boolean;
    presence?: "online" | "offline" | "unknown"; heartbeat?: string | null;
  } = {},
) => ({
  id,
  name: opts.name ?? id,
  active: opts.active ?? true,
  pendingApproval: opts.pendingApproval ?? false,
  presence: opts.presence ?? "unknown",
  lastHeartbeatAt: opts.heartbeat ?? null,
});

test("REFINE16: online first, then active, pending and blocked regardless of own device or IP", () => {
  const all = [
    station("blocked", { active: false }),
    station("pending", { active: false, pendingApproval: true }),
    station("active-unknown"),
    station("online-new", { presence: "online", heartbeat: "2026-11-12T20:00:00Z" }),
    station("online-old", { presence: "online", heartbeat: "2026-11-12T19:00:00Z" }),
    station("active-offline", { presence: "offline", heartbeat: "2026-11-12T18:00:00Z" }),
    station("stale-ip", { active: false, presence: "online" }),
  ];
  const snapshot = [...all];
  const sorted = [...all].sort((a, b) => compareWorkstationsForDisplay(a, b, true));
  assert.deepEqual(sorted.map(s => s.id),
    ["online-new", "online-old", "active-offline", "active-unknown",
      "pending", "blocked", "stale-ip"]);
  assert.deepEqual(all, snapshot, "sorting must not mutate source data, identity or approval");
  assert.equal(workstationPresenceRank(station("pending-online", {
    active: true, pendingApproval: true, presence: "online",
  }), true), 2, "pending station must not receive online placement");
});

test("REFINE16: invalid/missing heartbeat does not create online status or unstable ties", () => {
  const sorted = [
    station("z", { name: "Terminal", heartbeat: "n/a" }),
    station("a", { name: "Terminal" }),
    station("m", { name: "Alfa" }),
  ].sort((a, b) => compareWorkstationsForDisplay(a, b, true));
  assert.deepEqual(sorted.map(s => s.id), ["m", "a", "z"]);
  const oldLegacy = [
    station("blocked", { active: false }), station("online", { presence: "online" }),
    station("pending", { pendingApproval: true }),
  ].sort((a, b) => compareWorkstationsForDisplay(a, b, false));
  assert.deepEqual(oldLegacy.map(s => s.id), ["pending", "online", "blocked"]);
});

test("REFINE16: visual badge distinguishes online without relying only on color", async () => {
  const source = await readFile(
    new URL("../src/components/settings/WorkstationsSettingsTab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /compareWorkstationsForDisplay\(a, b, centralAccess\)/);
  assert.match(source, /border-success\/60 bg-success\/5 ring-1 ring-success\/20/);
  assert.match(source, /<Radio aria-hidden="true"/);
  assert.match(source, /Online — heartbeat recente/);
  assert.match(source, /Offline — sem presença válida/);
  assert.match(source, /Presença ainda desconhecida/);
  assert.match(source, /workstation\.active && !workstation\.pendingApproval/);
  assert.doesNotMatch(source, /if \(a\.id === currentWorkstationId\) return -1/,
    "current station may not outrank verified online presence");
});
