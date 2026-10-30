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
  assert.match(page, /<HubBuildVersionCard \/>/);
  assert.match(page, /accessRequest<ManagedWorkstation\[\]>\("\/workstations"\)/);
  assert.doesNotMatch(page, /<HubSecuritySettings \/>/);
  assert.doesNotMatch(page, /<ModuleCredentialSettings \/>/);
  assert.match(page, /!\["overview","users","workstations","andon"\]\.includes\(section\)/);
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
