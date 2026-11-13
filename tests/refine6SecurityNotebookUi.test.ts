import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");

test("REFINE 16: default editor groups four modules and preserves historical custom grants", async () => {
  const [users, presets] = await Promise.all([
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/services/accessRolePresets.ts"),
  ]);
  assert.match(users, /setAdvancedPermissions\(false\);/);
  assert.match(users, /SIMPLE_MODULE_GROUPS\.map/);
  assert.match(users, /simpleModuleState\(/);
  assert.match(users, /toggleSimpleModule\(/);
  assert.match(users, /reconcileSimpleModuleRole\(/);
  assert.match(presets, /export const SIMPLE_MODULE_GROUPS/);
  assert.match(presets, /export function simpleModuleState/);
  assert.match(users, /Perfil existente \(personalizado\)/);
  assert.match(users, /advancedPermissions && <fieldset/);
  assert.match(users, /permissions: user\.permissions\.map/);
  assert.match(users, /draft,\s*\);/);
});

test("REFINE 6 notebook: only central primary Admin sees industrial service credentials", async () => {
  const [page, service, types, legacy] = await Promise.all([
    read("../src/pages/HubCentralAdminPage.tsx"),
    read("../src/components/settings/ServiceIdentitiesSettings.tsx"),
    read("../src/types/modules.ts"),
    read("../src/pages/HubAdminPage.tsx"),
  ]);
  assert.match(page, /session\.principal\.isPrimaryAdmin === true/);
  const guard = page.indexOf("if (!primaryAdmin)");
  const mounted = page.indexOf('section === "integrations" && <ServiceIdentitiesSettings />');
  assert.ok(mounted > guard);
  assert.match(types, /"integrations"/);
  assert.doesNotMatch(legacy, /<ServiceIdentitiesSettings/);
  assert.match(service, /accessRequest<Identity\[\]>\("\/service-identities"\)/);
  assert.match(service, /"POST"/);
  assert.match(service, /credentialTtlDays/);
  assert.match(service, /reauthentication_required/);
  assert.match(service, /clientSecret/);
  assert.match(service, /Confirmar revogação/);
  assert.doesNotMatch(service, /localStorage|sessionStorage|console\.log|Authorization.*Bearer/);
  assert.doesNotMatch(service, /machines\.write|calls\.write|gpio\.write/);
});

test("REFINE 6 notebook: legacy page explains why main still displays old modules", async () => {
  const legacy = await read("../src/pages/HubAdminPage.tsx");
  assert.match(legacy, /Modo de administração legado ativo/);
  assert.match(legacy, /if \(access\?\.centralAccessEnabled\) return <HubCentralAdminPage \/>/);
});


test("SEC-18B: workstation trust is not mistaken for an active persistent Person session", async () => {
  const [workstations, users] = await Promise.all([
    read("../src/components/settings/WorkstationsSettingsTab.tsx"),
    read("../src/components/settings/UsersAccessSettings.tsx"),
  ]);
  assert.match(workstations, /configurar a conta em Usuários e Acessos/);
  assert.match(workstations, /lastLogin\?\.state === "valid"/);
  assert.match(workstations, /Terminal autorizado, mas sem login persistente confirmado/);
  assert.match(users, /value=\{draft\.sessionPolicy\}/);
  assert.match(users, /Produção — não expirar em workstation confiável/);
  assert.doesNotMatch(workstations, /workstation-kiosk-trust-status/);
  assert.doesNotMatch(workstations, /Confiança Kiosk/);
});
