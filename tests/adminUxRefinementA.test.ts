import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("máquinas usam lista compacta com detalhe único selecionado", async () => {
  const source = await readFile(
    new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /xl:grid-cols-\[330px_minmax\(0,1fr\)\]/);
  assert.match(source, /selectedMachineId/);
  assert.match(source, /Localize e selecione uma máquina para editar/);
  assert.match(source, /MachineHierarchyAdminSection machine=\{selectedMachine\}/);
  assert.doesNotMatch(source, /MachineHierarchyAdminSection machine=\{machine\}/);
  assert.match(source, /Nova máquina/);
});

test("pesquisa de máquinas mantém seleção coerente com lista filtrada", async () => {
  const source = await readFile(
    new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /filteredMachines\.some/);
  assert.match(source, /setSelectedMachineId\(filteredMachines\[0\]\?\.id \?\? null\)/);
  assert.match(source, /setSearchQuery\("")/);
});

test("detalhe de máquina separa identificação, regras, estado e estrutura", async () => {
  const source = await readFile(
    new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /title="Identificação"/);
  assert.match(source, /title="Regras operacionais"/);
  assert.match(source, /title="Estado atual"/);
  assert.match(source, /title="Estrutura da máquina"/);
  assert.match(source, /Há chamado ativo; inativação bloqueada/);
});

test("mantenedores usam ficha organizada por blocos funcionais", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /title="Identificação"/);
  assert.match(source, /title="Áreas técnicas"/);
  assert.match(source, /title="Turno e status"/);
  assert.match(source, /title="Credenciais"/);
  assert.match(source, /sticky bottom-0/);
});

test("mantenedores indicam alterações pendentes e permitem cancelar edição", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /hasUnsavedChanges/);
  assert.match(source, /Alterações não salvas/);
  assert.match(source, /Existem alterações pendentes/);
  assert.match(source, /handleCancelEdit/);
  assert.match(source, /Cadastro sincronizado/);
  assert.match(source, /disabled=\{isSaving \|\| Boolean\(error\) \|\| !hasUnsavedChanges\}/);
});
