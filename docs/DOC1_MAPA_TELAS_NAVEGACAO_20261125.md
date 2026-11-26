# DOC 1 — Inventário de telas e contrato de navegação

**Documento:** DOC1-UI-001 · edição 0.1 · 25/11/2026  
**Fonte de verdade:** `src/routes/`, `src/pages/`, `src/components/`, `src/context/ModuleAccessProvider`, `server/src/services/moduleRegistry.ts`.  
**Baseline:** `main@c7c7837b77be4ce9e1d817913ff921e3f38413d4`; a homologação visual em dispositivo real é pendente.  
**Escopo:** índice de navegação para produção dos manuais e rastreabilidade UI ↔ API; não apresenta capturas antigas como telas finalizadas.

## 1. Mapa das páginas reais

| Caminho público UI | Rota do código | Componente/página | Responsabilidade e particularidades |
|---|---|---|---|
| `/` | `src/routes/index.tsx` | `HubPage` | Entrada central do produto; opções condicionadas aos acessos |
| `/hub` e `/hub/` | `hub.tsx`, `hub.index.tsx` | `HubPage` via `Outlet` | Launcher com atalhos apenas aos módulos autorizados |
| `/hub/admin` | `hub.admin.tsx` | `HubAdminPage` | Administração, acesso por sessão e seções parametrizadas |
| `/andon` | `andon.tsx` | `DashboardPage` | Cards de máquinas, chamadas, tempo, prioridade, som e links por permissão |
| `/andon/admin` | `andon_.admin.tsx` | `AndonAdminPage` | Cadastros e configurações ANDON, com políticas de entrada/ação |
| `/machines/:machineId` | `machines.$machineId.tsx` | `MachineDetailPage` | Máquina, setores/grupos e fluxo operacional |
| `/machines/:machineId/call-history` | `machines.$machineId_.call-history.tsx` | `MachineCallHistoryPage` | Histórico de chamados da máquina |
| `/machines/:machineId/failure-history` | `machines.$machineId_.failure-history.tsx` | `MachineCallHistoryPage` | Caminho de histórico legado/compatível com o mesmo componente |
| `/history` | `history.tsx` | `HistoryPage` | Em acesso central monta `GlobalCallHistoryPage`; modo legado utiliza `LegacyHistoryPage` |
| `/bi` | `bi.tsx` | `AndonBiPage` | Cinco seções e análises autorizadas |
| `/machine-priorities` | `machine-priorities.tsx` | `DashboardPriorityPage` | Visão geral, sequência P1..Pn, programação e histórico |
| `/active-calls` | `active-calls.tsx` | `ActiveCallsPage` | Lista de chamados ativos |
| `/settings` | `settings.tsx` | `SettingsPage` | Tela de ajustes, distinta de configuração central do Hub |

**Observação importante:** o arquivo da rota `andon_.admin.tsx` usa a convenção de TanStack Router `"/andon_/admin"`, que representa o caminho público separado `/andon/admin`. Não usar o nome do arquivo como URL para o operador. A presença dos componentes no build não dispensa verificação de grants.

## 2. Seções internas sem rota individual

**BI:** `BiWorkspaceTabs.tsx` define exatamente cinco IDs de área: `overview` (Visão Geral), `reliability` (Confiabilidade), `failures` (Falhas), `maintenance` (Manutenção), `data-quality` (Qualidade dos Dados). São seções no mesmo módulo `/bi`, não cinco endpoints de navegação independentes.

**Prioridades:** componentes de `src/components/priority/`, incluindo `PriorityOverviewPanel`, badges de produção/ativação e navegação por seção. A contagem P1..Pn é configuração e não deve ser inferida por número fixo de cards no screenshot.

**Histórico Global:** `src/pages/HistoryPage.tsx` é uma ponte de compatibilidade entre acesso central e legado. A URL `/history?machineId=...` indica um filtro, **não** concede permissão para ler a máquina. A API deve aplicar escopo.

**Administração:** painéis central e ANDON são superfícies distintas; um botão que abre administração não concede permissão de escrita em todos os catálogos, nem herda `audit.read`. A seleção de seções do Hub usa valores aceitos pela rota.

## 3. Componentes transversais

