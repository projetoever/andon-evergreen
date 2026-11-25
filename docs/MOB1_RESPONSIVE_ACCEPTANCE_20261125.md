# MOB 1 — Auditoria e estabilização da experiência mobile

**Produto:** ANDON Web Industrial — Evergreen  
**Data:** 25/11/2026  
**Referência de partida:** `main` em `9f6df886a170ff208a0a3d3841ddfd2f41b03644`  
**Branch de trabalho:** `mob1/mobile-responsive-baseline-20261125`  
**Status:** pacote de refinamento em branch de revisão; **não homologado / não integrado à main**.

## Princípios inegociáveis

1. Paridade funcional com desktop: não eliminar operações, dados, históricos ou ações autorizadas.
2. Permissão, escopo de máquina, autenticação, auditoria e bloqueios vêm da API; UI apenas apresenta funções já autorizadas.
3. **Somente apresentação**: sem schema/migrations, writes em banco, alteração em MTTR/MTTA/MTBF/KPIs, CLP/Node-RED, instalador ou política de workstations.
4. Traduções PT-BR, EN e chinês tradicional devem funcionar também com rótulos longos.
5. UI de 320–430 px, tablet e desktop; modos retrato/paisagem; acessibilidade por toque e teclado; sem impedir zoom.
6. No modal de teclado físico/virtual, conteúdo e confirmação devem permanecer alcançáveis.
7. Conservar alarmes semânticos, estados de produção e contraste de indicadores de falha.
8. Sem merge nem implantação industrial sem aprovação explícita do responsável.

## Inventário das superfícies e prioridades

| Área | Telas / subfluxos para homologação | Risco mobile / critério |
| --- | --- | --- |
| Hub | início, login, logout, autenticação, entrada de módulos | conteúdo não recortado, abas visíveis conforme permissão |
| Administração Hub | admin central/legado/gerente, usuários, estações, permissões, segurança, auditoria | menu categorizado acessível por toque, formulários inteiros |
| Dashboard ANDON | cards, indicadores, filtros, mute, navegação, prioridade | cards legíveis sem arrastar a página |
| Máquina | identificação longa, setores/grupos, estados, técnicos, produção, travamento | identidade não comprimida, todos os botões tocáveis |
| Abertura de chamado | tipo/motivo, grupo multissetor, OS obrigatória, ativo/conjunto, identificação | validações e confirmações alcançáveis com teclado aberto |
| Atendimento | iniciar, acompanhamento, múltiplos técnicos, devolução, finalizar, cancelar | sem alterar gates; botões finais alcançáveis |
| Histórico por máquina | filtros, registros, falhas, tempos, técnicos, BI elegível | leitura integral dos dados, sem sobreposição |
| Histórico global | listagem ↔ detalhe, filtros, busca, resumo e CSV | fluxo mobile list/detail preservado |
| Prioridades | visão geral, sequência/programação, histórico e ajuda | sidebar responsiva e status de programação acessível |
| BI | 5 áreas, filtros, KPIs, gráficos, detalhamento, Machine 360, cobertura, PDF | navegação compacta, gráficos explicáveis, dados íntegros |
| Administração ANDON | abas operacionais, setores/grupos, catálogos, máquinas, cores e sons | menu móvel com agrupamento; edição sem perda de campo |
| Componentes comuns | diálogo, confirmação, drawer, notificações, entradas e teclado | área visual dinâmica, alvos de toque e acessibilidade |

## Alterações implementadas no pacote MOB 1

- Administração HUB e ANDON: menu lateral mobile com agrupamento de seções via `Sheet`, indicação da seção atual e retorno; barra de tabs de tablet e sidebar desktop preservadas; a lista continua derivada dos itens fornecidos pelas páginas autorizadas.
- BI: seleção mobile de uma das cinco seções em controle nativo, barra de abas tradicional mantida em telas maiores; indicadores de qualidade no seletor.
- Histórico de chamados em tabela compartilhada: cards expansíveis no mobile com os mesmos campos da tabela de 17 colunas; tabela original continua visível em desktop.
- BI cobertura histórica: cards por máquina no celular e tabela original a partir de `sm`; métricas agrupadas sem obrigar três colunas estreitas.
- Machine 360: margens, título com quebra de linha e botões de fechar/exportar adaptados ao toque; desktop preservado.
- Componentes compartilhados de diálogo/confirmação/drawer: redução de padding mobile e área de toque melhorada em fechar.
- Layout geral: contenção de transbordamento horizontal em diálogos, rótulos longos e BI; navegação entre módulos pode quebrar linha em telas curtas.
- Testes: caso estático `tests/mobileCommercialBaseline.test.ts`, incluído em `test:ui`; fluxo browser existente de administração adaptado para realmente abrir o drawer no celular e verificar a seção/política sem assumir links ocultos.

