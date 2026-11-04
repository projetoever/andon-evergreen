# REFINE 6 — Motivos/subcategorias, fundação isolada de política de KPI

Data: 04/11/2026 · Fase **1 de implementação**, exclusivamente aditiva e **inativa**.
Fonte de regras: `docs/architecture/access-workstations-call-reasons-20261026.md`, §§ 7–9.

## Para a gerência e para quem configurar os botões

Os nomes **Manutenção**, **Setup**, **Apoio à produção** são *motivos* de abertura do chamado. **Mecânica**, **Elétrica**, **Afiação** são *destinos/especialidades* de atendimento, não uma categoria que decide sozinha os indicadores de manutenção.

| Motivo configurado posteriormente | Opção vinculada a especialidade existente | Natureza | Política de MTBF/MTTR corretivo |
|---|---|---|---|
| Manutenção | Mecânica/Elétrica | `corrective_failure` | `eligible` **somente candidato**; exige falha física comprovada e responsabilidade de manutenção |
| Setup | Mecânica/Elétrica/Afiação | `planned_setup` | `excluded` |
| Apoio à produção | Especialidade já cadastrada | `production_support` | `excluded` |
| Motivo não classificado | Especialidade já cadastrada | `unclassified` | `pending`, nunca entra por inferência |

Os exemplos **não são criados automaticamente** em nenhuma instalação. A fábrica manterá seus botões e fluxos atuais até existir uma etapa posterior de ativação com aceite próprio.

### Regras de contabilização

- Um motivo pode compartilhar uma especialidade com outro motivo, mas um mesmo motivo não pode duplicá-la. A regra operacional de um chamado ativo por máquina/especialidade permanece inalterada.
- **Setup e apoio são atividades reais**, não são `test`/chamado falso/duplicado. Não entram nos episódios corretivos de MTTR/MTBF, mas **não apagam parada física**, disponibilidade e tempo de trabalho técnico.
- `eligible` não contabiliza KPI sozinho: exige episódio físico, responsabilidade confirmada `maintenance` e episódio inteiramente corretivo. Se for misto/pendente, fica fora da amostra corretiva até classificação respaldada.
- `pending` indica revisão, não “zero” e nem inferência automática pelo texto do botão.
- `analyticsDisposition=test/false_call/duplicate` continua sendo exclusão própria, com precedência sobre qualquer configuração de motivo.
- A natureza e a política serão **capturadas em snapshot ao abrir** o chamado numa fase posterior. Mudanças no catálogo não podem alterar chamados históricos.

## O que efetivamente entrou nesta fase

1. `CallReason` (`call_reasons`) guarda nome/cor/ordem/ativo, natureza, responsabilidade sugerida, política corretiva, disposição analítica e revisão.
2. `CallReasonOption` (`call_reason_options`) guarda a opção e referencia um `AndonCategory` preexistente com FK `RESTRICT`; única por `(reasonId, technicalAreaId)`; admite sobrescritas explícitas, sujeitas a validação da política efetiva.
3. Migration `20261104200000_call_reasons_policy_foundation`: apenas **criação de tabelas e índices**. Sem registros predefinidos, sem modificação de `AndonCall`, `FailureEvent`, relatórios do BI ou equipamentos.
4. `server/src/services/callReasons.ts`: função determinística de resolução da política de motivo/opção e verificação *fail-closed*. A “responsabilidade sugerida” não vira confirmação técnica automaticamente. O helper só fornece dados para implementação futura; não altera os KPIs existentes.
5. Testes unitários: Manutenção/Mecânica, Setup/Mecânica compartilhada, política herdada ou excepcional, rótulos de teste, confirmação física, versões, opção inválida/inativa.
6. Teste no PostgreSQL **andon_test**: duas razões com mesma especialidade, unicidade dentro do pai, FK existente e bloqueio no banco de Setup “eligible”.

## Limites e etapas seguintes

Esta fase **não implementa os botões hierárquicos** e não possui endpoints de leitura/gravação do catálogo. Isso é intencional: novos motivos ainda não podem ser usados para abrir chamados, impedir atendimento nem alterar os indicadores; o piloto antigo permanece compatível.

**Fase 2**: API `/api/call-reasons` com leitura por workstation autorizada, escrita Admin `catalog.reasons.manage` e `analytics.policy.manage`, CSRF, versionamento, auditoria transacional e negação a usuários não autorizados. Sem alterar instalações até homologação.

**Fase 3**: componentes de UI e seleção pai→subcategoria, controle de edição/cancelamento/um único chamado, snapshots na abertura, regras de idempotência e vínculos entre motivo e setor legado.

**Fase 4**: `CallPolicyInterval` e BI `bi-reasons-1`, com testes numéricos B01–B08, relatórios, recortes por motivo e rastreamento de histórico legado. **Não alterar silenciosamente `mttaMinutes`, MTTR/MTBF, disponibilidade nem exportações.**

**Segurança paralela**: concluir auditoria/ACL/CSRF de rotas legadas, homologar credenciais de serviço e contratos Node-RED/GPIO M37, ensaiar backup e restauração no notebook, homologar workstations e planejar rollback/aceite industrial.

**Restrição absoluta:** PR/CI e migração aditiva no código **não autorizam deploy** no Windows Server, PostgreSQL produtivo, Máquina 37, Node-RED, CLP nem mini PC GPIO.
