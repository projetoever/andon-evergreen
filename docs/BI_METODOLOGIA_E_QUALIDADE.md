# BI — metodologia, responsabilidade e qualidade

Definição `bi-causal-1`, revisão de 15/10/2026. Este documento descreve o código desta revisão; a instalação do piloto só muda após atualização manual e migration. Não implica certificação ISO/SMRP nem integração com ferramentas externas.

## Referências pesquisadas

As fontes são documentação oficial de fornecedores de manutenção e de plataformas analíticas. Power BI e Tableau orientam a modelagem; não são os autores de uma fórmula industrial universal. Não foi estabelecido um ranking de participação de mercado.

| Referência oficial | Aplicação nesta revisão |
| --- | --- |
| [IBM — MTTR](https://www.ibm.com/think/topics/mttr) e [MTBF](https://www.ibm.com/think/topics/mtbf) | Distinguir restauração, tempo operacional e quantidade de falhas; explicitar começo/fim e amostra. |
| [Fiix — documentação do MTTR](https://helpdesk.fiixsoftware.com/hc/en-us/articles/213705683-Mean-time-to-repair-MTTR) | Definir o restabelecimento até retorno à operação, separado de trabalho individual; decompor as fases em vez de somar pessoas como downtime. |
| [Microsoft Power BI — star schema](https://learn.microsoft.com/en-us/power-bi/guidance/star-schema) | Manter grãos consistentes: chamado, episódio físico, sessão técnica e programação. Preservar atributos históricos. |
| [Tableau — relationships versus joins](https://help.tableau.com/current/pro/desktop/en-us/datasource_relationships_learnmorepage.htm) | Evitar multiplicação de medidas ao relacionar registros de granularidades diferentes. |
| [Vorne/OEE — cálculo de OEE](https://www.oee.com/calculating-oee/) | Disponibilidade = operação / produção planejada; não apresentar disponibilidade isolada como OEE. |

Fontes consultadas em 15/10/2026. Há definições diferentes de MTTR no mercado: esta aplicação adota explicitamente **MTTR de restabelecimento físico**, não tempo ativo de reparo nem horas-homem. O artigo da IBM contém uma inconsistência numérica no texto do exemplo (a divisão demonstrada é 3/2 = 1,5); os testes usam aritmética própria, sem reproduzir esse erro.

## Fontes e cálculos

Janela histórica semiaberta `[início, fim efetivo)`, limitada pelo relógio do servidor e exibida no fuso operacional. Durações usam instantes reais, não horários de texto. Médias vazias são `null`/travessão. Os totais são agregados antes do arredondamento; percentuais de máquinas não são simplesmente promediados.

| Indicador/visão | Entradas e regra | Limites e exclusões específicas |
| --- | --- | --- |
| Disponibilidade programada | Soma dos minutos programados menos união das paradas coincidentes, dividida pela soma dos minutos programados. | Mantém perdas reais de **todas** as responsabilidades. Exige cobertura completa de modo de produção por máquina, a partir do cadastro. Lacunas, conflitos ou modo desconhecido retiram a máquina da população e aparecem na cobertura. |
| MTBF programado de manutenção | Minutos programados em operação, descontadas todas as paradas reais, / inícios de episódios inteiramente atribuídos à manutenção dentro da programação e da janela. | Episódio iniciado antes da janela não é nova falha. Sem início elegível ou com episódios pendentes/mistos na população programada, indisponível. Não usar chamados ou sessões como denominador. |
| MTTR de restabelecimento | Duração **integral** dos episódios físicos encerrados na janela e inteiramente atribuídos à manutenção / número desses episódios. | Exclui outras responsabilidades, causas pendentes e mistas do numerador **e** denominador. Paradas ainda abertas não são reparos de duração zero. Pode incluir tempo anterior ao início da janela. |
| MTTA | Abertura até primeiro atendimento dos chamados cujo primeiro atendimento ocorreu na janela. | Chamados reais de todas as áreas; não representa tempo exclusivo de trabalho técnico. Sequência temporal negativa não vira amostra zero. |
| Atendimento técnico médio por chamado | Média de `attendanceMinutes` dos chamados concluídos na janela, com valor finito não negativo. | Tempo do fluxo, inclusive apoio a outras áreas; separado do MTTR físico. Não soma técnicos. |
| Acompanhamento médio | Média de `postMaintenanceMinutes` válidos dos chamados concluídos na janela. | Tempo do fluxo, não tempo físico de parada. |
| Duração média do chamado | Abertura até conclusão dos chamados concluídos na janela. | Não adicionar esta medida à parada física nem ao atendimento. |
| Chamados abertos/concluídos | IDs distintos por `openedAt` / `finishedAt`, respectivamente. | Coortes distintas: aberturas e conclusões não são um funil da mesma população. |
| Chamados ativos e alertas >24h | Snapshot atual de chamados, sessões ou eventos abertos. | Não representa o estoque no fim de um período histórico. O filtro de classificação final não deve esconder atividade ainda sem diagnóstico. |
| Parada global e Pareto de máquinas | União temporal de `FailureEvent` por máquina recortada à janela; soma de máquinas diferentes. | Dois chamados, dois técnicos ou registros sobrepostos não duplicam um minuto da mesma máquina. Não apagar perda real por atribuí-la fora da manutenção. |
| Parada por responsabilidade | Interseção da união física com `CallImpactInterval` e o diagnóstico final do chamado responsável. | Intervalos de impacto têm precedência sobre o último vínculo `callId` do evento físico. Na ausência deles, usa snapshot do evento. Lacunas/causas conflitantes ficam pendentes; a soma reconcilia com a parada global, salvo arredondamento de centésimos. |
| Eventos e episódios físicos | Eventos são registros distintos; episódios são a união física por máquina, inclusive intervalos que se tocam sem operação observada entre eles. | Evento, chamado e falha de manutenção são unidades diferentes. Não interpretar contagem bruta de eventos como MTBF. |
| Taxa de retorno à manutenção | Chamados concluídos atribuídos à manutenção com ao menos um retorno / chamados concluídos atribuídos à manutenção. | Vários retornos de um chamado não duplicam o numerador. Ciclos são mostrados separadamente. Não é reincidência de um novo chamado. |
| Reincidência de diagnóstico 24h/7d/30d | Novo chamado de mesma máquina e diagnóstico depois da conclusão anterior, com retrospecto de 30 dias. | Não presume mesma causa raiz. Chamados simultâneos não são nova falha posterior. Conjunto/subconjunto exigem identidade histórica; desconhecido não é correspondência. |
| Classificações e setores | Classificação: chamados concluídos; setor: destino originalmente solicitado nas aberturas. | Contagem de chamados, não duração nem prova de responsabilidade causal. A classificação final não reescreve o destino solicitado. |
| Horas técnicas e participação | União temporal por identidade de técnico, recortada à janela; pessoas diferentes podem somar horas simultâneas. | Apoio de manutenção a processo/qualidade continua contado. IDs repetidos e sobreposição da mesma pessoa não duplicam horas. Conflito de fase fica sem fase comprovada; não inventar distribuição entre chamados. |
| Padrões temporais | Aberturas por hora local; minutos físicos repartidos pelas horas/dias atravessados. | Distribuição bruta, não risco relativo: sem exposição por turno não comparar taxas de falha. Empates de pico são preservados. |
| Intervalo por calendário | Exposição calendário desde o cadastro menos parada da população / episódios dessa população. | Mantido como estimativa auxiliar de intervalo entre **paradas de todas as causas**, com chaves legadas `mtbfEstimatedMinutes`. Não confundir com MTBF técnico programado. |
| Cobertura e qualidade | Amostras, causas pendentes, exclusões e registros abertos/sem diagnóstico/sem vínculo. | Falta de dado não é zero nem comprovação de ausência de falha. Evento sem chamado pode ser legítimo. |

A comparação histórica usa período anterior de igual duração **já observada**. Um dia parcial não é comparado silenciosamente com 24 horas completas. Não se anuncia comparação sazonal/por turno nem ajuste por volume de produção.

## Elegibilidade comum

As APIs de overview, confiabilidade, inteligência de falhas, Machine 360, reincidência, participação, padrões temporais e detalhamento compartilham a mesma política. O PDF usa essas mesmas APIs.

1. Teste automático (`isSystemTest`) fica fora dos indicadores comuns.
2. Classificações possuem `Tratamento no BI`: ocorrência real, teste, falso chamado ou duplicado. Os três últimos ficam fora de contagens, durações, médias, reincidência e horas técnicas. Permanecem no histórico operacional e na auditoria.
3. Identificadores reservados exatos como `test`, `teste`, `system_test`, `false_call` e `duplicate` são excluídos mesmo sem flag automática. Não se usa busca genérica por texto: “teste de sensor após reparo” pode descrever trabalho legítimo.
4. Classificações genéricas (`unclassified`, `unidentified_stop`, `real_machine_failure`) são diagnóstico ausente na cobertura e não geram Pareto de diagnóstico ou reincidência.
5. Chamados cancelados saem das métricas de chamado; cancelar um chamado, por si só, **não invalida uma parada física real**. Exclusão física exige teste/diagnóstico inválido no evento ou chamado vinculado.
6. Repetição do mesmo ID é deduplicada. Dois chamados simultâneos legítimos não são descartados por semelhança. Uma duplicidade operacional deve ser explicitamente classificada como tal e referenciar o original na descrição.
7. Valores ausentes, negativos ou cronologia inválida não são convertidos em reparos/atendimentos de zero minuto. Não há remoção automática de ocorrências longas: os alertas permitem investigá-las.

Uma chamada falsa não deve servir para esconder uma parada física efetivamente observada. Se um registro inválido foi usado indevidamente para representar uma parada real, revisar e preservar o evento físico correspondente antes de excluir a ocorrência. A aplicação não pode inferir a verdade operacional sem evidência.

## Cadastro e preservação histórica

Em ANDON → Configurações → Classificações, defina a responsabilidade: Manutenção, Operação, Processos, Qualidade, Liderança, Outros ou Pendente. Defina também o tratamento no BI. Responsabilidade e exclusão são dimensões independentes.

Ao concluir o chamado, o backend captura a política do catálogo no próprio diagnóstico. O setor originalmente chamado, a identidade dos técnicos e os horários permanecem intactos. Trocar o catálogo não reclassifica snapshots já registrados.

Para revisar uma ocorrência anterior, use a edição de diagnóstico no histórico com PIN. A mudança explícita registra responsabilidade e tratamento anteriores/novos na auditoria. Selecionar o mesmo diagnóstico pode registrar o snapshot ausente de um legado; não há backfill automático de responsabilidade na migration.

Legados permanecem com responsabilidade desconhecida. Até a revisão, suas perdas entram na disponibilidade e na parcela pendente, sem serem anunciadas como falhas de manutenção. Para legados sem snapshot de tratamento, uma exclusão explícita no catálogo vale como regra de saneamento; isso é indicado como política legada, não uma alteração dos registros brutos. Causas mistas e pendências impedem um MTBF aparentemente melhor por falta de identificação; o MTTR continua mostrando apenas sua amostra confirmada, com quantidade explícita.

## Atualização, compatibilidade e validação

- Migration aditiva: `20261015210000_bi_causal_eligibility`. Acrescenta campos, preserva dados e rejeita valores inválidos por constraints. Sem exclusão, reset ou reescrita dos históricos existentes.
- Backup do banco e dos arquivos antes da atualização manual do piloto. Após atualizar, gerar Prisma Client, aplicar migrations e compilar conforme o procedimento oficial do instalador. Nenhuma alteração remota do piloto foi executada por esta revisão.
- As rotas e os payloads operacionais existentes foram preservados; os campos novos são aditivos. A integração física com sirene/GPIO e o fluxo Node-RED instalado não foram executados neste ambiente. **As definições analíticas mudam deliberadamente**, inclusive o alias legado `kpis.mttrMinutes`, agora coerente com o MTTR físico de manutenção. Consumidores de `/api/analytics/*` devem observar `metricDefinitionVersion = bi-causal-1`.
- Testes específicos: transferência de causa com conservação de minutos, causas mistas/desconhecidas, exclusões, IDs repetidos, horas sobrepostas, parada anterior à janela, parada aberta e sequências inválidas. Integração em PostgreSQL isolado valida todos os endpoints e estabilidade dos snapshots após editar o catálogo.
- Os testes não certificam o cadastro nem os apontamentos do piloto. Após atualizar, configurar o catálogo, revisar os legados relevantes e reconciliar uma amostra manual com chamados, paradas e sessões reais.

## Dados ainda necessários para novos indicadores

Não calcular OEE completo sem quantidade total/boa/refugada e ciclo ideal por produto. Custos exigem tarifas e materiais; cumprimento de preventiva exige plano e ordens previstas; backlog exige demanda e capacidade; tempo ativo de reparo exige fases confiáveis de execução/espera. Esses indicadores não foram fabricados a partir de duração de chamados.