## Plano de aceitação por viewport e cenário

| Largura × altura | Objetivo |
| --- | --- |
| 320×568 | caso crítico: não cortar ação nem formulário; nome longo e zoom |
| 360×640 | navegação, alertas, botões e modais com teclado aberto |
| 390×844 | cenário automatizado atual do navegador (Playwright) |
| 430×932 | smartphone maior, inclusive texto multilíngue |
| 768×1024 | tablet retrato |
| 1024×768 | tablet paisagem / ponto de transição de sidebar |
| 1366×768 | desktop industrial, regressão de diagramação |
| 1920×1080 | painel kiosk / dashboards com grade completa |

Testar Chrome Android e Safari iOS em aparelhos reais, além de Chromium/Firefox com emulação. Para cada largura, validar PT-BR, EN, zh-TW, claro/escuro, labels e nomes longos, perfil sem permissão versus autorizado, rede lenta e perda temporária de API.

### Casos de aceite P0

- Sem **horizontal overflow da página inteira**; tabelas de desktop e gráficos detalhados podem usar scroll próprio quando necessário.
- Interação por toque de pelo menos 44×44 px nos controles essenciais, sem botões inacessíveis e com foco visível.
- Abertura e confirmação de chamado com OS quando obrigatória; setor de grupo e duplicidade preservados.
- Encerrar/retornar/cancelar somente com permissões e credenciais devidas; nenhuma transação duplicada.
- Histórico global e por máquina exibem todos os dados, inclusive tempo e elegibilidade BI.
- Back/Hub/menus e retorno preservam estado; drawer fecha por seleção ou Escape.
- Modal com teclado nativo não encobre ações essenciais; modal não fecha inadvertidamente pela interação com teclado virtual.
- Indicadores de parada mantêm contraste e cores semânticas; BI sem amostra é distinguível de zero real.
- API fora do ar apresenta erro real, sem dados fictícios de LocalStorage.
- Admin e gerente enxergam apenas seções já liberadas pela aplicação.

### Casos de aceite P1

- Tempo de interação suave mesmo em telefone intermediário, sem renderização excessiva;
- PDF/CSV, download e feedback toast utilizáveis;
- filtros e seletores não provocam zoom involuntário ou navegação perdida;
- persistência de login e seleção de máquina não se deterioram por giro de tela / suspensão;
- testes de tradução multilíngue e tema visual preservam legibilidade.

## Verificações técnicas obrigatórias antes da aprovação

1. CI do pull request: `npm run typecheck`, `npm run build`, `npm run test:ui --prefix server`, backend build, demais suítes de autenticação/integração/analytics e browser Playwright já previstos no workflow.
2. Inspecionar capturas de 390×844 e 1366×768 geradas pela suíte `tests/browser/hubAdminNavigation.mjs`; ampliar a cobertura dos demais fluxos em rodada de homologação funcional.
3. Fazer smoke test real das telas do inventário, incluindo abertura e finalização de chamado em **base isolada**.
4. Comparar desktop visual antes/depois e verificar viewport 320×568 com teclado ativo.
5. Se houver falha de CI, corrigir na branch e atualizar o PR antes de pedir o merge.

**Limite de evidência no momento deste documento:** auditoria de código e implementação de refinamentos. Não afirmar aprovação em aparelhos físicos nem ausência de regressão sem execução observada do CI e homologação funcional.

## Controle de mudança

- Repositório: `projetoever/andon-evergreen`.
- Trabalhar somente na branch `mob1/mobile-responsive-baseline-20261125` até avaliação.
- PR como **draft**, sem auto-merge.
- `main`, servidor Evergreen, banco real, M37, CLP e rede fabril não alterados por esta tarefa.
