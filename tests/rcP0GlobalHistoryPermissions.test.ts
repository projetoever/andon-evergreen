import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isPermission, assertPermission, type Principal } from "../server/src/access/policy";
import {
  SIMPLE_MODULE_GROUPS, simpleModuleGrants, toggleSimpleModule, simpleModuleState,
} from "../src/services/accessRolePresets";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const subject = (permissions: string[]): Principal => ({
  userId: "u1", login: "operator", displayName: "Operator",
  roleLabel: "Manutenção", accountType: "person", purpose: "normal",
  isPrimaryAdmin: false, machineScope: "selected", machineIds: ["38"],
  permissions, sessionId: "s1", workstationId: "ws38", authenticatedAt: new Date(),
});

test("RC02: fifth Global History module is a real server-known grant, not a UI bypass", () => {
  assert.equal(isPermission("history.global.read"), true);
  assert.deepEqual(SIMPLE_MODULE_GROUPS.map(x => x.label), [
    "ANDON", "BI", "Prioridades", "Config. do ANDON", "Histórico Global",
  ]);
  const catalog = ["andon.read", "history.read", "history.global.read", "calls.open", "bi.read"];
  assert.deepEqual(simpleModuleGrants("globalHistory", "Produção", catalog), ["history.global.read"]);
  const limited = toggleSimpleModule([], "globalHistory", "Produção", catalog, true);
  assert.deepEqual(new Set(limited), new Set(["andon.read", "history.read", "history.global.read"]));
  assert.equal(simpleModuleState(limited, "globalHistory", "Produção", catalog), "on");
  assert.throws(() => assertPermission(subject(["andon.read", "history.read"]), "history.global.read"),
    /permission_denied/);
  assert.doesNotThrow(() => assertPermission(subject(limited), "history.global.read"));
  assert.throws(() => assertPermission(subject(limited), "history.global.read", "39"),
    /machine_scope_denied/);
});

test("RC02: navigation and every Global History API route require dedicated grant", async () => {
  const [card, module, scope, preHandler, exportRoute, policy] = await Promise.all([
    read("../src/components/layout/ModuleCards.tsx"),
    read("../server/src/security/globalHistoryModuleAccess.ts"),
    read("../server/src/security/centralScopedMachineReads.ts"),
    read("../server/src/security/workstationAccess.ts"),
    read("../server/src/routes/andonCalls.ts"),
    read("../server/src/access/policy.ts"),
  ]);
  assert.match(card, /access\.globalHistory\.allowed === true/);
  assert.match(module, /assertPermission\(principal, "history.global.read"\)/);
  assert.match(scope, /assertPermission\(principal, "history.global.read"\)/);
  assert.match(preHandler, /assertPermission\(principal, "history.global.read"\)/);
  assert.match(exportRoute, /assertPermission\(current, "history.global.read"\)/);
  assert.match(policy, /"history.global.read"/);
  assert.match(scope, /principal\.machineScope === "all" \? null : principal\.machineIds/);
});

test("RC02: installer enables History only in explicit central HTTPS security profile", async () => {
  const installer = await read("../installer/AndonInstaller.Common.ps1");
  const flagBlock = installer.slice(
    installer.indexOf("$securityWriteFlags = @("),
    installer.indexOf("$hierarchicalCallOpening = if ("),
  );
  assert.match(flagBlock, /"ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED"/);
  assert.match(installer, /\$validationEnabled -and \(/);
  assert.match(installer, /\$centralAccessEnabled -ne "1"/);
  assert.match(installer, /transportMode/);
  assert.match(installer, /\$securityWriteFlags \| ForEach-Object/);
  assert.match(installer, /if \(\$validationEnabled\) \{ '1' \} else \{ '0' \}/);
});

test("RC02: admin UI must not silently assign History from a role or operational module", async () => {
  const [users, presets, serverUser] = await Promise.all([
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/services/accessRolePresets.ts"),
    read("../server/src/access/users.ts"),
  ]);
  assert.match(users, /SIMPLE_MODULE_GROUPS\.map/);
  assert.match(users, /advancedModuleGrants\(entry\.id, catalog\.permissions\)/);
  assert.match(presets, /\{ id: "globalHistory", label: "Histórico Global" \}/);
  assert.match(presets, /const GLOBAL_HISTORY_GRANTS = \["history.global.read"\]/);
  assert.doesNotMatch(presets.split("const ANDON_OPERATION_GRANTS = [")[1].split("] as const")[0],
    /history\.global\.read/);
  assert.match(serverUser, /input\.permissions\.some\(\(p\) => !isPermission\(p\)\)/);
  assert.match(serverUser, /authorizationVersion: \{ increment: 1 \}/);
  assert.match(serverUser, /revokedAt: new Date\(\)/);
});
