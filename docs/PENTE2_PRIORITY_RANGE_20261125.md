> **ATUALIZAÇÃO DE ESTADO — DOC 1, 25/11/2026:** o documento foi escrito durante a implementação e pode conter estado anterior ao merge. O lote oficial [PR #646](https://github.com/projetoever/andon-evergreen/pull/646) foi integrado à `main`; complementos [#650](https://github.com/projetoever/andon-evergreen/pull/650) e [#652](https://github.com/projetoever/andon-evergreen/pull/652) também constam mesclados. O estado de destino exigido continua **homologação com dados isolados** (P1..Pn, permissões, CAS/409, migração e dashboard). Não inferir que a migração foi aplicada em banco industrial. Ver [DOC 1](DOC1_MARCO_20261125.md).

---

# PENTE 2 — Visão Geral, Histórico autorizado e faixa dinâmica P1..Pn

**Data:** 25/11/2026 · **Issue:** #614 · **Branch:** `pente/02-priority-range-overview-20261125`

**Base original auditada:** `main@f6a2ff7b8d63faa743f0913e77dbd44b820b0849` (PR #630 integrada).
**Base da PR sincronizada #646:** `main@62bfac192dd073d410b2af8893aafaf500eac069` (inclui PENTE 6D BI; suite `test:ui` reconciliada).
**Regra de entrega:** branch e PR de desenvolvimento, CI e autorização expressa antes de integrar na main. Nenhuma modificação ao servidor industrial.
**PR de integração:** #646 `pente/02-priority-range-overview-sync-20261125`; PR original #645 mantida apenas para rastreabilidade dos commits de desenvolvimento e falhas estáticas iniciais corrigidas. A decisão de integrar à main depende de CI verde no HEAD final.

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


## PENTE 2B — Navegação unificada (25/11/2026)

- A navegação agora tem quatro seções: Visão Geral, Sequência e Programação, Histórico e Auditoria e Ajuda e Orientações; o link de programação na Visão Geral abre a sequência.
- Os controles de cada máquina mostram o estado oficial de programação junto à ordem P1..Pn, com ação de alteração *somente* se a sessão operacional tiver `production.schedule.request` ou `production.schedule.write` e acesso à máquina. Máquinas inativas, estado desconhecido e escopo não permitido ficam em leitura.
- A ação reaproveita `/session` e `/machines/production-mode/session` ou o modal de segunda credencial existente, preservando CSRF/workstation, validação de `expectedProductionMode` e conflito 409, `machineScope` e auditoria. Não concede `production.schedule.write` por `priorities.write`.
- Antes da alteração operacional, não pode haver alterações pendentes de sequência/destaques; a ordem é recarregada após confirmar a operação. A ação operacional é independente do botão Salvar sequência.
- Revisados cabeçalho resumido, filtros com botão Limpar no topo, diagramação dos cards, botões e barra de salvar, mantendo modos read-only e PT/EN/zh-TW.

**Aceite no notebook (ainda pendente):** validar desktop/mobile e nomes longos; temas/idiomas; perfis com somente leitura, solicitação, escrita, acesso parcial e estação revogada; confirmação e cancelamento; conflito 409; reordenação com filtros; P1..Pn; Histórico/BI; backup/instalador. Nada foi instalado diretamente no ambiente industrial.


## PENTE 2C — Status clicável, confirmações ANDON e filtros alinhados (25/11/2026)

**Pedido de homologação visual:** imagens da aba "Sequência e Programação" mostram o popup nativo do navegador, CTA redundante com lápis e desalinhamento vertical entre busca e selects. Implementação em branch, **sem merge até aprovação expressa**.

- O próprio status `Produção Programada` (verde) ou `Fora de Produção` (âmbar) é o botão clicável, com hover, ring e foco acessível. O rótulo de ação fica somente no `aria-label`/`title`; removidos lápis e CTA visível. Usuários sem permissão recebem o badge somente leitura. Máquina inativa ou com programação desconhecida permanece somente leitura.
- Escrita autorizada exige confirmação no `ConfirmDialog` existente e segue usando `/machines/production-mode/session`, com `expectedProductionMode`, controle de concorrência 409, auditoria e toast padrão. Usuário apenas solicitante mantém o `ProductionModeCredentialModal`/aprovação one-shot. Nenhuma permissão é ampliada e o controle de `hasUnsavedChanges` é preservado.
- Confirmações de descarte em ações internas de recarregar/sair/navegação utilizam o `ConfirmDialog` do ANDON, sem `window.confirm` nesta página. O aviso `beforeunload` administrado pelo navegador ao fechar ou recarregar a aba permanece, pois não é substituível de forma segura por UI personalizada.
- Área de filtros utiliza labels `flex-col` com espaçamento fixo, controles `h-10`, ícone de busca centralizado verticalmente e ações do cabeçalho alinhadas. O cabeçalho da sequência tem hierarquia uniforme, a lista conserva IDs, timestamps, badges e ações. Layout desktop/tablet/mobile e PT/EN/zh-TW.
- Escopo de código: interface e testes. **Não modificar banco industrial, endpoints de autorização, métricas do BI, CLP, Node-RED ou certificados.**

**Gates para merge:** CI completo (Linux/PostgreSQL + Windows PowerShell, frontend/SSR), testes de não regressão e aprovação do usuário. **Depois de merge autorizado:** atualização do notebook pelo instalador oficial com backup; conferir as cores/hover/foco, edição autorizada, solicitação com credencial, 409, lista com filtros/nomes longos, modais, toasts, permissões, temas e traduções.
