# SEC-04/2A.7 — Ordem canônica de bloqueios na administração de workstations

Data: 28/10/2026. Roadmap #232.

## Diagnóstico

O orquestrador transacional **preparatório** de atendimento central já seguia `usuário → workstation → máquina` (PR #251), mas três rotas de administração de workstation em `server/src/routes/access.ts` obtinham apenas o lock da workstation antes de revalidar a sessão:

- `POST /api/access/admission/request`;
- `PATCH /api/access/workstations/:id`;
- `POST /api/access/workstations/:id/decision`.

A ausência do mesmo protocolo de locks para o ator dificultava a serialização de revogação de usuário/sessão e administração concorrente. A análise não prova um deadlock em produção; é um risco arquitetural preventivo, cuja alteração precisa de testes.

## Correção implementada

As três operações passam a adquirir **lock do usuário autenticado**, depois o **lock da workstation alvo**, e só então reler a sessão e conferir as permissões. As duas operações administrativas também comparam ID de usuário e sessão da consulta preliminar com a consulta protegida. A admissão mantém o `purpose=workstation_admission` e sua revalidação posterior.

Mantidas as regras existentes de estação com técnico ativo, tela bloqueada, aprovação pendente, revogação de sessões e trilha de auditoria. Não alteramos as rotas legadas de operação, o login, banco ou permissões.

## Verificação

- `server/src/access/workstationLockOrder.test.ts`: verifica especificamente as três rotas e a ordem do orquestrador preparatório; assegura que a trava global de escrita central permanece no middleware.
- `server/scripts/validate-access-workstation-locks.mjs`: em `andon_test`, **duas conexões Prisma independentes** mantêm advisory locks de usuário e workstation e testam `pg_try_advisory_xact_lock`. Exige exclusão da mesma chave, independência de outras chaves, liberação no commit e no rollback.
- Testes HTTP existentes de usuários, workstations e admissão seguem no CI; o novo teste PostgreSQL é executado por `npm run test:access:integration` após o teste de fundação de acesso.

## Fronteiras de segurança

- O teste verifica exclusão de locks reais entre transações, **não** prova ausência de deadlocks em todos os fluxos industriais nem uma concorrência completa de atendimento técnico. A revisão de todos os pontos de alteração de workstation e de identidades ainda permanece aberta.
- **Nenhuma operação de escrita central foi habilitada.** O orquestrador de atendimento continua isolado, exigindo implementação das regras reais de técnico, PIN e rastreabilidade.
- Sem deploy, migration, alteração dos históricos, indicadores BI, Node-RED, GPIO ou Máquina 37.
