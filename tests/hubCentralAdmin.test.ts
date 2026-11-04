import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");

test("Hub central Admin uses server-verified primary Admin, not legacy local token or role label", async () => {
  const [page, entry, hub] = await Promise.all([
    read("../src/pages/HubCentralAdminPage.tsx"),
    read("../src/pages/HubAdminPage.tsx"),
    read("../src/pages/HubPage.tsx"),
  ]);
  assert.match(page, /accessRequest<AccessState>\("\/session"\)/);
  assert.match(page, /session\.principal\.isPrimaryAdmin === true/);
  assert.match(page, /session\?\.principal\?\.purpose === "normal"/);
  assert.match(page, /Acesso administrativo restrito/);
  assert.doesNotMatch(page, /isAdminAuthenticated/);
  assert.doesNotMatch(page, /AdminLoginModal/);
  assert.match(entry, /if \(access\?\.centralAccessEnabled\) return <HubCentralAdminPage \/>/);
  assert.match(hub, /if \(access\?\.centralAccessEnabled\)/);
  assert.match(page, /accessRequest\("\/logout", "POST", \{\}\)/);
});
test("Central Admin exposes only already centrally authorized tabs; sensitive legacy settings stay hidden", async () => {
  const page = await read("../src/pages/HubCentralAdminPage.tsx");
  assert.match(page, /<UsersAccessSettings \/>/);
  assert.match(page, /<WorkstationsSettingsTab \/>/);
  assert.match(page, /<ServiceIdentitiesSettings \/>/);
  assert.match(page, /<HubBuildVersionCard \/>/);
  assert.match(page, /accessRequest<ManagedWorkstation\[\]>\("\/workstations"\)/);
  assert.doesNotMatch(page, /<HubSecuritySettings \/>/);
  assert.doesNotMatch(page, /<ModuleCredentialSettings \/>/);
  assert.match(page, /!\["overview","users","workstations","andon","integrations"\]\.includes\(section\)/);
  assert.match(page, /Configuração indisponível na administração central/);
});

