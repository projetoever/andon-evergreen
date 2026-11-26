# MAN-HIS-001 / MAN-BI-001 — Histórico e indicadores de desempenho

**Revisão:** 0.1 · Marco M1 (pré-entrega interna) · **Situação:** texto-base pendente de screenshots, dados reais homologados e aprovação dos indicadores.  
**Público:** analistas, líderes, manutenção, qualidade e usuários autorizados.  
**Fontes:** `src/pages/GlobalCallHistoryPage.tsx`, `src/pages/MachineCallHistoryPage.tsx`, `src/pages/AndonBiPage.tsx`, `server/src/analytics/`, [metodologia BI](../BI_METODOLOGIA_E_QUALIDADE.md).

## 1. História de um chamado: o que é verificável

Um registro pode conter OS, máquina, setor solicitado, grupo, datas, classificação, técnico(s), fases, impacto produtivo e diagnóstico. **Não confundir** o que o operador solicitou com o diagnóstico causal confirmado ao final. Os snapshots de motivo e ativo preservam nomenclatura histórica, inclusive após alterar os cadastros.

O mesmo evento físico de parada pode abranger dois chamados. Em uma máquina, períodos sobrepostos não podem ser simplesmente somados para estimar downtime. Tempos por técnico são uma medida própria.

## 2. Histórico por máquina

1. Navegue no Hub para ANDON e abra uma máquina autorizada.
2. Utilize a ação de histórico por máquina quando disponível (`/machines/:machineId/call-history` ou caminho compatível de histórico).
3. Selecione período e filtros presentes na versão instalada.
4. Abra o chamado e confira ID, máquina, OS, datas, motivo, diagnóstico e estado.
5. Verifique participações individuais dos técnicos, acompanhamento, retorno e o registro físico de parada quando houver.
6. Se o chamado não for elegível ao BI, identifique o motivo/critério registrado e não altere o cadastro apenas para “forçar” amostra.

**Permissões:** `andon.read`, `history.read` e escopo aplicável. A presença do botão deve refletir política do servidor.

## 3. Histórico Global

No acesso central, a rota `/history` apresenta lista de chamados e detalhe da ocorrência selecionada; no modo legado a experiência histórica é diferente. Para o manual final, produza screenshots **do modo realmente usado no destino**.

1. Abra Histórico Global pelo Hub com a concessão correspondente.
2. Consulte a lista cronológica, use filtros de máquina/período/estado conforme UI.
3. Selecione o chamado e observe o detalhe à direita/abaixo conforme viewport.
4. Verifique eventos de participação técnica e estados produtivos; a lista deve manter a seleção coerente durante navegação.
5. Exporte somente quando autorizado e com filtros aplicados.
6. Confirme se o CSV/arquivo corresponde à população consultada. O conteúdo não deve incluir registros de máquinas fora do escopo.

**Atenção:** `/history?machineId=...` contém um filtro, nunca um mecanismo de ampliação de permissão. Teste URL direta sem `history.global.read` e com máquina fora do scope.

## 4. Acessar o ANDON BI

1. No Hub, abra `/bi` com `bi.read`.
2. Verifique período, máquina, classificação e demais filtros antes de interpretar números.
3. Utilize as cinco seções: **Visão Geral, Confiabilidade, Falhas, Manutenção e Qualidade dos Dados**.
4. No gráfico, utilize funções de detalhamento disponíveis sem alterar a população efetiva.
5. Para comparações ou exportação, confirme se ambos os lados usam o mesmo filtro e fuso operacional.
6. Uma informação “Sem amostra” exige investigação dos vínculos, não preenchimento fictício.

## 5. Glossário dos indicadores do BI

| Indicador | Pergunta respondida | Cálculo/observação |
|---|---|---|
| MTTA | Quanto se aguardou até o primeiro atendimento? | Abertura → primeiro atendimento, somente chamados com amostra válida |
| MTTR físico | Quanto durou a restauração física da falha corretiva? | Episódios físicos encerrados atribuídos à manutenção; não é horas-pessoa |
| MTBF programado | Quanto tempo operacional ocorreu entre inícios de falha elegível? | Minutos programados em operação / início de episódios corretivos elegíveis, com cobertura causal |
| Disponibilidade | Que parcela do período programado estava em operação? | (tempo programado − união das paradas físicas) / tempo programado |
| Downtime | Quanto tempo físico de máquina foi perdido? | União de intervalos por máquina, sem duplicação por chamados |
| Taxa de retorno | Que parcela dos concluídos de manutenção retornou? | Chamados com ≥1 retorno / chamados concluídos elegíveis × 100 |
| Reincidência | Houve novo chamado com diagnóstico parecido? | Novo chamado após um anterior, com janela e matching de dados históricos |
| Horas técnicas | Qual a dedicação registrada dos técnicos? | União temporal por pessoa; pessoas diferentes podem ter períodos simultâneos |