| Componente/serviço | Origem | Verificação editorial |
|---|---|---|
| Workstation Access Gate | `src/components/security/WorkstationAccessGate` | Estação pendente, ativa ou bloqueada é tratada antes de ações |
| ModuleAccessProvider | `src/context/ModuleAccessProvider` | Menus e ícones refletem grants resolvidos do servidor |
| Theme/Language Providers | `src/theme/`, `src/i18n/` | PT-BR, EN, zh-TW, claro/escuro sem alteração da lógica |
| UI Audit Tracker | `src/components/security/UiAuditTracker` | Cliques e rotas são observações, não prova de alteração |
| Virtual Keyboard | `src/components/common/VirtualKeyboard` | Testar foco, entrada e sobreposição de ações |
| Toast/ConfirmDialog | `src/components/ui/sonner` e `src/components/common/ConfirmDialog` | Falhas, confirmação, estados críticos e acessibilidade |
| Machine 360 | `src/components/bi/BiMachine360Overlay` | Nome longo, exportar/fechar e rolagem mobile |
| Gráficos BI | `src/components/bi/` | Valores idênticos à API, tooltip com contraste e detalhamento |
| Dashboard machine identity | `src/components/machines/` | Máquina longa/curta legível, ID secundário e comandos preservados |

## 4. Matriz de navegação esperada por capacidade

| Destino | Condição central fundamental | Teste negativo obrigatório |
|---|---|---|
| ANDON | `andon.read` | Sem grant: não listar/ler máquina fora do scope |
| BI | `bi.read` | Sem grant: ícone e rota direta não abrem indicadores |
| Prioridades | `priorities.read` | `priorities.write` não pode ser deduzida da leitura |
| Histórico Global | `andon.read` + `history.read` + `history.global.read` | Query string de outra máquina não contorna scope |
| Auditoria | `audit.read` e `audit.export` adicional para exportação | Ler não dá direito de exportar; exportar sozinho não abre painel |
| Configuração | `andon.settings.open` e grants específicos | Abrir tela não autoriza manutenção de usuários, workstations ou BI |
| Ações de chamado | `calls.open/attend/finish...` conforme ação | URL direta, requisição repetida e segundo terminal negados se indevidos |

Regras detalhadas: [DOC1-SEC-001](DOC1_AUTORIZACAO_MODULOS_20261125.md). Em instalações com acesso central desativado, consultar políticas de compatibilidade legada sem assumir semântica idêntica.

## 5. Inventário de responsividade e acessibilidade

| Superfície | Celular | Tablet | Desktop/kiosk |
|---|---|---|---|
| Hub e Administração | Launcher/drawer, grupos de permissão e formulários por toque | Navegação por grupos sem truncamento | Sidebar e painel de administração |
| Dashboard | Cards fluidos, nomes completos e prioridade visível | Distribuição adaptativa | Painel de grade e alertas com alto contraste |
| Máquina | Botões de setor/grupo, modais, OS e teclado alcançáveis | Setores e detalhes legíveis | Painel operacional com foco na máquina |
| Histórico | Cards expansíveis com detalhes preservados | Filtros e detalhes responsivos | Tabela densa e detalhe lateral |
| BI | Seletor das cinco áreas, barras/legendas/tabelas com scroll interno | Composição de indicadores adaptativa | Charts exploratórios com ferramenta de inspeção |
| Prioridades | Sequência e programação sem ações ocultas | Lista e filtros sem compressão | Listagem com ordenação e reordenação controlada |
| Audit | Tabela/filtragem/exportação sem perda | Layout adaptativo | Consulta densa e download seguro |

**Testes obrigatórios:** 320×568, 360×640, 390×844, 430×932, 768×1024, 1024×768, 1366×768 e 1920×1080; zoom, nomes longos e PT/EN/zh-TW; Chrome/Firefox, Android real e Safari iOS real. Capturas do Playwright são evidência automatizada, não homologação em aparelho físico.

## 6. Padrão para screenshots dos manuais

- Cada captura deve ter `sha`, módulo/rota, viewport, tema, idioma, perfil, data, cenário sintético e resultado do teste.
- Não ocultar controles com recorte que mude o significado da tela; anotações devem apontar apenas para elementos da versão aprovada.
- Quando recurso depende de permissão, produzir **duas capturas** (autorizado e negado/leitura) com dados fictícios.
- Conferir legenda e semântica de prioridade, programação e parada para evitar imagem que sugira regra errada.
- Prints de `pilot.2`, protótipos SDK ou PRs pré-merge são **históricos** até revalidação.

## 7. Backlog editorial de tela

1. Confirmar todas as 14+ páginas com um roteiro gravado por papel em HML e verificar que a lista acima está atualizada no SHA de release.
2. Criar mapa visual de cliques com caminhos de retorno ao Hub, sem usar URLs inexistentes.
3. Identificar cada modal, drawer e confirmação por componente/ação, incluindo teclado nativo e acessibilidade.
4. Conferir campos e mensagens no catálogo i18n, sem traduzir nomes/diagnósticos cadastrados.
5. Juntar evidências a [DOC1-QA](DOC1_HOMOLOGACAO_GUIADA_20261125.md); somente então concluir manuais ilustrados.

**Estado:** inventário de código concluído nesta revisão; homologação visual dos caminhos **pendente**.