test("Dashboard uses central session and never renders the legacy admin login in central mode", async () => {
  const page = await read("../src/pages/DashboardPage.tsx");
  const hub = await read("../src/pages/HubCentralAdminPage.tsx");
  const route = await read("../src/routes/hub.admin.tsx");
  const types = await read("../src/types/modules.ts");
  assert.match(page, /if \(access\.centralAccessEnabled\) \{/);
  assert.match(page, /navigate\(\{ to: "\/hub\/admin", search: \{ section: "andon" \} \}\)/);
  assert.match(page, /access && !access\.centralAccessEnabled && \(/);
  assert.match(page, /if \(!access\) \{/);
  assert.match(hub, /section === "andon" && \(/);
  assert.match(hub, /<GeneralSettingsTab \/>/);
  assert.match(hub, /<AttendanceModeSettingsTab \/>/);
  assert.match(hub, /session\.principal\.isPrimaryAdmin === true/);
  assert.doesNotMatch(hub, /<AdminLoginModal|<AdminSettingsModal|<SoundsSettingsTab|<TechniciansSettingsTab/);
  assert.match(route, /HUB_ADMIN_SECTIONS\.includes/);
  assert.match(types, /"andon"/);
});

test("central global rules do not consult legacy Priority passwords and cannot expose global sound settings", async () => {
  const general = await read("../src/components/settings/GeneralSettingsTab.tsx");
  const central = await read("../src/pages/HubCentralAdminPage.tsx");
  assert.match(general, /if \(centralMode\) \{/);
  assert.match(general, /setPriorityConfigured\(priorityModuleAllowed\)/);
  assert.match(central, /Sons, cadastros e credenciais mantêm controles separados/);
  assert.doesNotMatch(central, /<DashboardSoundMuteSettings|<SoundsSettingsTab/);
});

test("Central Admin first-run is an isolated bootstrap form, not a privilege bypass", async () => {
  const [page, users, entry] = await Promise.all([
    read("../src/pages/HubCentralAdminPage.tsx"),
    read("../src/components/settings/UsersAccessSettings.tsx"),
    read("../src/pages/HubAdminPage.tsx"),
  ]);
  const firstRun = page.indexOf('if (session && !session.initialized)');
  const privilegeGate = page.indexOf('if (!primaryAdmin)');
  assert.ok(firstRun > 0 && privilegeGate > firstRun);
  const firstRunBlock = page.slice(firstRun, privilegeGate);
  assert.match(firstRunBlock, /access\?\.workstation\.active/);
  assert.match(firstRunBlock, /access\.workstation\.pendingApproval/);
  assert.match(firstRunBlock, /<UsersAccessSettings onSessionInitialized=/);
  assert.doesNotMatch(firstRunBlock, /<WorkstationsSettingsTab|<GeneralSettingsTab|<AppearanceSettingsPreview|<CentralOverview/);
  assert.match(users, /await accessRequest\("\/initialize", "POST"/);
  assert.match(users, /if \(!session\?\.initialized\) await onSessionInitialized\?\.\(\)/);
  assert.match(entry, /if \(access\?\.centralAccessEnabled\) return <HubCentralAdminPage \/>/);
});

test("Hub mandatory personal-password change follows the same 8-to-128 character policy as the backend", async () => {
  const [panel, backend] = await Promise.all([
    read("../src/components/security/HubIdentityPanel.tsx"),
    read("../server/src/access/credentials.ts"),
  ]);
  assert.match(backend, /MIN_PERSONAL_PASSWORD_LENGTH = 8/);
  assert.match(backend, /MAX_PERSONAL_PASSWORD_LENGTH = 128/);
  assert.match(panel, /Use uma senha de 8 a 128 caracteres/);
  assert.equal((panel.match(/minLength=\{8\}/g) ?? []).length, 2);
  assert.equal((panel.match(/maxLength=\{128\}/g) ?? []).length >= 2, true);
  assert.doesNotMatch(panel, /minLength=\{15\}|Use uma frase de acesso de 15/);
});

test("Manager console relies on explicit full-scope grants, never the display role label", async () => {
  const [admin, manager, accessRoutes, presets] = await Promise.all([
    read("../src/pages/HubCentralAdminPage.tsx"),
    read("../src/pages/HubCentralManagerPage.tsx"),
    read("../server/src/routes/access.ts"),
    read("../src/services/accessRolePresets.ts"),
  ]);
  assert.match(admin, /session\.principal\.permissions\?\.includes\("workstations.read"\)/);
  assert.match(admin, /session\.principal\.permissions\?\.includes\("andon.read"\)/);
  assert.match(admin, /session\.principal\.machineScope === "all"/);
  assert.match(admin, /access\?\.workstation\.active === true/);
  assert.match(admin, /<HubCentralManagerPage section=\{section\}/);
  assert.doesNotMatch(manager, /<UsersAccessSettings|<WorkstationsSettingsTab|<GeneralSettingsTab|<AttendanceModeSettingsTab|<AppearanceSettingsPreview/);
  assert.doesNotMatch(manager, /\/users|\/service-identities|\/workstations\/.*decision/);
  assert.match(manager, /availableSections\.some\(\(item\) => item\.id === section\)/);
  assert.match(manager, /getSystemSettings\(\)/);
  assert.match(manager, /accessRequest<ManagedWorkstation\[\]>\("\/workstations"\)/);
  assert.match(accessRoutes, /assertPermission\(principal, "workstations.read"\);\s+\/\/ Global workstations list includes identities from every terminal\.\s+assertFullMachineScope\(principal\)/);
  assert.match(presets, /"workstations.read"/);
  assert.doesNotMatch(manager, /"POST"\s*,\s*\{[^}]*\}(?=\s*,)/);
});
