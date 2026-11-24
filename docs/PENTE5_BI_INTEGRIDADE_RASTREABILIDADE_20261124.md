# PENTE 5-BI — Auditoria de integridade de coortes e rastreabilidade
Data: 24/11/2026 · Issue #635 · PR draft #636 · Base `main@90e7e1445f7853df1b6448b387e9627ad5123c9a`

## Status real
Implementado **somente na branch** `pente/05-bi-integridade-coortes-20261124`.
NÃO integrado na `main`, NÃO instalado no notebook, NÃO homologado, banco de produção e servidor industrial NÃO consultados/alterados.
A captura com Disponibilidade 92,24%, MTTA 9h50 (3), Downtime 42h12, MTTR e MTBF sem amostra, retorno 0/0, cobertura 10/16 e quatro responsabilidades pendentes serve como hipótese para auditoria; **não prova** defeito nos dados.

## Evidência do P0 de código
1. `server/src/routes/analytics.ts` calculava tanto `causalEpisodes` quanto `correctiveCausalEpisodes`, porém passava a coorte geral a `buildPlannedProductionKpis`. O cartão MTTR/MTBF usa `overview.production`, enquanto o alias `overview.kpis.mttrMinutes` já usava a coorte corretiva. Dois caminhos podiam portanto discordar sobre Setup/Apoio.
2. `buildCorrectiveCausalEpisodes` mapeava uma origem comprovadamente não corretiva para `unassigned`. Passar diretamente esta coorte ao MTBF faria uma parada SETUP conhecida contar como **responsabilidade pendente** e indevidamente indisponibilizaria o indicador.
3. `biCausalCohortAudit.ts` usava a coorte geral, e o script read-only não carregava snapshots de Grupo do chamado vinculado; a explicação de exclusões não corresponderia ao KPI programado.
4. `overview.ts` já trata a taxa de retorno como (R/N×100), onde (R) é a quantidade de chamados concluídos corretivos de manutenção com `maintenanceReturnCount>0`, (N) os concluídos elegíveis. (N=0) devolve `null`/Sem amostra; (N>0), (R=0) devolve 0%, inclusive com múltiplos ciclos não duplicando chamados. A captura 0 de 0 requer auditoria do denominador.
5. A filtragem analítica geral por diagnóstico `analyticsEligibility` não equivale à coorte corretiva por Grupo. Quando o Grupo tem `analyticsDisposition != include`, sua efetiva exclusão dos volumes operacionais exige reconciliação SQL. Não se alterou esta regra sem conhecer a repercussão histórica e física.

## Semântica de contribuição confirmada no código
| Dimensão | Numerador / denominador | Condições e ressalvas |
|---|---|---|
| MTTA | Média de `attendedAt-openedAt` | Primeiro atendimento na janela, elegibilidade geral, Grupo corretivo elegível ou legado sem snapshot; sem atendimento não é zero |
| MTTR de restauração física | Somatório das durações integrais dos episódios físicos corretivos fechados / episódios corretivos fechados | Responsabilidade inteiramente manutenção, fim na janela, exclusões; não somar horas-homem |
| MTBF programado | Minutos programados em operação / inícios de episódios físicos inteiramente corretivos de manutenção na programação | Exige cobertura de modo em todos os instantes; pendências/misto bloqueiam a amostra; falha fora da janela não vira novo início |
| Disponibilidade | (Tempo programado − união de paradas físicas coincidentes)/Tempo programado×100 | Eventos reais de todas as responsabilidades; programação incompleta retira a máquina da cobertura |
| Downtime físico | Soma por máquina da união de intervalos físicos na janela | Independente de modalidade corretiva, sem dupla contagem por chamados/técnicos |
| Taxa de retorno | Chamados elegíveis concluídos com 1+ retorno / chamados elegíveis concluídos×100 | Retorno ao mesmo chamado, não reincidência nova; sem denominador = Sem amostra, 0 de N>0 = 0% |
| Horas técnicas | União temporal por profissional e fase conforme registradas | Não é parada física; Setup/Apoio podem ter horas legítimas |
| BI operacional | Chamados autorizados sob política de exclusões gerais | A exclusão explícita por Grupo requer reconciliação completa antes da mudança |

