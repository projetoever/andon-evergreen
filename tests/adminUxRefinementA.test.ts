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
  assert.match(source, /setSearchQuery\(""\)/);
});

test("detalhe de máquina mantém apenas configuração e estrutura", async () => {
  const source = await readFile(
    new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /title="Identificação"/);
  assert.match(source, /title="Regras operacionais"/);
  assert.doesNotMatch(source, /title="Estado atual"/);
  assert.doesNotMatch(source, /Leitura operacional; não é editada neste painel/);
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

test("mantenedores usam a altura útil do Admin e rolam até o último registro", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /md:h-\[calc\(96dvh-13rem\)\]/);
  assert.match(source, /md:flex-col/);
  assert.match(source, /min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain/);
  assert.doesNotMatch(source, /max-h-\[56vh\]/);
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


test("classificações possuem pesquisa, filtro de status e contador", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Pesquisar nome ou ID/);
  assert.match(source, /Pesquisar classificações por nome ou ID/);
  assert.match(source, /statusFilter/);
  assert.match(source, /Todos/);
  assert.match(source, /Ativos/);
  assert.match(source, /Inativos/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /Nenhuma classificação encontrada/);
  assert.match(source, /max-h-\[calc\(96dvh-22rem\)\]/);
});

test("classificações mantêm edição e ID histórico estável", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Editar classificação/);
  assert.match(source, /Salvar classificação/);
  assert.match(source, /O ID interno permanece estável para preservar o histórico/);
  assert.match(source, /updateFailureClassification/);
  assert.match(source, /createFailureClassification/);
});


test("setores possuem pesquisa, filtro de status, contador e seleção destacada", async () => {
  const source = await readFile(
    new URL("../src/components/settings/CategoriesSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Pesquisar setores por nome ou ID/);
  assert.match(source, /statusFilter/);
  assert.match(source, /Todos/);
  assert.match(source, /Ativos/);
  assert.match(source, /Inativos/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /Nenhum setor encontrado/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /max-h-\[calc\(96dvh-22rem\)\]/);
});


test("mantenedores possuem filtros profissionais de status, setor e turno", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Filtrar mantenedores por status/);
  assert.match(source, /Filtrar mantenedores por setor/);
  assert.match(source, /Filtrar mantenedores por turno/);
  assert.match(source, /statusFilter/);
  assert.match(source, /shiftFilter/);
  assert.match(source, /Todos os turnos/);
  assert.match(source, /Sem turno/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /setStatusFilter\("all"\)/);
  assert.match(source, /setShiftFilter\("all"\)/);
});


