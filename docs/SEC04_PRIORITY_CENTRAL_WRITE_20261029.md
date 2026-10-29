# SEC-04 — ordenação de Prioridades pela autenticação central (opt-in)

29/10/2026 — plano de fechamento dos dez ajustes, issue #232.

O PUT `/api/dashboard-priority/order` usa a mesma sessão central do Hub, **somente** quando os dois controles estão explícitos:
`ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_PRIORITY_HTTP_ENABLED=1`.

Com os controles desligados, a edição central continua indisponível. O modo legado e a autenticação legada de Prioridades não foram removidos.

O endpoint exige HTTPS, Origin exata, workstation ativa e aprovada, permissão `priorities.read` + `priorities.write`, escopo integral de máquinas e anti-CSRF derivado do cookie HttpOnly. O domínio adquire locks de usuário → workstation → catálogo de prioridades; relê sessão, política e inventário dentro da transação antes de gravar. Reutiliza a geração de histórico de prioridades do sistema, preservando mudanças dos cinco primeiros destaques, além de registrar auditoria imutável no mesmo commit. Uma falha no audit causa rollback.

O Hub anuncia `prioritiesWriteEnabled` somente para a conta efetivamente autorizada quando a flag está ativa. A tela permanece somente leitura nos demais casos. A API faz o enforcement, independentemente do estado visual.

Teste isolado em PostgreSQL `/andon_test`: permissão, escopo, duas conexões, rollback, persistência do histórico, CSRF, revogação e flag desligada.

**Não habilitar em produção** antes da homologação dos módulos operacionais, revisão de rollbacks e autorização específica para o servidor Evergreen. Não altera M37, Node-RED ou GPIO.
