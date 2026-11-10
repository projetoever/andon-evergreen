# REFINE 13 — Retomada do planejamento: botões hierárquicos de chamados e regras de KPI

Data: 10/11/2026. Status: **planejamento e contrato de implementação, NÃO funcionalidade habilitada**.

## Decisões anteriores recuperadas

- Separar o **motivo** do chamado (Manutenção, Setup, Apoio à produção) da **especialidade** de atendimento (Mecânica, Elétrica, Afiação).
- A mesma especialidade pode ser opção de diferentes motivos. Não duplicar a mesma especialidade dentro do mesmo motivo.
- Exemplo visual: Manutenção → Mecânica / Elétrica; Setup → Mecânica / Afiação; Apoio → especialidade habilitada.
- Motivos de Setup e Apoio são trabalho real: contar tempo do profissional, preservar intervalos de parada física e análise operacional, mas **não integrar automaticamente os episódios corretivos MTTR, MTBF e MTTA**.
- Somente natureza `corrective_failure`, política `eligible`, disposição `include`, responsabilidade confirmada de manutenção, parada física verificada, episódio integralmente corretivo e não-teste tornam um episódio candidato elegível. `pending` jamais vira elegível por inferência.
- Motivo principal + opção subordinada formam **um único chamado**; manter regras de seleção de chamadas simultâneas sem duplicação. Histórico deve guardar nomes/IDs/revisões na abertura, e reclassificação futura requer permissão, justificativa e auditoria.

## Estado real verificado em main

1. **Concluído (base S1)**: migration `20261104200000_call_reasons_policy_foundation`, tabelas `call_reasons` e `call_reason_options`; serviço puro `server/src/services/callReasons.ts`; testes unitários/PG. Inativo para UI e KPIs.
2. **Concluído em paralelo**: CRUD de áreas técnicas em `andon_categories`, com controles de acesso central, CSRF, auditoria e proteção de histórico (REFINE12 R12-04C). São especialidades técnicas, não o motivo pai.
3. **Pendente S2**: endpoints próprios `/api/call-reasons` (listagem segura e administração de motivos e suas opções); grants explícitos `catalog.reasons.manage` e `analytics.policy.manage`, recusas para sessão/workstation/escopo inadequados; transação, locks, `revision` contra atualização concorrente; trilha de auditoria; OFF até habilitar em homologação.
4. **Pendente S3-A**: catálogo no Hub, seção **Motivos e subcategorias de chamados** com editor de motivo pai, especialidades vinculadas, ordem, ativo/cor e visualização de elegibilidade para KPIs; mostrar `pending` como pendente, não como KPI zero. Sem alterar botões operacionais.
5. **Pendente S3-B**: na abertura do chamado, seleção pai → especialidade/opção; um evento único, OS se obrigatória, regra de chamado ativo, sessão central, CSRF, identidades e compatibilidade legado; persistir snapshot da política na abertura. Não reutilizar silenciosamente um campo de `AndonCall` e não sobrescrever histórico.
6. **Pendente S4**: ajustes da elegibilidade BI para motivos e intervalos, com confrontação de dados reais e testes de paridade dos KPIs; manter disponibilidade/downtime físico independente do motivo; confirmar dados históricos antes de qualquer backfill.
7. **Pendências de segurança da fábrica**: homologação de workstations, perfis, confiança de kiosk, integridade do histórico/cancelamento, segurança de credenciais, agente físico/GPIO/PLC/Node-RED, comparação BI e restauração pós-migração. Não declarar os 33 itens concluídos até aceite individual.

## Ordem recomendada

- **REFINE 13.1**: PR #426 — botão de cópia da senha provisória e testes; pequeno, sem migração ou redeploy automático.
- **REFINE 14 / S2**: API do catálogo somente em ambiente isolado e testes PostgreSQL com banco `andon_test`.
- **REFINE 14 / S3-A**: catálogo visual no Hub, teste admin/gerente delegável e políticas de KPI.
- **REFINE 15 / S3-B**: botões hierárquicos de chamados com snapshots/versionamento, regressões de OS, chamadas simultâneas, assistência e encerramento.
- **REFINE 15+ / S4**: BI, paridade MTTA/MTTR/MTBF/disponibilidade e deploy controlado no notebook original.

Nenhum desses está automaticamente autorizado a reclassificar chamados históricos, executar seed de novos motivos no servidor industrial ou alterar máquina física.
