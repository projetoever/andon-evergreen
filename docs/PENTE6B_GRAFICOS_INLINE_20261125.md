# PENTE 6-B — Gráficos interpretativos visíveis no dashboard
Data: 25/11/2026. Baseline main: `5a76308ef0d14631d37c6c6226b43357d751a9f0`.

## Motivo da correção
A homologação do PENTE6-A revelou que o seletor de visuais estava principalmente dentro do modal "Explorar gráficos". O usuário seguia vendo barras finas de progresso, sem eixos, na aba Manutenção. Visualmente a atualização parecia mínima.

Captura da aba Manutenção (7 dias): 437h20 de atendimento técnico e 4 min de acompanhamento; 399h29 com responsabilidade de ocorrência pendente e apenas 37h54 em Manutenção; 5 técnicos, 3 sessões ativas, 38/38 sessões com fase explícita. Horas por técnico na captura: Jorge 149h52, Vitor 140h30, Daniel 124h19, Vini 21h31 e Celso 1h11. A soma de horas por pessoa não é downtime físico, e o dado pendente não pode ser automaticamente reclassificado como Manutenção.

## P0 entregue nesta PR
- `BiMaintenanceStackedChart`: gráfico horizontal em barras empilhadas de Manutenção/Acompanhamento, escalas explícitas em horas e tooltip com minutos precisos. Dois painéis, por técnico e por área, agora abrem em modo **Gráfico**, com seletor **Tabela de dados** para preservar a navegação por registros e paginação. Alerta quando a responsabilidade pendente representa >=40% do total de horas.
- `BiInlineDistributionChart`: visualização incorporada, não modal, de categorias com eixos, tooltip, escolha entre Barras/Pareto/Rosca/Disco conforme segurança semântica existente, e seleção de categoria para drilldown autorizado. Incluído em:
  - **Falhas**: classificação Pareto e demanda por setor; listas originais permanecem em seção expansível
  - **Confiabilidade**: ranking das 8 máquinas críticas por minutos reais de parada, acima da tabela Machine 360
  - **Qualidade**: dois gráficos separados — alertas do estado atual e pendências da janela selecionada. Não oferecem rosca/Pareto porque categorias podem se sobrepor e têm bases temporais distintas.
- `BiChartExplorer`: nos cartões da **Visão Geral** (e nos demais componentes com gráfico incorporado), alternância de Barras/Linha/Área/Pareto/Rosca diretamente no cartão quando permitida, antes de abrir o modal. Não altera as linhas de dados passadas ao componente; mantém modal, tabela, CSV e inspeção.
- PT/EN/zh-TW para todos os novos textos literais.
- Regressões `tests/biPente6bInlineCharts.test.ts` incluídas no `test:ui`.

## Precisão e critérios de aceite
- **Sem modificações no PostgreSQL, API, regras de tempo, programação, causalidade, classificação ou retorno**. Tudo é apresentação de snapshots existentes.
- Não usar rosca para disponibilidade % de dias, qualidade com categorias sobrepostas, valores nulos, negativos ou excessivas categorias. Sem N/A=0.
- No comparativo técnico, atendimento/acompanhamento representam **horas de pessoa** e podem ser simultâneas entre diferentes técnicos. O tempo físico de parada da máquina é indicador separado.
- Quando a participação de responsabilidade pendente é significativa, chamar atenção para diagnóstico com PIN e auditoria; não corrigir silenciosamente. Ver issue #637.
- A CI de PR precisa aprovar Windows PowerShell 5.1, build, PostgreSQL isolado, testes analytics, frontend, i18n e navegador antes de permitir merge à main.
- Depois do merge, a homologação manual no notebook deve conferir os visuais **na página sem abrir o modal**, layout desktop/mobile, tabelas, seleção, horas exibidas e PDF/CSV. Se o total diferir do painel anterior ao alternar gráfico, reprovar.
- A entrega não altera servidor industrial automaticamente.

Roadmap geral #640, auditoria dos indicadores #637.