## Matriz de elegibilidade estrutural (participação efetiva depende dos filtros)
| Origem e condição | MTTA corretivo | MTTR/MTBF corretivos | Downtime físico | Disponibilidade | Horas técnicas | Retorno |
|---|---|---|---|---|---|---|
| Direto corretivo, evidências confirmadas | Candidato quando atendido | Candidato após causalidade física comprovada e programação no MTBF | Sim, se evento físico | Se coincide com programação | Se houve sessão | Se concluído e confirmado manutenção |
| Grupo corretivo com `eligible/include` | Candidato quando atendido | Candidato, mesmos gates de causalidade | Sim, se físico | Se programado | Se sessão | Se concluído, responsabilidade manutenção |
| Grupo SETUP `planned_setup/excluded/include` | Não | Não | Sim, se físico legítimo | Sim, se coincidir com programação | Sim, se registrada | Não |
| Grupo de apoio não corretivo | Não | Não | Sim, se físico legítimo | Se programado | Sim, se registrada | Não |
| Teste, falso chamado, duplicado, cancelado | Não | Não | Avaliar evento físico e exclusões próprias; não inventar | Avaliar evento físico real | Seguir coorte operacional documentada | Não |
| Corretivo com causa pendente/mista | MTTA pode existir | MTTR sem amostra para esse episódio; MTBF pode bloquear população | Preserva tempo físico real | Preserva tempo real se programado | Preserva sessões registradas | Sem responsabilidade comprovada não participa |
| Legado sem snapshot | Mantém fallback histórico | Exige evidência física/responsabilidade; não inventar Grupo | Conforme evento físico | Conforme programação | Conforme sessões | Conforme conclusão e responsabilidade |

## Alterações da branch (não constituem homologação)
- `causality.ts`: marcador interno `non_corrective_origin` exclusivo do cálculo corretivo; a atribuição física continua usando responsabilidades originais.
- `analytics.ts`: o cálculo de produção passa a receber `correctiveCausalEpisodes`.
- `biCausalCohortAudit.ts`: mesma coorte e exclusão explícita de Grupo conhecido. O script read-only carrega snapshots do Grupo da ocorrência e dos intervalos de impacto.
- `eligibility.ts`: `metricDefinitionVersion=bi-causal-2` para distinguir coortes antigas e corrigidas; sem migração/backfill de dados.
- Históricos global e da máquina: uma mesma ficha exibe origem por snapshot (ou legado desconhecido), política gravada, diagnóstico/responsabilidade e informações **estruturais** por indicador. Essa ficha não apresenta a participação efetiva como confirmada sem consulta ao período da API.
- Tradução PT/EN/ZH e regressões adicionadas a `test:analytics` e `test:ui`.

## Riscos e próximos gates
**P0:** executar CI e conferir tipos/testes, reproduzir em banco clonado/sintético com auditoria de episódios; verificar o efeito da política `analyticsDisposition` do Grupo sobre volumes operacionais sem excluir downtime físico.
**P1:** ampliar a auditoria por chamado com contexto autorizado de período/baseline/filtros, incluir motivo de cada exclusão por KPI e reconciliação SQL/API/UI/CSV/PDF, revisar Qualidade dos Dados e cross-machine scopes.
**P1:** homologação visual dos históricos e BI em notebook, três idiomas, dois temas e dispositivos 360/390/412 px.
**P0 de release:** nenhuma integração na main sem aprovação; não instalar em fábrica e não reclassificar históricos. CI verde não equivale a homologação física.

Links: https://github.com/projetoever/andon-evergreen/issues/635
https://github.com/projetoever/andon-evergreen/pull/636
Metodologia anterior: `docs/BI_METODOLOGIA_E_QUALIDADE.md` (versão `bi-causal-1`, retida como base histórica).
