# SEC-04/2G — retorno de acompanhamento à manutenção pelo login central

**29/10/2026.** Uma operação de escrita específica: `PATCH /api/andon-calls/:id/return-to-maintenance`.

## Propriedades preservadas
- O fluxo legado e o central usam a **mesma transição de domínio**, dentro de uma transação PostgreSQL: encerrar a sessão em acompanhamento, recriar o atendimento apenas para os técnicos ainda vinculados, incrementando o ciclo e contabilizando o tempo em acompanhamento.
- A autorização central exige HTTPS, Origin, cookie HttpOnly, workstation ativa/aprovada, `andon.read` e `calls.returnToMaintenance`; consulta o vínculo real do chamado com máquina autorizada sob locks de usuário → estação → máquina → técnicos.
- Transição e evento de auditoria persistem na **mesma transação** e fazem rollback juntos se o audit falhar.
- Apenas ativável com `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED=1`. A segunda flag é desligada por padrão e não deve ser habilitada na Evergreen antes de homologação.

## Verificação
O CI, exclusivamente PostgreSQL `/andon_test`, percorre abertura sintética → atendimento de dois técnicos → conclusão com um em acompanhamento → retorno com ciclo incrementado. Testa negação por permissão, CSRF, cookie ausente, escopo, payload indevido, flag OFF, rollback de auditoria, sessão única e replay.

**Ainda pendente:** abertura e finalização definitiva de chamados em central; outras rotas do inventário SEC-04. Sem migração industrial, deploy, alteração da Máquina 37, mini PC ou Node-RED.
