import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("painel admin usa console amplo com navegação lateral agrupada", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /h-\[96dvh\]/);
  assert.match(source, /max-w-\[1600px\]/);
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
