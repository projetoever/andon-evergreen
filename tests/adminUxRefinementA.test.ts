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

  assert.match(source, /title=\{ui\("Identificação"\)\}/);
  assert.match(source, /title=\{ui\("Regras operacionais"\)\}/);
  assert.doesNotMatch(source, /title=\{ui\("Estado atual"\)\}/);
  assert.doesNotMatch(source, /Leitura operacional; não é editada neste painel/);
  assert.match(source, /title=\{ui\("Estrutura da máquina"\)\}/);
  assert.match(source, /Há chamado ativo; inativação bloqueada/);
});

test("mantenedores usam ficha organizada por blocos funcionais", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /title=\{ui\("Identificação"\)\}/);
  assert.match(source, /title=\{ui\("Áreas técnicas"\)\}/);
  assert.match(source, /title=\{ui\("Turno e status"\)\}/);
  assert.match(source, /title=\{ui\("Credenciais"\)\}/);
  assert.match(source, /sticky bottom-0/);
});

test("mantenedores acompanham a altura real da ficha e rolam dentro da lista", async () => {
  const source = await readFile(
    new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  // Só há duas colunas quando a largura disponível permite o cadastro completo.
  assert.match(source, /xl:grid-cols-\[minmax\(280px,360px\)_minmax\(0,1fr\)\]/);
  // A ficha da direita determina a altura do grid; a lista não prende o layout ao viewport.
  assert.match(source, /relative min-w-0 xl:min-h-0/);
  assert.match(source, /xl:absolute xl:inset-0 xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden/);
  assert.match(source, /xl:max-h-none xl:flex-1/);
  // Em telas pequenas a lista continua limitada e rolável, sem estourar o painel.
  assert.match(source, /max-h-\[55dvh\]/);
  assert.match(source, /aria-label=\{ui\("Mantenedores cadastrados"\)\}/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.doesNotMatch(source, /md:h-\[calc\(96dvh-13rem\)\]/);
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
  assert.match(source, /disabled=\{isSaving \|\| Boolean\(error\) \|\| !hasUnsavedChanges \|\| !canEditSelected\}/);
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

test("máquinas têm uma única lista e deixam a OS individual visível apenas com global desligado", async () => {
  const [machineAdmin, general] = await Promise.all([
    readFile(new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(machineAdmin, /MachineConfigurationInventoryCard/);
  assert.match(machineAdmin, /filteredMachines\.map/);
  assert.match(machineAdmin, /showIndividualWorkOrderControl = globalWorkOrderRequirement === false/);
  assert.match(machineAdmin, /\{showIndividualWorkOrderControl && \(/);
  assert.match(machineAdmin, /showIndividualWorkOrderControl \? newRequireWorkOrder : false/);
  assert.match(machineAdmin, /OS obrigatória para todas as máquinas: regra global ativa/);
  assert.match(machineAdmin, /Aguardando confirmação da regra global de OS/);
  assert.match(machineAdmin, /Exigir OS nesta máquina/);
  assert.match(machineAdmin, /checked=\{selectedMachineRequiresWorkOrder\}/);
  assert.match(machineAdmin, /await updateMachineCatalog\(selectedMachine\.id, patch\)/);
  assert.doesNotMatch(machineAdmin, /setNewRequireWorkOrder\(true\)/);
  assert.doesNotMatch(machineAdmin, /Regra efetiva = global OU exigência desta máquina/);
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
    readFile(new URL("../src/components/settings/ShiftsSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /Pesquisar turnos por nome ou ID/);
  assert.match(source, /Filtrar turnos por status/);
  assert.match(source, /filteredItems\.length/);
  assert.match(source, /ring-primary\/30/);
  assert.match(source, /Alterações não salvas/);
  assert.match(source, /Existem alterações não salvas/);
  assert.match(source, /Priorizar turno atual/);
  assert.match(source, /A inclusão de novos turnos não está disponível nesta versão/);
  assert.doesNotMatch(source, /Adicionar turno/);
  assert.match(admin, /ShiftsSettingsTab/);
  assert.doesNotMatch(admin, /function ShiftsTab\(\)/);
});

test("sons usam aba dedicada com busca, escopo e aviso de armazenamento local", async () => {
  const [source, admin] = await Promise.all([
    readFile(new URL("../src/components/settings/SoundsSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
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

test("Hub deixa credenciais globais e recuperação explícitas", async () => {
  const [security, priorities] = await Promise.all([
    readFile(
      new URL("../src/components/settings/HubSecuritySettings.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/settings/PriorityAccessSettings.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  const source = `${security}\n${priorities}`;

  assert.match(source, /todas as\s+máquinas/);
  assert.match(source, /Gerar novo código/);
  assert.match(source, /Esqueci a senha/);
  assert.match(source, /armazenado no\s+servidor apenas como hash/);
  assert.match(source, /válida em todas as\s+máquinas\/workstations/);
});

test("configurações gerais bloqueiam operação quando o estado global não é confiável", async () => {
  const source = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Regras da operação/);
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
  assert.match(source, /disabled=\{isSaving \|\| !hasUnsavedChanges \|\| !canSaveAttendance\}/);
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

test("R10-07: centrally granted settings access shows every ANDON tab without bypassing backend guards", async () => {
  const [modal, dashboard, policy] = await Promise.all([
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/DashboardPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/policy.ts", import.meta.url), "utf8"),
  ]);
  for (const tab of [
    "general", "appearance", "sounds", "attendance", "technicians",
    "shifts", "categories", "classifications", "assetCatalogs", "machines",
  ]) assert.match(modal, new RegExp(`id: "${tab}"`));
  assert.match(modal, /const visibleTabs = tabs;/);
  assert.doesNotMatch(modal, /tabs\.filter\(\(item\) => item\.id === "general"/);
  assert.doesNotMatch(modal, /if \(limited && tab !== "general"/);
  // Opening is allowed only by an authenticated central session with this
  // explicit grant (or primary Admin), never by workstation IP or role label.
  assert.match(dashboard, /principal\.permissions\?\.includes\("andon\.settings\.open"\)/);
  assert.match(policy, /"andon\.settings\.open"/);
  // Tabs becoming visible does NOT elevate writes. Global color saving remains
  // restricted and unrelated catalog routes enforce their own backend ACL.
  assert.match(modal, /allowGlobalSave=\{centralAccess\}/);
  assert.match(modal, /Configurações do ANDON permite gerenciar o painel em qualquer perfil/);
});

test("R12-04H1: ten ANDON settings tabs remain visible but central machine inventory cannot operate live production", async () => {
  const [modal, machine, guard, route, policy] = await Promise.all([
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/centralMachineSettingsHttp.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/routes/machines.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/policy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(modal, /const visibleTabs = tabs;/);
  assert.equal((modal.match(/^    id: "(general|appearance|sounds|attendance|technicians|shifts|categories|classifications|assetCatalogs|machines)",$/gm) ?? []).length, 10);
  assert.match(modal, /<MachineAdminPanel centralAccess=\{centralAccess\}/);
  assert.match(machine, /export function MachineAdminPanel\(\{/);
  assert.match(machine, /centralAccess = false/);
  assert.match(machine, /onDirtyChange/);
  assert.match(machine, /<SelectTrigger disabled=\{centralAccess\}>/);
  assert.match(machine, /disabled=\{centralAccess \|\| Boolean\(selectedMachine\.currentCallId\)\}/);
  assert.match(machine, /Modo de produção e ativação exigem ações operacionais próprias/);
  assert.match(guard, /method === "PATCH"/);
  assert.doesNotMatch(guard, /\/active|\/production-mode|\/status/);
  assert.match(route, /if \(!isAuthorizedCentralMachineSettings\(request\)\)/);
  assert.match(policy, /"andon.settings.open"/);
  // A grant for settings must not be misinterpreted as permission to alter
  // machineStatus, productionMode, physical controls, calls or the Hub.
  assert.doesNotMatch(guard, /permission.*machines\.status\.write|permission.*production\.schedule\.write/);
});

test("CFG-15: 10 seções exibem 11 capacidades sem prometer liberação por ACL", async () => {
  const [panel, notice] = await Promise.all([
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/CentralSettingsCapabilityNotice.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok(panel.includes("<CentralSettingsCapabilityNotice tab={capabilityTab} open={true} />"));
  assert.doesNotMatch(panel, /CentralSettingsCapabilityNotice tab=\{tab\} open=\{open\}/);
  assert.doesNotMatch(panel, /Algumas operações de cadastro ainda não foram migradas/);
  assert.match(notice, /centralOperationalSettingsWriteEnabled === true/);
  assert.match(notice, /andonVisualPaletteWriteEnabled === true/);
  assert.match(notice, /centralDeclaredAttendanceEnabled === true/);
  assert.match(notice, /centralCallReasonsCatalogEnabled === true/);
  assert.match(notice, /Disponibilidade não verificada/);
  assert.match(notice, /não há indicador central de disponibilidade/);
  assert.doesNotMatch(notice, /updateSystemSettings|createCallReason|openCall/);
});

test("CFG-15C: General Settings exposes reads but disables mutations when central operational writes are OFF", async () => {
  const [source, server] = await Promise.all([
    readFile(new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/services/systemSettings.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /access\?\.centralAccessEnabled === true/);
  assert.match(source, /setCentralWritable\(settings\.centralOperationalSettingsWriteEnabled === true\)/);
  assert.match(source, /const canWriteSettings = access !== null && \(!centralMode \|\| centralWritable\)/);
  assert.match(source, /setCentralWritable\(false\)/);
  assert.match(source, /if \(!canWriteSettings\) return/);
  assert.match(source, /disabled=\{isLoadingSettings \|\| Boolean\(settingsLoadError\) \|\| isSavingKeyboard \|\| !canWriteSettings\}/);
  assert.match(source, /isSavingMaintenanceRestriction \|\| !canWriteSettings/);
  assert.match(source, /isSavingWorkOrder \|\| !canWriteSettings/);
  assert.match(source, /isSavingUniqueWorkOrder \|\| !canWriteSettings/);
  assert.match(source, /isSavingDashboardOrderMode \|\| !canWriteSettings/);
  assert.match(server, /centralOperationalSettingsWriteEnabled: centralOperationalSettingsEnabled\(\)/);
});

test("CFG-15C: attendance mode never offers central write when flag OFF, including PIN and RFID", async () => {
  const [source, server] = await Promise.all([
    readFile(new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/access/centralOperationalSettings.ts", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const canWriteAttendance = access !== null && \(!centralAttendance \|\|/);
  assert.match(source, /value\.centralOperationalSettingsWriteEnabled === true/);
  assert.match(source, /if \(!settings \|\| !hasUnsavedChanges \|\| !canSaveAttendance \|\| isSaving\) return/);
  assert.match(source, /disabled=\{!canWriteAttendance\}/);
  assert.match(source, /disabled=\{isSaving \|\| !hasUnsavedChanges \|\| !canSaveAttendance\}/);
  assert.match(source, /value\.centralDeclaredAttendanceEnabled === true/);
  assert.match(source, /Modo somente leitura: a gravação central/);
  assert.match(server, /"attendanceMode"/);
  assert.match(server, /"rfidInputTerminator"/);
  assert.match(server, /"rfidCodeLength"/);
});

test("CFG-15D1: central technician catalog respects separate creation and update feature gates", async () => {
  const [tab, settings, createGuard, updateGuard] = await Promise.all([
    readFile(new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/services/systemSettings.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/centralTechnicianCatalogHttp.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/centralTechnicianCatalogUpdateHttp.ts", import.meta.url), "utf8"),
  ]);
  assert.match(tab, /const centralMode = access\?\.centralAccessEnabled === true/);
  assert.match(tab, /settings\.centralTechnicianCreateEnabled === true/);
  assert.match(tab, /settings\.centralTechnicianUpdateEnabled === true/);
  assert.match(tab, /const canCreateTechnician = access !== null && \(!centralMode \|\| centralCapabilities\?\.create === true\)/);
  assert.match(tab, /const canUpdateTechnician = access !== null && \(!centralMode \|\| centralCapabilities\?\.update === true\)/);
  assert.match(tab, /const canEditSelected = selectedId \? canUpdateTechnician : canCreateTechnician/);
  assert.match(tab, /setCentralCapabilities\(null\)/);
  assert.match(tab, /error: true/);
  assert.match(tab, /if \(!canCreateTechnician \|\| isSaving\) return/);
  assert.match(tab, /if \(!canEditSelected \|\| isSaving \|\| isLoading/);
  assert.match(tab, /if \(!canUpdateTechnician \|\| isSaving \|\| isLoading/);
  assert.match(tab, /disabled=\{isLoading \|\| Boolean\(error\) \|\| isSaving \|\| !canCreateTechnician\}/);
  assert.match(tab, /disabled=\{isSaving \|\| Boolean\(error\) \|\| !canUpdateTechnician\}/);
  assert.match(tab, /disabled=\{isSaving \|\| Boolean\(error\) \|\| !hasUnsavedChanges \|\| !canEditSelected\}/);
  assert.match(tab, /setCapabilityReload\(value => value \+ 1\)/);
  assert.match(settings, /centralTechnicianCreateEnabled: centralTechnicianCreateEnabled\(\)/);
  assert.match(settings, /centralTechnicianUpdateEnabled: centralTechnicianUpdateEnabled\(\)/);
  assert.match(createGuard, /export function centralTechnicianCreateEnabled\(\)/);
  assert.match(updateGuard, /export function centralTechnicianUpdateEnabled\(\)/);
  assert.doesNotMatch(tab, /ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED|ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED/);
});

test("CFG-15D3: classifications remain readable but cannot write if central capability is OFF", async () => {
  const [modal, settings, guard] = await Promise.all([
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/src/services/systemSettings.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/src/security/centralClassificationHttp.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(modal.includes('<ClassificationsTab centralAccess={centralAccess} />'));
  assert.ok(modal.includes('function ClassificationsTab({ centralAccess }: { centralAccess: boolean })'));
  assert.ok(modal.includes('const canWriteClassifications = !centralAccess || centralWritable'));
  assert.ok(modal.includes('settings.centralClassificationWriteEnabled === true'));
  assert.ok(modal.includes('setCentralWritable(false)'));
  assert.ok(modal.includes('setCapabilityError(true)'));
  assert.ok(modal.includes('setCapabilityRetry(value => value + 1)'));
  assert.ok(modal.includes('if (!canWriteClassifications || isSaving || isLoading || Boolean(loadError)) return;'));
  assert.ok(modal.includes('if (!canWriteClassifications || isSaving || isLoading || Boolean(loadError) || !selectedId) return;'));
  assert.ok(modal.includes('disabled={isLoading || isSaving || Boolean(loadError) || !canWriteClassifications}'));
  assert.ok(modal.includes('disabled={isSaving || Boolean(loadError) || !canWriteClassifications}'));
  assert.ok(modal.includes('disabled={!selectedId || isSaving || Boolean(loadError) || !canWriteClassifications}'));
  assert.ok(modal.includes('await getFailureClassificationConfigs()'));
  assert.ok(settings.includes('centralClassificationWriteEnabled: centralClassificationHttpEnabled()'));
  assert.ok(guard.includes('method === "POST"'));
  assert.ok(guard.includes('method === "PATCH"'));
  assert.ok(!modal.includes("ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED"));
});

test("CFG-15F: general settings write gate revalidates without changing saved operational fields", async () => {
  const page = await readFile(
    new URL("../src/components/settings/GeneralSettingsTab.tsx", import.meta.url), "utf8",
  );
  assert.match(page, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(page, /window\.addEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(page, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(page, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(page, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(page, /const request = \+\+capabilityRequestVersion\.current/);
  assert.match(page, /request === capabilityRequestVersion\.current/);
  assert.match(page, /setCentralWritable\(false\)/);
  assert.match(page, /settings\.centralOperationalSettingsWriteEnabled === true/);
  const onlyGate = page.slice(page.indexOf("const revalidate = () => {"),
    page.indexOf("  }, [centralMode]);"));
  assert.doesNotMatch(onlyGate, /setVirtualKeyboardEnabled|setRequireWorkOrderAtOpen|setDashboardMachineOrderMode|updateSystemSettings/);
  assert.doesNotMatch(onlyGate, /event\.detail/);
});

test("PENTE 5-B: Máquinas exige salvar e protege alterações pendentes", async () => {
  const [machine, provider, shell, categories, shifts, technicians, groups,
    attendance, appearance, sound, assets] = await Promise.all([
    readFile(new URL("../src/components/settings/MachineAdminPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/context/AndonProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/CategoriesSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/ShiftsSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/TechniciansSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/CallReasonsSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AttendanceModeSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AppearanceSettingsPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/SoundsSettingsTab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/MachineAssetCatalogPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(machine, /machineChangesPending/);
  assert.match(machine, /handleSaveMachine/);
  assert.match(machine, /await updateMachineCatalog\(selectedMachine\.id, patch\)/);
  assert.match(machine, /await updateMachineDirectSectors\(/);
  assert.match(machine, /sectorVisibilityRevision \?\? 0/);
  assert.match(machine, /checked=\{selectedMachineRequiresWorkOrder\}/);
  assert.match(machine, /value=\{activeDraft\?\.name \?\? selectedMachine\.name\}/);
  assert.match(machine, /disabled=\{!machineChangesPending \|\| !canEditMachineMetadata/);
  assert.match(machine, /confirmDiscardChanges/);
  assert.match(machine, /beforeunload/);
  assert.doesNotMatch(machine, /onBlur=/);
  assert.doesNotMatch(machine, /visibilitySaving/);
  assert.match(provider, /const updateMachineCatalog = useCallback\(\s*async/);
  assert.match(shell, /onDirtyChange=\{setMachineDirty\}/);
  assert.match(shell, /if \(id === tab \|\| !canLeaveEditor\(\)\) return/);
  assert.match(shell, /onBack=\{handleAdminBack\}/);
  for (const form of [categories, shifts, technicians, groups, attendance, appearance, sound, assets]) {
    assert.match(form, /Salvar|salvar|handleSave|saveSoundConfig|saveGlobalVisualPalette/);
  }
});
