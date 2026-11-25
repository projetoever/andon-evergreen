# PENTE 6-C — Layout, legibilidade e expansões do ANDON BI
Data: 25/11/2026. Baseline oficial: main `9750cf4e9a96c36e14ca61dae5f89a79b3718dfd`. Evidência: quatro capturas de notebook de homologação em resolução 1666 × 896.

## Diagnóstico das capturas
1. **Confiabilidade / Bad Actors:** altura do gráfico 205px e da tabela restante controlada pelo viewport `lg:h-full` do cartão e pelo `lg:overflow-hidden` do workspace. A última tabela ficava reduzida a uma única linha de cabeçalho sem área de dados.
2. **Modal de cobertura histórica por máquina:** repetia o mesmo conceito (estado atual ≠ histórico), não priorizava as seis máquinas sem programação, mostrava 16 linhas de forma indiferenciada e usava fontes pequenas. Exemplo da captura: 16 população, 10 completos, 6 incompletos IDs 10, 11, 15, 17, 37, 38; máquina 12 tinha histórico completo sem programação. Os IDs vêm do banco, não são codificados no modal.
3. **Qualidade dos Dados:** gráficos de alertas zerados consumiam grande altura mesmo sem barras; painel lateral de texto excedia a importância da lista; lista com `lg:overflow-hidden` e baixa altura útil.
4. **Falhas / Classificações:** detalhes expandiam dentro de card sem crescimento vertical porque o workspace era comprimido, deixando a lista no limite inferior da tela. Mesmo problema potencial em Setores.

## Implementação (apenas frontend)
- `AndonBiPage`: todas as abas analíticas, exceto visão geral, têm rolagem vertical própria no workspace. Evita compressão por `lg:overflow-hidden`; filtros, abas e rodapé continuam presentes.
- `BiBadActorsPanel`: reduz levemente o espaço superior do gráfico para 190px, garante área mínima de 242px para tabela com máximo 360px e rolagem horizontal/vertical independente; cabeçalho fixo, 880px mínimo de conteúdo e fonte 13px; linhas mais altas. Os dados e o Machine360 permanecem iguais.
- `BiProductionCoverageDialog`: resumo de população/completos/incompletos, percentual da cobertura exibido no idioma, lista prioritária dos IDs incompletos, texto único sobre interpretação e filtro **Incompletas (padrão) / Completas / Todas**. A tabela tem linhas e fontes maiores, cabeçalho fixo e altura responsiva. Situação do modo não programado preservada (histórico completo conta na cobertura, mesmo sem acrescentar minutos ao denominador). Nenhuma inferência de estado atual ou preenchimento de histórico.
- `BiDataHealthPanel`: quando todos os alertas são zero, apresenta estado confirmado de zero em vez de grandes eixos vazios; separa snapshot atual de histórico; amplia tabela e sua área de rolagem; o texto “Leitura do alerta” vira `details` secundário abaixo da lista para não disputar espaço. Zero é somente mostrado quando o dado real é explicitamente zero, nunca para `null`.
- `BiFailureWorkspace`: cards têm altura natural, lista detalhada amplia com scroll interno até 300px; maior padding/fonte, posição da expansão sem corte, seção inteira rolável. Mantém drilldown em Classificações e Setores e seleção de chart.
- `BiSampleDiagnosticsPanel`: tabela de rastreabilidade com rolagem até 288px, fonte 12px e cabeçalho fixo.
- Tradução PT/EN/zh-TW dos novos textos e teste `tests/biPente6cLayout.test.ts` no `server/package.json`.

## Critérios para CI e homologação
- Windows PowerShell 5.1, testes de analytics existentes e de BI, API/PostgreSQL isolado, i18n, build TypeScript/frontend SSR, testes funcionais desktop/mobile e segurança sem falha.
- Não foram modificados indicadores ou fórmulas de MTTR/MTTA/MTBF/disponibilidade/retorno, regras de elegibilidade, endpoints ou dados PostgreSQL. Não há migration. Mantida paridade de tabela/CSV/drilldown, ACL e N/A diferente de zero.
- Após merge, notebook: backup; atualizar `main`; conferir SHA; limpar cache com Ctrl+Shift+R; verificar com 100% de zoom e 1366px/1666px de largura: Confiabilidade tabela com linhas visíveis, cobertura com aba incompletas, Qualidade sem gráficos de zero desproporcionais e lista acessível, Falhas detalhes expandidos com scroll.
- Repetir com dados não zerados e alguns `null` e comparar KPIs com baseline anterior antes de aceitar. Qualquer inconsistência numérica reprova.
- Nada é publicado no servidor industrial automaticamente; aceitação visual manual permanece pendente até capturas do notebook.

Issues: #640 (melhorias de gráficos) e #637 (precisão/qualidade dos indicadores).