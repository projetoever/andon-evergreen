import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canOpenPinnedMachineHistory } from "../src/services/lockedMachineHistoryPolicy.ts";
import type { ModuleAccess } from "../src/types/modules.ts";

const base = {
  centralAccessEnabled: true,
  workstation: {
    id: "ws37", name: "Máquina 37", active: true,
    allowOperational: true, allowBi: false, allowPriorities: false,
    lockedMachineId: "37",
  },
  principal: {
    userId: "prod", login: "produ", displayName: "Produção", roleLabel: "Produção",
    purpose: "normal", canReadMachineHistory: true,
    machineScope: "selected", machineIds: ["37"],
  },
  globalHistory: { available: true, allowed: true },
  hubEnabled: true,
  modules: [],
} satisfies ModuleAccess;

test("HIST-14 P0: machine-pinned production can enter only its own history with server-granted history.read", () => {
  assert.equal(canOpenPinnedMachineHistory(base, "/machines/37/call-history"), true);
  assert.equal(canOpenPinnedMachineHistory(base, "/machines/37/failure-history"), true);
  assert.equal(canOpenPinnedMachineHistory(base, "/history"), true);
  for (const path of [
    "/machines/38/call-history", "/machines/38/failure-history",
    "/andon", "/machines/38", "/machines/37/settings",
    "/machines/37/production", "/unknown",
  ]) assert.equal(canOpenPinnedMachineHistory(base, path), false, path);
  assert.equal(canOpenPinnedMachineHistory({ ...base, principal: {
    ...base.principal, canReadMachineHistory: false,
  } }, "/machines/37/call-history"), false);
  assert.equal(canOpenPinnedMachineHistory({ ...base, principal: null }, "/history"), false);
  assert.equal(canOpenPinnedMachineHistory({ ...base, centralAccessEnabled: undefined }, "/machines/37/call-history"), false);
  assert.equal(canOpenPinnedMachineHistory(null, "/history"), false);
});

test("HIST-14: global History still requires backend-enabled flag and explicit grant", () => {
  for (const globalHistory of [
    { available: false, allowed: true }, { available: true, allowed: false },
    { available: false, allowed: false },
  ]) {
    assert.equal(canOpenPinnedMachineHistory({ ...base, globalHistory }, "/history"), false);
    assert.equal(canOpenPinnedMachineHistory({ ...base, globalHistory }, "/machines/37/call-history"), true,
      "machine history does not require global-history deployment opt-in");
  }
  assert.equal(canOpenPinnedMachineHistory({
    ...base, centralAccessEnabled: false,
  }, "/machines/37/call-history"), true, "legacy confirmed mode remains supported");
  assert.equal(canOpenPinnedMachineHistory({
    ...base, centralAccessEnabled: false,
  }, "/history"), false, "do not bypass central global-history server authorization");
  assert.equal(canOpenPinnedMachineHistory({
    ...base, workstation: { ...base.workstation, lockedMachineId: null },
  }, "/machines/37/call-history"), false);
});

test("HIST-14: route, header and server grants agree; pin cannot be bypassed by a deep link", async () => {
  const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../server/src/routes/modules.ts", import.meta.url), "utf8");
  const scope = await readFile(new URL("../server/src/security/centralScopedMachineReads.ts", import.meta.url), "utf8");
  const header = await readFile(new URL("../src/components/machines/MachineDetailHeader.tsx", import.meta.url), "utf8");
  const machine = await readFile(new URL("../src/pages/MachineDetailPage.tsx", import.meta.url), "utf8");
  assert.match(root, /!canOpenPinnedMachineHistory\(access, pathname\)/);
  assert.match(root, /pathname !== `\/machines\/\$\{encodeURIComponent\(lockedMachineId\)\}`/);
  assert.match(root, /navigate\(\{\s*to: "\/machines\/\$machineId"/);
  assert.match(route, /assertPermission\(principal!, "history\.read", workstation\.lockedMachineId/);
  assert.match(route, /assertPermission\(principal!, "andon\.read", workstation\.lockedMachineId/);
  assert.match(scope, /assertPermission\(principal, "history\.read"\)/);
  assert.match(scope, /return principal\.machineScope === "all" \? null : principal\.machineIds/);
  assert.match(header, /\{historyAllowed && <Link/);
  assert.match(header, /to="\/machines\/\$machineId\/call-history"/);
  assert.match(machine, /access\?\.principal\?\.canReadMachineHistory === true/);
});
