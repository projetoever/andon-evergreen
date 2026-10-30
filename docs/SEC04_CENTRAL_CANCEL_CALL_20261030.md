# SEC-04/2K — Cancelamento auditável com propriedade da abertura

30/10/2026. Etapa complementar dos 11 ajustes do ANDON.

## Segurança e comportamento
- `PATCH /api/andon-calls/:id/cancel` é uma escrita central **independente**, liberada somente se `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED=1` (flag OFF por padrão).
- HTTPS, origem, sessão cookie HttpOnly, anti-CSRF, workstation ativa/aprovada, `andon.read`, escopo de máquina real, locks usuário → workstation → máquina e revalidação da sessão dentro da transação.
- `calls.cancel.own`: permite cancelar **apenas** chamado criado pelo login atual, usando `createdBy` persistido no PostgreSQL. Chamados legados `createdBy="kiosk"` não se tornam de propriedade de um usuário arbitrário.
- `calls.cancel.any`: permite cancelar qualquer chamado do escopo da máquina, inclusive legados. Admin principal autorizado conserva privilégio administrativo.
- Rejeita cancelamento de chamados já atendidos, com sessões de técnicos ou já encerrados. **Não permite alterar `cancelledBy` pelo navegador:** servidor registra o login autenticado.
- Justificativa obrigatória, limite de 2000 caracteres. A transação usa a **mesma função de domínio do modo legado**: encerramento físico, transferência de impacto a chamados restantes, cálculo de tempos, atualização da máquina e persistência de `cancelReason`. O log `calls.cancel` é criado na mesma transação, fazendo rollback integral em falha.

## Aceitação técnica
Testes PostgreSQL isolado `/andon_test` e guard HTTP: sem cookie/CSRF, spoof de autor, falta de permissão, cancelamento do próprio chamado, negação de outro criador, concessão `cancel.any`, dupla tentativa, rollback ao falhar auditoria e flag desligada.

Sem produção/M37, deploy ou migração. O pacote de 11 ajustes ainda requer revisão integrada e homologação no notebook.
