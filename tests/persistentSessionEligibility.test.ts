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
