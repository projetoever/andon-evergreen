# PENTE 5-B — Uma amostra, transparência de coortes e modais consistentes
Data: 24/11/2026. Base: main `39b7fde5c376dc32894d3e6b64edeb854a9a0a46`.
Escopo: notebook de homologação; não foi consultado nem alterado banco físico de produção.

## Evidência das capturas de usuário
- Janela 7 dias, 95,6% disponibilidade, 10/16 máquinas com cobertura, 324h07 de downtime físico e 5 episódios registrados.
- MTTA: 9h50 com 3 amostras — prova de ingestão de registros atendidos.
- MTTR: "Sem amostra" porque 3 paradas encerradas ainda não possuem responsabilidade confirmada (conforme diagnóstico da própria API).
- MTBF: "Sem amostra" com 1 episódio pendente/misto na coorte de produção programada.
- Retorno: 0/0 de manutenção, não equivale a zero retorno sobre uma população elegível: faltam chamados concluídos corretivos com domínio manutenção confirmado.

## Políticas e correção
- 1 ocorrência confirmada de Manutenção e corretiva na programação é suficiente para MTBF numérico; pendências de outras ocorrências tornam este valor **parcial/provisório**, não uma métrica consolidada. Valor = minutos operacionais programados / falhas corretivas de Manutenção confirmadas. O diagnóstico `mtbfSampleStatus=partial` e `mtbfAvailabilityReason=partial_pending_attribution` é propagado para API, tela e PDF.
- Sem falhas confirmadas, ou sem programação verificável, permanece `null`/Sem amostra. Não converter null para 0 nem assumir responsabilidade de Manutenção por ser um chamado de Eletrica/Mecânica.
- MTTR já aceita 1 episódio físico encerrado de manutenção corretiva. Quando não há, a UI pode mostrar separadamente a **restauração física de todas as causas** observada pela API; NÃO chamar de MTTR ou somar a seu numerador.
- Taxa de retorno já aceita 1 chamado elegível: 0 retorno / 1 chamado = 0%. Quando o denominador é 0, exibir ausência de amostra e contador de corretivos concluídos aguardando responsabilidade.
- Diferenciar diretamente elegibilidade da classificação escolhida (`failureClassification` e `failureResponsibility`) de natureza/política imutável do motivo/Grupo (`callReasonSnapshot`). Testes/falsos/duplicados continuam excluídos; SETUP de origem não corretiva continua no downtime físico, mas não entra nos KPIs corretivos.
- Definição versionada para `bi-causal-3` por causa da mudança de critério para **mostrar valor numérico parcial**, sem reescrever incidentes.

## UX
Componente compartilhado `CredentialActionDialog` para: recuperação da senha Admin principal, desfixar máquina e confirmação da programação. Layout, foco e fechamento mantêm contratos de segurança: recuperação localhost + segredo offline + CSRF, desfixação com autenticação independente, programação via step-up sem trocar sessão, busy impedindo fechamento enquanto a mutação está pendente. A recuperação deixou de expandir a área do login do Hub e passou a abrir diálogo dedicado.

## Critérios antes da promoção
1. CI Windows PS 5.1, build, PostgreSQL isolado, UI/Playwright e 1-amostra, todos verdes.
2. Testar no notebook: chamado corretivo finalizado sem retorno → 0%, com retorno → 100% para 1 chamado. Para MTBF, 1 falha atribuída a manutenção em programação → valor; 1 confirmada + 1 pendente → valor provisório rotulado; apenas pendentes → sem amostra.
3. Para MTTR, um evento encerrado totalmente atribuível à manutenção deve fornecer tempo numérico. Se não houver: mostrar física observada separada, jamais valor fictício.
4. Revisar o catálogo de classificações e os snapshots reais com permissão e PIN, conferindo que diagnósticos de Manutenção são realmente marcados com `failureResponsibility=maintenance` em chamado e evento de parada. Sem classificação real, não há como aprovar MTTR/retorno.
5. Validar modal de recuperação em overlay do Hub, e abrir/fechar os modais de programação/desfixação em desktop/mobile, sem autenticação indevida ou vazamento de senha.
6. A homologação de valores no PostgreSQL real, filtros, CSV e PDF continua pendente na issue #637, sem deploy automático.

Risco metodológico: a estimativa parcial MTBF usa minutos operacionais observados que já descontam todas as paradas, mas não conhece os denominadores causais dos eventos pendentes. Pode mudar após reclassificação. Nunca usar a estimativa provisória como meta contratual/indicador oficial consolidado.
