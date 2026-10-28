# ANDON BI — Fase 2A | Transparência de amostras MTTR/MTBF

Data: 28/10/2026. Somente alteração analítica descritiva e de apresentação; **sem mudanças nas fórmulas oficiais, classificações, dados ou infraestrutura**.

## Diagnóstico
O piloto pode registrar downtime e MTTA enquanto MTBF/MTTR permanecem sem valor. Chamados atendidos não equivalem a falhas físicas encerradas de manutenção:
- MTBF programado exige programação verificável, ao menos uma falha de manutenção iniciada durante essa programação e nenhuma causa pendente/mista na população considerada.
- MTTR de restabelecimento exige episódios físicos encerrados no período e integralmente atribuídos à manutenção.
- O zero **não** substitui ausência de amostra.

## Campos adicionais (API /api/analytics/overview.production)
- `mtbfAvailabilityReason`: `available | dimension_filtered | insufficient_schedule | no_programmed_minutes | pending_attribution | no_maintenance_failures`.
- `mttrAvailabilityReason`: `available | pending_attribution | awaiting_restoration | no_closed_maintenance_episodes`.
- `closedPendingRestorationEpisodes`: episódios encerrados no período que ainda dependem de atribuição ou ficaram mistos.
- `openMaintenanceEpisodes`: episódios de manutenção abertos observados antes do fim da janela.
Os códigos têm escopo somente explicativo; `plannedMtbfMinutes`, `resolvedMttrMinutes`, denominadores, tempo de parada, disponibilidade, elegibilidade e `metricDefinitionVersion` permanecem inalterados.

## UX
- Cartões do BI apresentam motivo específico da amostra indisponível (em vez de apenas exibir uma contagem).
- PDF executivo utiliza as mesmas mensagens da UI, traduzidas PT/EN/ZH e com conteúdo escapado.
- Quando uma métrica oficial está disponível, o valor e a amostra continuam iguais.
- O valor descritivo `allCauseRestorationMinutes` não é promovido a MTTR oficial; é outra população, já existente na API.

## Homologação do piloto
1. Conferir no histórico da Máquina 37 a presença de paradas físicas reais e o encerramento delas.
2. Conferir responsabilidade e tratamento no BI atribuídos pelo diagnóstico auditável.
3. Confrontar o gráfico de paradas com episódios físicos e verificar horários de programação de produção (não confundir modo programado com escala de turnos).
4. Revisar dados de teste, duplicidades e registros com causa mista ou não identificada. Não alterar automaticamente classificação histórica.
5. Validar se o cartão correto exibe `—` com motivo explicativo, e se a metodologia corresponde aos dados.
6. Antes de alterar cálculo, comparar amostra real com os critérios de referência aprovados pela gerência.

## Limites
Sem migrações de banco, atualizações na Evergreen, Node-RED, GPIO, Mini PC ou instalações HTTPS. A Fase 1 ainda exige homologação de workstation; as mudanças B2.4C de escopo agregado não estão incluídas.
