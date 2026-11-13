import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("REFINE20: advanced editor stays compact without role-suggested override", async () => {
  const editor = await readFile(new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /Aplicar permissões sugeridas/);
  assert.doesNotMatch(editor, /hasRoleSuggestion\(draft\.roleLabel\)/);
  assert.doesNotMatch(editor, /permissions:\s*suggestedPermissions\(/);
  assert.match(editor, /Permissões por módulo e ação/);
  assert.match(editor, /advancedModuleGrants\(entry\.id, catalog\.permissions\)/);
});

test("REFINE20: PIN is not a replacement for history correction authorization", async () => {
  const [labels, guard, domain] = await Promise.all([
    readFile(new URL("../src/services/accessLabels.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/centralDiagnosisEdit.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/centralDiagnosisEditHttp.ts", import.meta.url), "utf8"),
  ]);
  assert.match(labels, /Histórico: corrigir diagnóstico finalizado \(PIN obrigatório\)/);
  assert.match(guard, /assertPermission\(latest, "diagnosis\.edit", reference\.machineId\)/);
  assert.match(guard, /identifyTechnician\(\{ method: "pin"/);
  assert.match(domain, /assertPermission\(principal, "diagnosis\.edit"\)/);
});
