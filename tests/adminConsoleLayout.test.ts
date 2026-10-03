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

test("todas as áreas administrativas existentes continuam acessíveis", async () => {
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
    "workstations",
  ]) {
    assert.match(source, new RegExp(`id: "${tab}"`));
  }
});
