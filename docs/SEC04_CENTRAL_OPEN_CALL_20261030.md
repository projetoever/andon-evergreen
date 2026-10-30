# SEC-04/2H — Abertura individual de chamados pelo login central

**30/10/2026.** Integra apenas `POST /api/andon-calls`, preservando o cadastro legado e o tratamento operacional da máquina.

## Proteções
- Exige HTTPS, Origin e workstation verificada, cookie central HttpOnly, token anti-CSRF em memória, `andon.read` e `calls.open`, permissão e escopo da máquina no banco.
- Acesso HTTP exige `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED=1`; a segunda flag está **OFF por padrão**.
- **O mesmo domínio de abertura existente** é executado no mesmo Prisma transaction do guard: OS obrigatória por máquina/global, setor cadastrado e ativo, conjunto/subconjunto, bloqueio de duplicidade de setor, owner do primeiro evento de parada, múltiplos chamados simultâneos em setores diferentes, indicadores e tempos iniciais.
- Locks em ordem usuário → workstation → máquina → categoria; o login/sessão é revalidado após o lock e o evento `calls.open` é auditado atomicamente. Falha de auditoria faz rollback.
- Usuário central não pode enviar `createdBy`, `isSystemTest` nem falsificar a origem de instalador. O backend atribui `createdBy` ao login central autenticado.
- Abertura em lote (`POST /api/andon-calls/batch`) permanece bloqueada em modo central até sua migração própria. O modo legado não foi alterado.

## Testes
PostgreSQL isolado `/andon_test`: negados cookie ausente, CSRF inválido, máquina fora do escopo, OS obrigatória, criador/origem falsificados e operação em lote. Concorrência no mesmo setor permite um único chamado; abertura com máquina parada gera intervalo de parada e owner único, preserva máquina e audita. Revogação de sessão e flag desligada negam gravação; falha na auditoria reverte o commit.

**Sem atualização de notebook ou servidor industrial até o pacote consolidado.** Nenhum deploy, migração de banco, operação em M37/Node-RED/GPIO.