Não denominar disponibilidade isolada como OEE. Não chamar MTTR físico de “média de tempo trabalhado pela manutenção”.

## 6. Como ler zero, ausência de amostra e estimativa parcial

**Caso A — Sem amostra:** zero chamados concluídos de manutenção elegíveis no período. Para retorno, denominador igual a zero: apresentar `Sem amostra`, ainda que haja chamados abertos.

**Caso B — Zero verdadeiro:** um chamado de manutenção elegível concluído sem retorno. Numerador 0, denominador 1: **retorno 0%**, não “Sem amostra”.

**Caso C — Dado parcial:** MTBF com uma falha comprovada mas outras de causa pendente; mostrar indicação de incerteza e diagnóstico do vínculo, sem afirmar valor oficial definitivo quando o método não o permite.

**Caso D — Downtime com origem não manutenção:** uma parada física por processo ainda prejudica disponibilidade quando ocorreu durante programação, mas não necessariamente entra no MTTR corretivo de manutenção. A separação é essencial.

## 7. Investigar “Sem amostra”

1. Confirme período, fuso e filtros.
2. Na aba **Qualidade dos Dados**, consulte abrangência do histórico de programação, motivos e classificações.
3. Verifique se o chamado foi concluído, se está marcado como teste do sistema e se há snapshot consistente.
4. Confirme se o episódio físico existe, foi encerrado e tem responsabilidade causal válida.
5. Confira a cobertura de produção programada da máquina; lacunas podem inviabilizar disponibilidade/MTBF.
6. Em caso de diagnóstico indevido, siga correção autorizada com PIN/permissão e auditoria; registre o antes/depois.
7. Recarregue a análise e compare contagem de amostra, não só o número gráfico.

**Não alterar dados apenas para “fazer aparecer KPI”.** Corrigir a origem é uma ação rastreada e precisa de justificativa e perfil.

## 8. Gráficos e detalhamento

- Barras, rosca, disco, Pareto, linha/área (conforme visão) são formas de exibir a mesma população filtrada, não indicadores independentes.
- A soma de percentuais e a base do Pareto só têm sentido com categorias e exclusões visíveis.
- Tooltips devem manter contraste em tema claro/escuro; nomes extensos e rótulos devem ser legíveis.
- Modal de análise deve conservar período, filtros, denominador e interpretação; ao expandir não deve comprimir a área útil.
- Exportação autorizada não deve ocultar `null`/cobertura e não pode usar dados de outra máquina.

## 9. Exemplo de calibração

Em um conjunto **fictício** de 4 chamados concluídos de manutenção, um deles retorna à manutenção duas vezes e os outros três nunca retornam. A taxa é 1/4 = 25%; os ciclos de retorno somam 2. Dois técnicos trabalhando ao mesmo tempo por 15 minutos não geram 30 minutos de downtime físico; o evento de parada precisa ser medido separadamente.

**Aceite antes de publicação:** `DOC1-QA-H09–H11`, `H15–H18`; anexar payload sanitizado e evidência gráfica para a mesma coorte.

## 10. Limites, suporte e referências

O BI deste piloto não promete certificação ISO/SMRP, integração corporativa não comprovada, redução de custo ou ROI medido. Indicadores precisam ser recalculados e conferidos em massa de teste e banco da instalação autorizada, antes de divulgação externa.

[Contrato BI](../DOC1_CONTRATO_BI_20261125.md) · [Metodologia oficial](../BI_METODOLOGIA_E_QUALIDADE.md) · [Histórico e acesso](../DOC1_AUTORIZACAO_MODULOS_20261125.md).  
**Status editorial:** screenshots/QA/revisão do especialista: pendentes.
