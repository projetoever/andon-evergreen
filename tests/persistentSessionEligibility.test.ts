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
  assert.match(server, /row\.persistentOperational \? "selected" : row\.user\.machineScope/);
  assert.match(server, /row\.persistentMachineId!/);
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
