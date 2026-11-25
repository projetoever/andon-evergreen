# PENTE 6-D — Modernização da apresentação dos gráficos do ANDON BI

**Data:** 25/11/2026  
**Baseline:** main `f6a2ff7b8d63faa743f0913e77dbd44b820b0849` (PENTE 6-C).  
**Objetivo:** modernizar visualizações já existentes em cinco abas SEM redesenhar estrutura de navegação, alterar dados, reclassificar ocorrências ou substituir a biblioteca Recharts.

## Referências para implementação
- [Recharts — exemplos de barras, composições, linhas, roscas e interação](https://recharts.github.io/en-US/examples/)
- [IBM Carbon Design — anatomia dos gráficos](https://www.carbondesignsystem.com/building-blocks/data-visualization/chart-anatomy)
- [Microsoft Power BI — tipos de visualização e interpretação](https://learn.microsoft.com/en-us/power-bi/visuals/power-bi-visualizations-overview)

## Componentes alterados
- `biChartVisualTheme.ts` (novo): identidade visual compartilhada com paleta coerente, tooltip com borda/sombra, grade discreta e IDs de gradientes SVG únicos por instância.
- `BiChartAlternative.tsx`: rosca com fatias separadas/cantos suaves e **total observado no centro**, disco polido, linha e área com gradiente/realce nos pontos, Pareto com barras em gradiente e curva de percentual acumulado com referência 80%.
- `BiInlineDistributionChart.tsx`: barras horizontais mais espessas com cantos suaves/trilha sutil, valor exato persistente, gradiente local, controle visual por modo e legenda cromática da rosca associada à categoria (incluindo categorias que têm valor zero).
- `BiMaintenanceStackedChart.tsx`: barras horizontais empilhadas de trabalho técnico e acompanhamento com gradientes individuais, escala, legendas e rótulos diretos. A soma é de **horas por pessoa**, NÃO downtime físico da máquina.
- `BiChartExplorer.tsx`: versão ampliada acompanha a identidade de barras, tooltip e seleção, preservando CSV/tabela/drilldown.
- `BiDailyAvailabilityCard.tsx` / `BiDowntimeTrendCard.tsx`: barras temporais mais legíveis, sombras e tooltips consistentes; datas parciais não se tornam tendência causal.
- `BiTemporalPatterns.tsx`: colunas por horário e dia da semana com design coerente, mantendo total de chamados separado de minutos de parada.
- `visualMessages.ts`: vocabulário adicional PT/EN/ZH tradicional para centro da rosca.
- `tests/biPente6dVisualPolish.test.ts`: regressões de tema, IDs de gradiente, ausência de chamadas API novas, restrições de percentuais e nulos, preservação de CSV/drilldown e lógica de Pareto. Executar no `test:ui`.

## Políticas de integridade
- **Números, eventos e filtros** vêm dos snapshots já existentes, sem alterar nenhuma fórmula ou backend.
- `null` permanece **Sem amostra**, nunca `0`. Gráficos circulares continuam habilitados SOMENTE para composição aditiva e limitada a poucas categorias.
- A curva Pareto representa percentual acumulado sobre as categorias *exibidas*; não alterar universo/denominador e não confundir horas por técnico com tempo físico de parada.
- Modo Linha/Área segue dados temporais, sem conectar trechos nulos. Dias de borda podem ser parciais.
- Sem migrações, atualizações no PostgreSQL, permissões novas ou comunicação com PLC.
- Gradientes são detalhes visuais, com cores operacionais estáveis, sem adicionar significado de severidade por brilho. Não usar animações longas.

## Aceite
1. CI Windows/PowerShell 5.1, PostgreSQL isolado, API/backend, frontend/SSR, testes UI/i18n e browser desktop/mobile deve estar inteiramente verde.
2. Verificar pré-merge que diff afeta somente componentes de apresentação, i18n, documentação e suíte de testes.
3. Após integração, notebook de homologação deve atualizar somente por `main` com backup e conferir SHA; **não atualizar automaticamente o servidor industrial**.
4. Validar manualmente em tema escuro/claro, PT/EN/ZH, desktop/mobile e Firefox/Chrome: rosca com total, Pareto com 80%, barras de técnicos, linhas sem conectar N/A, tooltip, hover e drilldown.
5. Confrontar tabela/CSV vs. cada gráfico para o mesmo filtro e período. Qualquer discrepância numérica **reprova**.
6. Problemas históricos de responsabilidade pendente, cobertura de programação e MTBF parcial continuam na issue #637, independentes da modernização visual.

Roadmap mestre dos gráficos: issue #640.