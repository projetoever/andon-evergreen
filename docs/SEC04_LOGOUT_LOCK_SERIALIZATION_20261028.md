# SEC-04/2A.4 — Serialização de logout e revalidação da sessão

Data: 28/10/2026. Roadmap #232. Continuação do PR #248.

## Falha de concorrência identificada
O encerramento de sessão (`logout`) consultava uma sessão e gravava `revokedAt` sem adquirir o lock de usuário já utilizado por alteração de senha, redefinição, revogação administrativa e pela preparação transacional do atendimento central.

Isso permitiria que uma operação autorizada e um logout concorrente avançassem sem a mesma serialização. Esta mudança cria uma ordem consistente de autorização dentro do logout: consulta inicial, lock de usuário, **nova consulta válida** e `updateMany` condicional de apenas uma sessão ainda ativa.

A auditoria de encerramento continua **na mesma transação**, após confirmação de uma única sessão efetivamente revogada; se a gravação falha, o Prisma reverte toda a transação. A segunda tentativa ou uma sessão revogada durante a espera falha com 401 e não grava auditoria falsa.

## Testes
`server/src/access/logoutSerialization.test.ts` verifica ordem de lock/revalidação/gravação, revogação simultânea, atualização zero registros e rollback em erro de auditoria. Incluído no `npm run test:access`; além dos testes existentes de autenticação e HTTP.

## Limitações
- Não modifica a política de permissões nem ativa escrita central.
- **Não representa conclusão da auditoria de concorrência:** outras rotas de revogação/alteração de sessão, `recordInteraction` e mudanças de workstation também precisam ser revisadas. O modo central humano de escrita permanece bloqueado.
- A homologação concorrente com PostgreSQL real e fluxos industriais ainda é necessária antes de liberar qualquer operação.

Sem migrações, limpeza de sessões em produção, alteração de certificados, deploy, Node-RED/GPIO, Máquina 37 ou fórmulas do BI.