test("workstations possuem busca, filtro, contador e destaque da estação atual", async () => {
  const source = await readFile(
    new URL("../src/components/settings/WorkstationsSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Pesquisar workstations por nome ou ID/);
  assert.match(source, /Filtrar workstations por status/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /Ativas/);
  assert.match(source, /Inativas/);
  assert.match(source, /Nenhuma workstation encontrada/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /Tentar novamente/);
});


test("máquinas deixam clara a regra global, local e efetiva de OS", async () => {
  const [machineAdmin, general] = await Promise.all([
    readFile(
      new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(machineAdmin, /Regra global de OS/);
  assert.match(machineAdmin, /Regra desta máquina/);
  assert.match(machineAdmin, /Resultado efetivo/);
  assert.match(machineAdmin, /Regra efetiva = global OU exigência desta máquina/);
  assert.match(machineAdmin, /Exigir OS nesta máquina/);
  assert.match(machineAdmin, /Filtrar máquinas por status/);
  assert.match(machineAdmin, /Filtrar máquinas por exigência de OS/);
  assert.match(machineAdmin, /ring-primary\/30/);
  assert.match(general, /Regra global: exigir OS na abertura/);
  assert.match(general, /uma máquina pode\s+exigir OS individualmente/);
});


test("catálogos de ativos possuem busca, status, contador e estados profissionais", async () => {
  const source = await readFile(
    new URL("../src/components/settings/MachineAssetCatalogPanel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Pesquisar tipos de ativos/);
  assert.match(source, /Filtrar tipos de ativos por status/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /Nenhum tipo encontrado/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /max-h-\[calc\(96dvh-22rem\)\]/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /Limpar filtros/);
});


test("turnos usam aba dedicada com catálogo profissional e sem falsa criação", async () => {
  const [source, admin] = await Promise.all([
    readFile(
      new URL("../src/components/settings/ShiftsSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(source, /Pesquisar turnos por nome ou ID/);
  assert.match(source, /Filtrar turnos por status/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /Alterações não salvas/);
  assert.match(source, /Existem alterações não salvas/);
  assert.match(source, /Priorizar turno atual/);
  assert.match(
    source,
    /A inclusão de novos turnos não está disponível nesta versão/,
  );
  assert.doesNotMatch(source, /Adicionar turno/);
  assert.match(admin, /ShiftsSettingsTab/);
  assert.doesNotMatch(admin, /function ShiftsTab\(\)/);
});


test("sons usam aba dedicada com busca, escopo e aviso de armazenamento local", async () => {
  const [source, admin] = await Promise.all([
    readFile(
      new URL("../src/components/settings/SoundsSettingsTab.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(source, /Pesquisar configurações de som/);
  assert.match(source, /Filtrar configurações de som por escopo/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /Nenhum som encontrado/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /Armazenamento local deste terminal/);
  assert.match(source, /não são distribuídas automaticamente para outras workstations/);
  assert.match(admin, /SoundsSettingsTab/);
  assert.doesNotMatch(admin, /function SoundsTab\(/);
});


test("configurações gerais deixam credenciais globais e recuperação explícitas", async () => {
  const source = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /todas as máquinas/);
  assert.match(source, /Gerar novo código/);
  assert.match(source, /Esqueci a senha/);
  assert.match(source, /armazenado no servidor apenas como hash/);
  assert.match(source, /válida em todas as máquinas\/workstations/);
});


test("configurações gerais bloqueiam operação quando o estado global não é confiável", async () => {
  const source = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Operação global/);
  assert.match(source, /settingsLoadError/);
  assert.match(source, /Configurações globais indisponíveis/);
  assert.match(source, /loadGeneralSettings/);
  assert.match(source, /priorityAccessLoadError/);
  assert.match(source, /Indisponível/);
  assert.match(source, /loadPriorityAccess/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /Boolean\(settingsLoadError\)/);
});


test("modo de atendimento possui retry, alterações pendentes e cancelamento", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /loadError/);
  assert.match(source, /Modo de atendimento indisponível/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /hasUnsavedChanges/);
  assert.match(source, /Alterações não salvas/);
  assert.match(source, /Configuração sincronizada/);
  assert.match(source, /savedSettings && setSettings\(savedSettings\)/);
  assert.match(source, /disabled=\{isSaving \|\| !hasUnsavedChanges\}/);
  assert.match(source, /Informe entre 4 e 64 caracteres para a leitura RFID/);
});


test("listas de catálogo do Admin aproveitam a altura útil do modal", async () => {
  const paths = [
    "../src/components/settings/CategoriesSettingsTab.tsx",
    "../src/components/settings/ShiftsSettingsTab.tsx",
    "../src/components/settings/SoundsSettingsTab.tsx",
    "../src/components/settings/MachineAssetCatalogPanel.tsx",
    "../src/components/settings/AdminSettingsModal.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /min-h-\[12rem\]/);
    assert.match(source, /max-h-\[calc\(96dvh-22rem\)\]/);
    assert.match(source, /overscroll-contain/);
    assert.doesNotMatch(source, /max-h-\[52vh\]/);
  }
});


test("interface padroniza o termo mantenedor", async () => {
  const paths = [
    "../src/components/settings/TechniciansSettingsTab.tsx",
    "../src/components/calls/TechnicianSelector.tsx",
    "../src/pages/MachineCallHistoryPage.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Manutentor|manutentor|Manutentores|manutentores/);
  }

  const admin = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(admin, /Mantenedores/);
  assert.match(admin, /mantenedor/);
});


test("editores do Admin mantêm ações visíveis em telas de menor altura", async () => {
  const paths = [
    "../src/components/settings/AdminSettingsModal.tsx",
    "../src/components/settings/CategoriesSettingsTab.tsx",
    "../src/components/settings/ShiftsSettingsTab.tsx",
    "../src/components/settings/SoundsSettingsTab.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /sticky bottom-0 z-10/);
    assert.match(source, /bg-background\/95/);
    assert.match(source, /backdrop-blur/);
  }
});

test("classificações usam o mesmo destaque de seleção das demais listas", async () => {
  const source = await readFile(
    new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /border-primary bg-primary\/10 ring-1 ring-primary\/30/);
});
