import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");

test("SEC-21: session duration never overwrites the selected profile grants", async () => {
  const [editor, access, server] = await Promise.all([
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/services/accessService.ts"),
    read("../server/src/access/sessions.ts"),
  ]);
  assert.match(editor, /value=\{draft\.sessionPolicy\}/);
  assert.match(editor, /<option value="daily">/);
  assert.match(editor, /<option value="persistent">/);
  assert.doesNotMatch(editor, /Usar permissões de Produção 24h/);
  assert.doesNotMatch(editor, /suggestedPersistentProductionGrants|persistentSessionIncompatibleGrants/);
  assert.match(access, /"standard" \| "daily" \| "persistent"/);
  assert.match(server, /permissions: row\.user\.permissions\.map\(\(x\) => x\.key\)/);
  assert.doesNotMatch(server, /TRUSTED_OPERATIONAL_GRANTS/);
  assert.match(server, /machineScope: row\.user\.machineScope/);
  assert.match(server, /machineIds: row\.user\.machines\.map/);
});


test("SEC21 P0: login and Hub must reveal whether the server really issued permanent login", async () => {
  const [sessions, route, modules, identity, provider, gate, status, service] = await Promise.all([
    read("../server/src/access/sessions.ts"),
    read("../server/src/routes/access.ts"),
    read("../server/src/routes/modules.ts"),
    read("../src/components/security/HubIdentityPanel.tsx"),
    read("../src/context/ModuleAccessProvider.tsx"),
    read("../src/components/security/WorkstationAccessGate.tsx"),
    read("../src/services/persistentSessionStatus.ts"),
    read("../src/services/accessService.ts"),
  ]);
  assert.match(sessions, /persistentOperationalBlocker\(/);
  assert.match(sessions, /persistenceBlocker: effective\.sessionPolicy === "persistent"/);
  assert.match(sessions, /requestedPolicy: effective\.sessionPolicy/);
  assert.match(route, /persistenceBlocker: session\.persistenceBlocker \?\? null/);
  assert.match(route, /sessionPolicy: session\.sessionPolicy \?\? "standard"/);
  assert.match(route, /session\.persistentOperational \? 34560000/);
  assert.match(modules, /persistentOperational: principal\.persistentOperational === true/);
  assert.match(modules, /sessionPolicy: principal\.sessionPolicy \?\? "standard"/);
  assert.match(service, /persistentOperational\?: boolean/);
  assert.match(identity, /toast\.error\(ui\(PERSISTENCE_NOT_ACTIVE\)/);
  assert.match(identity, /persistentBlockerMessage\(result\.persistenceBlocker\)/);
  assert.match(provider, /persistentSessionMismatch\(principal\)/);
  assert.match(provider, /warnedNonPersistent\.current !== warningKey/);
  assert.match(gate, /returnToHub = decision === "denied"/);
  assert.match(gate, /if \(decision === "error"\)/);
  assert.match(gate, /<section role="status"/);
  assert.doesNotMatch(gate, /returnToHub = decision === "denied" \|\| decision === "error"/);
  assert.match(provider, /window\.setInterval\(\(\) => void refresh\(\), 5_000\)/);
  assert.match(provider, /window\.addEventListener\("online", onOnline\)/);
  assert.doesNotMatch(status, /cookie:|passwordHash|setItem|localStorage|sessionStorage/);
});


test("REFINE23: persistent trusted login survives Firefox close and workstation reboot without storing passwords", async () => {
  const [http, routes, sessions, identity, runtime, provider] = await Promise.all([
    read("../server/src/access/http.ts"),
    read("../server/src/routes/access.ts"),
    read("../server/src/access/sessions.ts"),
    read("../src/services/workstationIdentityService.ts"),
    read("../installer/AndonInstaller.Runtime.ps1"),
    read("../src/context/ModuleAccessProvider.tsx"),
  ]);
  // This is a *persistent secure browser cookie*, not a tab/session cookie.
  assert.match(routes, /session\.persistentOperational \? 34560000/);
  assert.match(routes, /principal\?\.persistentOperational && token/);
  assert.match(routes, /setCookie\(reply, ACCESS_COOKIE, token, 34560000\)/);
  assert.match(routes, /HttpOnly; Secure; SameSite=Strict; Max-Age=\$\{maxAge\}/);
  assert.match(http, /__Host-andon-access/);
  assert.match(sessions, /expiresAt: persistentOperational \? new Date\("9999-12-31T00:00:00\.000Z"\)/);
  assert.match(sessions, /row\.persistentOperational &&/);
  assert.doesNotMatch(sessions, /row\.persistentMachineId !== row\.workstation\.lockedMachineId/);
  assert.match(sessions, /persistentMachineId: null/);
  assert.match(sessions, /row\.authorizationVersion !== row\.user\.authorizationVersion/);

  // Browser restart must reuse the same machine ID using a cookie and localStorage.
  assert.match(identity, /WORKSTATION_COOKIE_MAX_AGE_SECONDS = 60 \* 60 \* 24 \* 365 \* 5/);
  assert.match(identity, /window\.localStorage\.getItem\(key\)/);
  assert.match(identity, /Path=\/; Max-Age=\$\{WORKSTATION_COOKIE_MAX_AGE_SECONDS\}; SameSite=Lax/);
  assert.match(identity, /hasWorkstationIdentityConflict\(\)/);
  // Service recovery after reboot is independent of the browser session.
  assert.match(runtime, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(runtime, /New-ScheduledTaskPrincipal/);
  assert.match(runtime, /Start-AndonRuntime/);
  // A user can choose private browsing / clear cookies; never invent an automatic
  // login from a workstation UUID alone when the secure cookie was deleted.
  assert.doesNotMatch(provider, /localStorage\.setItem\([^)]*(?:token|password|session)/);
});

test("SEC21 workstation login: no concurrent POSTs or premature credential reset", async () => {
  const identity = await read("../src/components/security/HubIdentityPanel.tsx");
  const run = identity.split("const run = async (")[1]?.split("const authenticate =")[0] ?? "";
  const authenticate = identity.split("const authenticate =")[1]?.split("const changePassword =")[0] ?? "";
  assert.match(identity, /useRef\(false\)/);
  assert.match(run, /if \(actionInFlight\.current\) return/);
  assert.match(run, /actionInFlight\.current = true/);
  assert.match(run, /actionInFlight\.current = false/);
  assert.match(authenticate, /const form = event\.currentTarget/);
  assert.match(authenticate, /await accessRequest<\{/);
  assert.match(authenticate, /\}\>\("\/login", "POST", \{ login, password \}\)/);
  assert.match(authenticate, /form\.reset\(\)/);
  assert.doesNotMatch(authenticate, /event\.currentTarget\.reset\(\)/);
  assert.ok(authenticate.indexOf('form.reset()') > authenticate.indexOf('"/login", "POST"'),
    "The server must authenticate before the form is cleared");
});

test("P0 permanent login requires no pinned machine and is never implicitly revoked by another login", async () => {
  const [sessions, workstations, hints, api] = await Promise.all([
    read("../server/src/access/sessions.ts"),
    read("../src/components/settings/WorkstationsSettingsTab.tsx"),
    read("../src/services/persistentSessionStatus.ts"),
    read("../server/src/routes/access.ts"),
  ]);
  assert.doesNotMatch(sessions, /machine_not_pinned|machine_scope_mismatch/);
  assert.doesNotMatch(sessions, /userId: \{ not: effective\.id \}/);
  assert.doesNotMatch(sessions, /row\.persistentMachineId !== row\.workstation\.lockedMachineId/);
  assert.doesNotMatch(api, /throw new AccessError\("machine_screen_required", 409\)/);
  assert.doesNotMatch(hints, /Fixe a máquina|máquina fixada/);
  assert.doesNotMatch(workstations, /!workstation\.lockedMachineId &&\s*!workstation\.allowPersistentOperationalLogin/);
  assert.match(sessions, /machineScope: row\.user\.machineScope/);
  assert.match(sessions, /machineIds: row\.user\.machines\.map/);
});
