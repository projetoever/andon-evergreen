# DOC 1 — Contrato de indicadores, origem de dados e transparência do ANDON BI

**Documento:** DOC1-BI-001 · edição 0.1 · 25/11/2026  
**Natureza:** complementa, **não substitui**, [BI — Metodologia, responsabilidade e qualidade](BI_METODOLOGIA_E_QUALIDADE.md), bem como a auditoria [PENTE 5-BI](PENTE5_BI_INTEGRIDADE_RASTREABILIDADE_20261124.md) e o diagnóstico [PENTE 5-C](PENTE5C_BI_SEM_AMOSTRA_DIAGNOSTICO_20261124.md).  
**Código verificado:** `server/src/routes/analytics.ts`, `server/src/routes/analyticsDataQuality.ts`, `server/src/analytics/`, `src/components/bi/`.  
**Estado:** definição de validação para baseline funcional `6018335c...`; não há amostragem da base industrial neste documento.

## 1. Princípio de interpretação

A elegibilidade de KPI é resultado de política de classificação, responsabilidade, tempo observado, programação e janela, não de expectativa sobre quantidade de chamados. **Nenhum gráfico deve substituir `null` por zero.** Uma parada física e um chamado são observações de granularidades diferentes. A ausência de falha atribuída à manutenção pode impedir MTTR/MTBF mesmo quando se observa parada total por outras responsabilidades.

## 2. Cinco espaços de análise

| Seção real da UI | Propósito | Controles de interpretação |
|---|---|---|
| Visão Geral (`overview`) | Indicadores de produção, coortes e visão executiva | Janela, máquina, cobertura, valores N/A |
| Confiabilidade (`reliability`) | Disponibilidade, paradas, MTBF/MTTR e análise de ativos | População e cobertura de programação, causa pendente |
| Falhas (`failures`) | Distribuição, Pareto, diagnóstico, recorrências | Distinguir setor solicitado, diagnóstico e responsabilidade |
| Manutenção (`maintenance`) | Atendimentos, técnicos, horas, participação, retorno | Tempo técnico não é downtime físico |
| Qualidade dos Dados (`data-quality`) | Cobertura, lacunas, incompletude e diagnósticos de amostra | Sem amostra versus valor zero, dados pendentes |

As abas são renderizadas por `BiWorkspaceTabs.tsx` dentro de `/bi`. A central tem modal explorador de gráficos e visualizações multimodo (barras, rosca, disco, Pareto, linha/área quando suportados), sujeitos a preservação de amostra.

## 3. Fontes e cálculo — contrato resumido

| Indicador | Unidade de observação | Denominador / regra | Quando exibir “Sem amostra” |
|---|---|---|---|
| MTTA | Chamado com primeiro atendimento na janela | Abertura → primeiro atendimento, média dos casos válidos | Nenhum atendimento válido |
| MTTR físico de manutenção | Episódio físico encerrado, inteiramente manutenção corretiva | Soma do tempo de restauração / episódios elegíveis | Nenhum episódio elegível |
| MTBF programado de manutenção | Intervalos de operação programada e episódios elegíveis | Minutos operacionais programados / inícios de episódios elegíveis, com cobertura causal | Sem falha elegível ou cobertura inconclusiva para indicador oficial |
| Disponibilidade programada | Máquina × programação histórica | (Minutos programados − união de paradas nesses intervalos) / minutos programados | Cobertura incompleta, desconhecida ou sem tempo programado válido |
| Downtime físico | Intervalo físico da máquina | União de intervalos por máquina na janela; somatório entre máquinas | Não converter falta de observação em falso zero |
| Taxa de retorno | Chamado concluído elegível de manutenção | 100 × chamados com ≥1 retorno / chamados elegíveis concluídos | **Denominador 0** |
| Tempo técnico | Sessão/participação de técnico | União temporal por pessoa; pessoas diferentes podem se sobrepor | Dados de sessão ausentes; não inferir horas |
| Reincidência de diagnóstico | Novo chamado após encerramento anterior | Janelas de 24h/7d/30d por máquina e diagnóstico | Identidade histórica ou sequência temporal insuficientes |

**Retorno:** quando denominador é positivo e numerador zero, mostrar **0%**. Quando denominador é zero, mostrar **Sem amostra** e `0/0` apenas como contagem contextual — jamais converter em 0%. Vários retornos do mesmo chamado contam uma única vez no numerador da taxa, com ciclos exibidos separadamente.

**MTBF parcial:** a estimativa provisória pode coexistir com causas pendentes. Rotular explicitamente como provisória; não convertê-la em meta contratual nem valor consolidado sem esclarecer causa e denominador.

**MTTR físico:** duração de episódio de parada até restauração, e não soma de atendimentos ou horas-pessoa. A existência de chamado `finished` não comprova parada física elegível.

## 4. Superfície de API verificada no repositório

