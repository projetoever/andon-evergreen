import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("painel admin usa console amplo com navegação lateral agrupada", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /andon-screen-enter h-dvh min-h-0 w-full overflow-hidden/);
  assert.match(source, /export function AdminSettingsWorkspace/);
  assert.doesNotMatch(source, /<Dialog open=|<DialogContent|shadow-2xl sm:w-\[96vw\]/);
  assert.match(source, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  assert.match(source, /Painel administrativo/);
  assert.match(source, /navigationGroups/);
  assert.match(source, /"Sistema"/);
  assert.match(source, /"Operação"/);
  assert.match(source, /"Cadastros"/);
  assert.match(source, /"Infraestrutura"/);
});

test("navegação admin permanece responsiva em telas menores", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /overflow-x-auto/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /Sair do modo admin/);
  assert.match(source, /Fechar painel administrativo/);
});

test("não cria aba de notificações sem necessidade funcional", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /id: "notifications"/);
  assert.doesNotMatch(source, /label: "Notificações"/);
});

test("áreas operacionais continuam no ANDON e workstations ficam no Hub", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  for (const tab of [
    "general",
    "sounds",
    "attendance",
    "technicians",
    "categories",
    "shifts",
    "classifications",
    "assetCatalogs",
    "machines",
  ]) {
    assert.match(source, new RegExp(`id: "${tab}"`));
  }
  assert.doesNotMatch(source, /id: "workstations"|PlatformAdminLinks/);
  const hub = await readFile(new URL("../src/pages/HubAdminPage.tsx", import.meta.url), "utf8");
  assert.match(hub, /WorkstationsSettingsTab/);
});

test("Hub usa uma única navegação administrativa persistida na rota", async () => {
  const hub = await readFile(new URL("../src/pages/HubAdminPage.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../src/routes/hub.admin.tsx", import.meta.url), "utf8");
  const types = await readFile(new URL("../src/types/modules.ts", import.meta.url), "utf8");

  assert.equal((hub.match(/<nav/g) ?? []).length, 1);
  assert.match(hub, /sections\.map/);
  assert.match(hub, /search=\{\{ section: item\.id \}\}/);
  assert.match(hub, /aria-current=\{section === item\.id \? "page"/);
  assert.doesNotMatch(hub, /PlatformAdminLinks|section === "priorities"/);
  assert.match(route, /validateSearch/);
  for (const section of ["overview", "users", "workstations", "security", "modules"])
    assert.match(types, new RegExp(`"${section}"`));
  assert.doesNotMatch(types, /"priorities",/);
});

test("Usuários diferencia bloqueio HTTPS de falha temporária", async () => {
  const users = await readFile(
    new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    users,
    /Gestão de usuários indisponível neste endereço\. É necessário configurar acesso HTTPS seguro\./,
  );
  assert.match(users, /errorCode === "https_required"/);
  assert.match(users, /errorCode !== "https_required"/);
  assert.match(users, /Sessão central: \{0\} · \{1\}/);
});

test("REFINE21: Admin ANDON abre por rota fullscreen, nunca por modal no dashboard", async () => {
  const [dashboard, page, route, admin] = await Promise.all([
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/AndonAdminPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/andon.admin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /createFileRoute\("\/andon\/admin"\)/);
  assert.match(dashboard, /navigate\(\{ to: "\/andon\/admin" \}\)/);
  assert.doesNotMatch(dashboard, /<AdminSettingsModal|adminSettingsOpen|setAdminSettingsOpen/);
  assert.match(page, /accessRequest<AccessState>\("\/session"\)/);
  assert.match(page, /principal\.permissions\?\.includes\("andon\.settings\.open"\)/);
  assert.match(page, /<AdminSettingsWorkspace/);
  assert.match(admin, /h-dvh min-h-0 w-full overflow-hidden/);
  assert.doesNotMatch(admin, /<Dialog open=/);
});

test("REFINE21: Hub central, Gerente e legado usam tela inteira e barra lateral responsiva", async () => {
  const paths = [
    "../src/pages/HubAdminPage.tsx",
    "../src/pages/HubCentralAdminPage.tsx",
    "../src/pages/HubCentralManagerPage.tsx",
  ];
  for (const path of paths) {
    const page = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(page, /max-w-none/);
    assert.match(page, /lg:grid-cols-\[264px_minmax\(0,1fr\)\]/);
    assert.match(page, /<aside className="min-w-0 lg:sticky/);
    assert.match(page, /lg:flex-col lg:overflow-x-visible/);
    assert.match(page, /overflow-x-auto/);
    assert.match(page, /search=\{\{ section: item\.id \}\}/);
  }
});

test("P1 route admin fullscreen: screen pin cannot redirect authorized settings to machine", async () => {
  const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/AndonAdminPage.tsx", import.meta.url), "utf8");
  assert.match(root, /isAdminWorkspace = pathname === "\/andon\/admin"/);
  assert.match(root, /!isAdminWorkspace &&\s*!canOpenPinnedMachineHistory/);
  assert.match(root, /if \(isHubRoute \|\| isAdminWorkspace\)/);
  assert.match(page, /principal\?\.purpose === "normal"/);
  assert.match(page, /principal\.isPrimaryAdmin === true/);
  assert.match(page, /principal\.permissions\?\.includes\("andon\.settings\.open"\)/);
  assert.match(page, /requestId !== authorizationRequest\.current/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|setCookie|accessToken/);
});

test("P1 full admin workspace keeps capability summary mounted and all 11 tabs", async () => {
  const source = await readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8");
  const workspace = source.split("export function AdminSettingsWorkspace")[1]?.split("function ClassificationsTab")[0] ?? "";
  assert.match(workspace, /CentralSettingsCapabilityNotice tab=\{tab\} open=\{true\}/);
  assert.doesNotMatch(workspace, /open=\{open\}|<DialogContent|<Dialog open=/);
  assert.match(workspace, /overflow-y-auto/);
  assert.match(workspace, /max-w-none/);
  for (const tab of ["general","appearance","sounds","attendance","technicians",
    "shifts","categories","callReasons","classifications","assetCatalogs","machines"]) {
    assert.match(source, new RegExp('id: "' + tab + '"'));
  }
});
