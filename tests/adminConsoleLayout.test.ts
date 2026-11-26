import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("painel admin usa console amplo com navegação lateral agrupada", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /<AdminWorkspaceShell/);
  const shared = await readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(shared, /andon-screen-enter h-dvh min-h-0 w-full overflow-hidden/);
  assert.match(source, /export function AdminSettingsWorkspace/);
  assert.doesNotMatch(source, /<Dialog open=|<DialogContent|shadow-2xl sm:w-\[96vw\]/);
  assert.match(shared, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
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

  const shared = await readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(shared, /overflow-x-auto/);
  assert.match(shared, /lg:hidden/);
  assert.match(source, /Sair do modo admin/);
  assert.match(source, /onBack=\{handleAdminBack\}/);
  assert.match(source, /canLeaveEditor/);
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

  const shell = await readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(hub, /<AdminWorkspaceShell/);
  assert.match(hub, /sections\.map/);
  assert.match(shell, /to="\/hub\/admin" search=\{\{ section: item\.id as HubAdminSection \}\}/);
  assert.match(shell, /aria-current=\{active \? "page"/);
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
    readFile(new URL("../src/routes/andon_.admin.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /createFileRoute\("\/andon_\/admin"\)/);
  assert.match(dashboard, /navigate\(\{ to: "\/andon\/admin" \}\)/);
  assert.doesNotMatch(dashboard, /<AdminSettingsModal|adminSettingsOpen|setAdminSettingsOpen/);
  assert.match(page, /accessRequest<AccessState>\("\/session"\)/);
  assert.match(page, /principal\.permissions\?\.includes\("andon\.settings\.open"\)/);
  assert.match(page, /<AndonProvider>/);
  assert.match(page, /<TechnicianProvider>/);
  assert.match(page, /<VirtualKeyboard \/>/);
  assert.ok(page.indexOf("<AndonProvider>") > page.indexOf('if (checking || !access || error'),
    "Operational contexts mount only after the protected-route authorization gate");
  assert.match(page, /<AdminSettingsWorkspace/);
  assert.match(admin, /<AdminWorkspaceShell/);
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
    assert.match(page, /<AdminWorkspaceShell/);
    assert.match(page, /hubNavigation/);
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
  assert.match(page, /CONFIGURED_DATA_MODE === "local" \|\| access\.centralAccessEnabled === false/);
  assert.doesNotMatch(page, /if \(!isCentral\)\s*\{\s*setAuthorization\(isAdminAuthenticated\(\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|setCookie|accessToken/);
});

test("P1 full admin workspace has 11 menu entries and 11 gated catalog capabilities", async () => {
  const source = await readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8");
  const workspace = source.split("export function AdminSettingsWorkspace")[1]?.split("function ClassificationsTab")[0] ?? "";
  assert.match(workspace, /CentralSettingsCapabilityNotice tab=\{capabilityTab\} open=\{true\}/);
  assert.doesNotMatch(workspace, /open=\{open\}|<DialogContent|<Dialog open=/);
  const shell = await readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /overflow-y-auto/);
  assert.match(shell, /max-w-none/);
  for (const tab of ["general","appearance","sounds","attendance","technicians",
    "shifts","categories","classifications","assetCatalogs","machines"]) {
    assert.match(source, new RegExp('id: "' + tab + '"'));
  }
  assert.match(source, /id: "callReasons",/);
  assert.match(source, /capabilityTab: SettingsTab = tab/);
  assert.doesNotMatch(source, /catalogView/);
});

test("REFINE22: Hub and ANDON render exactly the same admin frame without overlay", async () => {
  const paths = [
    "../src/components/settings/AdminSettingsModal.tsx",
    "../src/pages/HubAdminPage.tsx",
    "../src/pages/HubCentralAdminPage.tsx",
    "../src/pages/HubCentralManagerPage.tsx",
  ];
  for (const path of paths) {
    const page = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(page, /<AdminWorkspaceShell/);
    assert.doesNotMatch(page, /lg:grid-cols-\[264px_minmax\(0,1fr\)\]|<DialogContent/);
  }
  const frame = await readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8");
  assert.match(frame, /h-dvh min-h-0 w-full overflow-hidden/);
  assert.match(frame, /lg:grid-cols-\[280px_minmax\(0,1fr\)\]/);
  assert.match(frame, /<aside className="hidden/);
  assert.match(frame, /lg:flex lg:flex-col/);
  assert.match(frame, /overflow-x-auto border-b/);
  assert.match(frame, /flex-1 overflow-y-auto/);
  assert.match(frame, /hubNavigation \? \(/);
  assert.match(frame, /search=\{\{ section: item\.id as HubAdminSection \}\}/);
  assert.doesNotMatch(frame, /setCookie|localStorage|password|accessRequest|authenticate\(/);
});

test("PENTE 5: ANDON volta ao topo ao trocar de aba sem alterar o Hub", async () => {
  const [andon, shared, hub] = await Promise.all([
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminWorkspaceShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/HubAdminPage.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(andon, /resetContentScrollOnTabChange/);
  assert.match(shared, /const contentScrollRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(shared, /contentScrollRef\.current\.scrollTop = 0/);
  assert.match(shared, /\[activeId, resetContentScrollOnTabChange\]/);
  assert.match(shared, /ref=\{contentScrollRef\}/);
  assert.doesNotMatch(hub, /resetContentScrollOnTabChange/);
  // Dicas de contexto no menu; navegação e permissão continuam propriedade dos pais.
  assert.match(shared, /title=\{item.description\}/);
  assert.match(shared, /focus-visible:ring-2 focus-visible:ring-ring/);
});