| Método e rota | Finalidade técnica |
|---|---|
| `GET /api/analytics/filter-options` | Catálogos/filtros disponíveis |
| `GET /api/analytics/overview` | Visão geral e coortes |
| `GET /api/analytics/temporal` | Padrões temporais |
| `GET /api/analytics/machine-360` | Detalhe por máquina |
| `GET /api/analytics/failure-intelligence` | Falhas e diagnóstico |
| `GET /api/analytics/maintenance` | Participação e horas técnicas |
| `GET /api/analytics/reliability` | Confiabilidade e ativos |
| `GET /api/analytics/drilldown` | Exploração/detalhamento |
| `GET /api/analytics/data-quality-details` | Evidências de qualidade e amostra |

Permissão central `bi.read` para consulta, com filtro por máquina e sessão; exportações usam regras próprias, incluindo `bi.export` quando aplicável. Verificar cada handler e versão do runtime antes de publicar contratos JSON detalhados.

## 5. Coorte causal e origem dos dados

| Fonte de banco | Contribuição | Armadilha comum |
|---|---|---|
| `AndonCall` | Datas de abertura, primeiro atendimento, conclusão, retorno, diagnóstico | Confundir número de chamadas com número de falhas físicas |
| `AndonCallReasonSnapshot` | Motivo e política capturados ao abrir | Aplicar retroativamente regra nova sem histórico |
| `FailureEvent` | Intervalos físicos, condição e causa de parada | Somar eventos sobrepostos como downtime adicional |
| `CallImpactInterval` | Intervalos em que um chamado responde por impacto | Usar apenas `callId` corrente do evento físico |
| `MachineProductionEvent` | Janela real de programação por máquina | Usar `Machine.productionMode` de hoje para reescrever o passado |
| `TechnicianSession` / `TechnicianTimeAllocation` | Tempos por pessoa/fase | Multiplicar disponibilidade/downtime por pessoas simultâneas |
| `FailureClassification` | Responsabilidade final e disposição de análise | Presumir que setor solicitado é responsabilidade causal |
| `AuditEvent` / `FailureDiagnosisAudit` | Alterações reais e reclassificações | Tratar clique como reclassificação bem-sucedida |

## 6. Testes de calibração mínimos antes de publicar relatório externo

| Referência | Massa controlada | Esperado |
|---|---|---|
| BI-01 | Nenhum chamado concluído elegível | Retorno “Sem amostra”, não 0% |
| BI-02 | Um chamado corretivo concluído, zero retornos | Retorno 0% (1 denominador) |
| BI-03 | Um chamado corretivo concluído, dois retornos | Taxa 100%, ciclos 2 |
| BI-04 | Chamado corretivo sem evento físico de parada | MTTR não deve ganhar episódio inexistente |
| BI-05 | Um episódio físico elegível concluído | MTTR pode possuir amostra 1 após validação causal |
| BI-06 | Um evento físico de duas chamadas simultâneas | Downtime une tempo e não duplica |
| BI-07 | Uma falha de processo/Setup, não manutenção | Não contaminar MTBF/MTTR corretivo |
| BI-08 | Programação desconhecida ou intervalos incompletos | Cobertura/MTBF/Disponibilidade condicionados e explicados |
| BI-09 | Classificação corrigida sob PIN/permissão | Diagnóstico histórico auditado e coortes recalculadas corretamente |
| BI-10 | Mesmos filtros em card, gráfico, tabela e CSV | Valores e população idênticos |
| BI-11 | Mudar tipo de gráfico sem alterar período | KPI, N/A e denominador invariantes |
| BI-12 | Modo claro/escuro e PT/EN/zh-TW | Legendas, tooltips e rótulos íntegros |

Todos os cenários acima têm status **não executado** nesta edição. Executar em laboratório isolado, registrar `SHA`, amostra e evidência do endpoint/relatório e cruzar com [DOC1-QA](DOC1_HOMOLOGACAO_GUIADA_20261125.md) antes de afirmar precisão dos dados industriais.

## 7. Regras editoriais para o Manual BI

- Sempre mostrar **período**, fuso, filtros, população e quantidade de amostras quando a interpretação puder mudar.
- Separar **zero observado** de **Sem amostra** e de cálculo **provisório**.
- Explicar à liderança diferença entre parada produtiva, tempo de manutenção e presença de equipe.
- Ao mostrar Pareto 80%, explicar que é referência visual calculada sobre categorias filtradas, não limite obrigatório.
- Exibir qualidade de dados e pendências de classificação ao lado dos indicadores; não esconder para “embelezar” o dashboard.
- Não alegar certificação ISO/SMRP ou ganho percentual de produção sem verificação independente.

**Controle de mudança:** alterações estéticas da PR #644/#649 não devem alterar cálculo, API nem elegibilidade. Qualquer evolução futura das fórmulas deverá atualizar `BI_METODOLOGIA_E_QUALIDADE.md`, adicionar testes de regressão e versionar a política.
