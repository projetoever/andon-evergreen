import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { toggleAndonModulePermission } from "../src/services/accessRolePresets";
import { translateLabel } from "../src/i18n/translate";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("PENTE 6: login modal hides diagnostic button but preserves genuine recovery warning", async () => {
  const panel = await read("../src/components/security/HubIdentityPanel.tsx");
  assert.doesNotMatch(panel, /setShowSessionDiagnosis|Ver diagnóstico do login anterior/);
  assert.match(panel, /hadConfirmedPersistentSession/);
  assert.match(panel, /sessionLossMessage/);
  assert.match(panel, /withHubTransientRetry/);
});

test("PENTE 6: audit grants are separate from modules and export cannot outlive read", async () => {
  const [users, roles, hub, modules, api] = await Promise.all([
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/services/accessRolePresets.ts"),
    read("../src/pages/HubPage.tsx"),
    read("../server/src/routes/modules.ts"),
    read("../server/src/routes/accessAudit.ts"),
  ]);
  assert.match(users, /Auditoria e rastreabilidade/);
  assert.match(users, /\["audit.read", "audit.export"\]/);
  assert.match(users, /advancedIndependentGrants\(catalog.permissions\)\.filter/);
  assert.match(hub, /access\?\.centralAccessEnabled && access\.audit\?\.read/);
  assert.match(hub, /<HubAuditPanel/);
  assert.match(modules, /principal\.isPrimaryAdmin \|\| principal\.permissions\.includes\("audit.read"\)/);
  assert.match(api, /assertPermission\(principal, "audit.read"\)/);
  assert.match(api, /assertPermission\(principal, "audit.export"\)/);
  assert.match(api, /MAX_AUDIT_EXPORT_ROWS/);
  assert.doesNotMatch(roles.slice(roles.indexOf("const ANDON_OPERATION_GRANTS"), roles.indexOf("function ownedByGroup")), /audit\.read|audit\.export/);

  assert.deepEqual(toggleAndonModulePermission([], "audit.export", true).sort(),
    ["audit.read", "audit.export"].sort());
  assert.deepEqual(toggleAndonModulePermission(["audit.read", "audit.export"], "audit.read", false), []);
});

test("PENTE 6: navigation logs safe metadata only, with no free-text harvesting", async () => {
  const [tracker, root, shell, provider, admin] = await Promise.all([
    read("../src/components/security/UiAuditTracker.tsx"),
    read("../src/routes/__root.tsx"),
    read("../src/components/settings/AdminWorkspaceShell.tsx"),
    read("../src/context/ModuleAccessProvider.tsx"),
    read("../src/pages/HubCentralAdminPage.tsx"),
  ]);
  assert.match(root, /<UiAuditTracker \/>/);
  assert.match(tracker, /data-audit-action/);
  assert.match(tracker, /\/audit-events\/interactions/);
  assert.doesNotMatch(tracker, /textContent|innerText|input\.value|FormData|localStorage/);
  assert.match(shell, /admin\.tab\./);
  assert.match(provider, /withHubTransientRetry\(loadModuleAccess\)/);
  assert.match(admin, /sessionError === "temporarily_unavailable"/);
  assert.match(admin, /withHubTransientRetry\(\(\) => accessRequest/);
});

test("PENTE 6: audit UI translation keys resolve in three commercial languages", () => {
  for (const key of [
    "Central de auditoria", "Auditoria e rastreabilidade",
    "Abrir central de auditoria", "Auditoria: consultar registros",
    "Auditoria: exportar CSV", "Página {0} de {1}", "Data e hora",
    "Exportação de auditoria", "Este acesso é global e pode exibir operações de diferentes máquinas e usuários. Não é concedido automaticamente por perfil ou módulo.",
  ]) {
    assert.notEqual(translateLabel("en", key), key, "English: " + key);
    assert.notEqual(translateLabel("zh-TW", key), key, "Traditional Chinese: " + key);
  }
  assert.equal(translateLabel("en", "Página {0} de {1}", { 0: 2, 1: 3 }), "Page 2 of 3");
  assert.equal(translateLabel("zh-TW", "Página {0} de {1}", { 0: 2, 1: 3 }), "第 2 頁，共 3 頁");
});
