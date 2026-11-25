# PENTE 2 — Visão Geral, Histórico autorizado e faixa dinâmica P1..Pn

**Data:** 25/11/2026 · **Issue:** #614 · **Branch:** `pente/02-priority-range-overview-20261125`

**Base verificada:** `main@f6a2ff7b8d63faa743f0913e77dbd44b820b0849` (PR #630 integrada).
**Regra de entrega:** branch e PR de desenvolvimento, CI e autorização expressa antes de integrar na main. Nenhuma modificação ao servidor industrial.

## Diagnóstico

1. A antiga **Visão Geral** mostrava somente quantidades total/ativa/inativa e repetia P1–P5, sem ajudar a planejar.
2. O botão Histórico na sequência já usava `globalHistory.available/allowed` do servidor. `globalHistoryModuleAccess()` exige `andon.read`, `history.read`, `history.global.read`, pessoal+normal, estação aprovada e flag habilitada. **Lacuna de UX:** o botão podia aparecer para uma máquina fora do `machineScope` do usuário, embora a API a rejeitasse.
3. A faixa **P1–P5** era fixa em UI, snapshots de histórico, MachineGrid e paginação de 14 cartões, sem parâmetro persistente. Alterar somente o frontend não atenderia a todas as workstations, auditoria e rankings multi-página.

## Implementação

### A — Visão Geral útil, sem inventar dados

`src/components/priority/PriorityOverviewPanel.tsx` usa exclusivamente o snapshot oficial de máquinas:
- cobertura configurada X/N das máquinas ativas; contador de ativas no escopo;
- contagem de ativas programadas, fora de produção e sem estado conhecido;
- lista resumida das prioritárias com identificação e status, limitada visualmente a 12 com indicador de restantes;
- atenção a máquinas priorizadas que estão fora de produção ou com programação desconhecida;
- próximas cinco máquinas da ordem e atalhos contextuais a Sequência, Programação e Auditoria;
- última revisão quando permitida pelo escopo; para usuários com escopo parcial, **não fabrica P1/Pn globais**, mostra aviso de escopo.
**Sem** dados inferidos de chamados, disponibilidade online, downtime, relatórios BI ou leitura sem autorização.

### B — Histórico por máquina exclusivamente autorizado

`src/utils/priorityHistoryVisibility.ts` somente retorna true com:
- central ligado;
- `globalHistory.available && globalHistory.allowed` (concessão emitida pelo servidor e Admin);
- sessão normal;
- máquina dentro de `machineScope` para escopo selecionado.

A API de Histórico Global continua validando `history.global.read`, `history.read`, `andon.read`, machineScope, workstation e feature flag. A ocultação do botão **não é substituto** da verificação de backend.

### C — Configuração global de quantidade de cards prioritários

- **Migration aditiva**: `server/prisma/migrations/20261125173000_priority_highlight_count/migration.sql` acrescenta `priorityHighlightCount INTEGER NOT NULL DEFAULT 5` em `dashboard_priority_config`. Mantém comportamento antigo até alteração autorizada. Requer migração pelo instalador e backup antes de deploy, **sem SQL manual na fábrica**.
- GET protegido `/api/dashboard-priority/order` retorna a contagem; UI de **Sequência** permite escolher 1..quantidade ativa, apenas `priorities.write` global; marca edição pendente, exige salvar, permite descartar ou recarregar.
- PUT existente recebe `priorityHighlightCount` e `expectedPriorityHighlightCount` opcionais; valores antigos sem esses campos continuam válidos; valida número inteiro/limites e catálogo ativo **dentro da transação**, compara expectativa (CAS 409), registra auditoria e alterações individuais de ranking no `MachinePriorityHistory` quando efetivamente mudarem.
- Central mantém sessão, CSRF, workstation, `priorities.write`, `machineScope=all`, locks; modo legado conserva autenticação anterior e CAS. A mudança de ranking não permite alterar programação.
- `GET /api/system-settings` expõe somente **contagem pública para apresentação** (sem nome do editor, credenciais ou permissões) para que o Dashboard operacional leia mesmo sem `priorities.read`. `DashboardPage` atualiza só a contagem a cada 20 s enquanto a aba está visível, preservando estado de som e mute. No mesmo navegador, ao abrir Dashboard, busca a configuração atual.
- `MachineGrid` aplica o número **efetivo = min(configurado, total ativo)** apenas quando `dashboardMachineOrderMode=priority`; modo padrão mantém seu comportamento. Contagem N pode ultrapassar os 14 cards de uma página: as N máquinas permanecem na ordem de prioridade ao longo das páginas; P1..Pn aparece em cada card. Para N>5, cada card recebe contorno próprio, evitando um wrapper de grid que ultrapassaria as colunas disponíveis; até 5 preserva o contorno do grupo anterior.
- **Sem mudanças nos tempos, alarmes, chamada real, produção programada ou KPI BI**.

## Segurança, compatibilidade e limites

- Nunca conceder escrita para `priorities.read` ou escopo selecionado.
- Count válido na gravação = inteiro entre **1 e o número de máquinas ativas** verificado no banco. A API existente impõe limite máximo do catálogo de 1.000 máquinas para o PUT.
- Mudança de máquina ativa para inativa pode reduzir o máximo entre sessões; o Dashboard clampa o número **efetivo** e a UI avisa que configuração antiga pode ter ficado acima do novo catálogo; ao salvar alteração de contagem exige novo intervalo.
- Estações simultâneas: `expectedPriorityHighlightCount` e `expectedMachineIds` são CAS distintos; 409 não salva parcialmente.
- O modo Dashboard **padrão** não exibe P1-Pn; habilitar modo **Prioridade** no Admin é condição prévia. Esse comportamento já existente permanece.
- Consulta de contagem via /api/system-settings é read-only; frontend não calcula permissão.
- Não alterar servidor industrial, PLC, Node-RED, banco real, certificado, firewall, KPI BI, histórico antigo, esquema de Machine, sessão ou política de som.

## Aceite notebook — após PR, CI, merge autorizado e atualização oficial

1. Backup/Health + SHA API/frontend e migração do campo aditivo conferidos.
2. Default = 5 em instalação anterior.
3. Selecionar 1, 3, 5, 8, 14, 15, 20 e N máximo ativo (quando existir tal quantidade), salvar e conferir P1..Pn em todos os cards e páginas.
4. Conferir contorno agrupado quando N≤5 e individual quando N>5; estados de falha/alerta permanecem prioritários e legíveis.
5. Inativar máquina → efetivo diminui; reativar → ranking recalculado. Nenhuma máquina inativa recebe destaque.
6. Testar modo Dashboard Padrão versus Prioridade.
7. Testar dois editores e conflito 409 para ordem e quantidade, confirmar ausência de atualização parcial.
8. Usuários com `priorities.read` apenas, escopo parcial, workstation não aprovada/revogada: nenhum controle de escrita.
9. Testar botão Histórico: Admin concede/remove `history.global.read`, `history.read`, `andon.read`; só mostrar nos ativos do escopo permitido, sem vazamento na API.
10. Visão Geral: nenhuma amostra → estado claro; métricas oficiais/cobertura/exceções corretas; histórico limitado ao permitido; mobile PT/EN/ZH e temas claro/escuro.
11. Testar sincronização entre duas workstations em até 20 s com Dashboard visível e navegação.
12. Rodar regressões PENTE 1 BI, PENTE 3 Histórico Global, navegação Hub/ANDON, alarmes/mute, ordenação/filtros e auditoria.

**Não declarar homologado comercialmente/fábrica até essa lista ser aprovada no notebook.**
