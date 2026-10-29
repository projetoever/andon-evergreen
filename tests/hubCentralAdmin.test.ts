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
  assert.match(page, /!\["overview","users","workstations"\]\.includes\(section\)/);
  assert.match(page, /Configuração indisponível na administração central/);
});
