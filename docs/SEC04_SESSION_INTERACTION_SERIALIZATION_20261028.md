# SEC-04/2A.5 — Interação com sessão revogada não renova atividade

Data: 28/10/2026. Roadmap #232. Continuidade da serialização de logout (#249).

## Problema

O endpoint `POST /api/access/interaction` chamava `resolveSession` e, em operação separada, atualizava `lastInteractionAt` com `update` incondicional. Um logout, revogação administrativa ou desativação de workstation poderia ocorrer entre a validação e a escrita, deixando a operação de interação responder como sucesso com sessão já revogada.

## Correção

A função `recordInteraction` passa a usar transação interativa Prisma:
1. valida a sessão e obtém o usuário por dados do banco;
2. adquire o **mesmo advisory lock por usuário** já utilizado por logout e alterações de autorização;
3. resolve novamente a sessão após o lock e compara usuário/sessão;
4. atualiza `lastInteractionAt` somente quando `revokedAt IS NULL`, `expiresAt > now` e a atividade anterior não excedeu o limite de inatividade (30 minutos);
5. exige exatamente uma linha modificada, caso contrário responde 401 e desfaz a transação.

A atualização condicional também evita retorno indevido de sucesso após revogação de sessão por workstation, mesmo quando o fluxo de workstation não utiliza o lock de usuário.

## Verificação

Teste `server/src/access/interactionSerialization.test.ts` cobre sucesso, revogação entre leituras, expiração, atualização que não encontra sessão ativa, token inválido e workstation incorreta. Executado dentro de `test:access` no CI.

O teste de integração `server/scripts/validate-access-foundation.mjs` também exercita PostgreSQL isolado (`andon_test`): atualização de sessão ativa, rejeição após expiração por inatividade e rejeição após revogação administrativa.

## Limites

Esta etapa não modifica tempos de atendimento, BI, modelo de dados, emissão Node-RED, GPIO ou o comportamento do servidor industrial. A gestão central de escrita humana segue bloqueada. Ainda é necessária auditoria adicional dos fluxos de administração de workstation/admissão e um teste PostgreSQL com concorrência real antes da ativação.
