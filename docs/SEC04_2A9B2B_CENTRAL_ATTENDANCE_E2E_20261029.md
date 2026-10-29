# SEC-04/2A.9b2b — composição e integração isolada de atendimento central (29/10/2026)

## Objetivo e escopo
Comprovar em PostgreSQL isolado que uma sessão central autenticada, a workstation autorizada e um grupo de 1–6 mantenedores com PIN/RFID válido podem invocar a **mesma transição de domínio do ANDON legado**, preservando concorrência, exclusividade, registros e auditoria atomicamente. Este pacote NÃO ativa os endpoints centrais.

## Composição técnica
`runCentralMultiTechnicianAttendancePrototype` (novo adaptador sem rota HTTP) chama:
1. `runCentralAttendanceWithAtomicAudit`, que consulta hash do token, faz lock **usuário → workstation → máquina**, valida e revalida sessão, perfil, escopo e permissão `calls.attend`;
2. `verifyCentralAttendanceTechnicians`, que valida cada PIN/RFID no servidor, ordena locks por ID e revalida identidade/exclusividade e área depois de adquirir os locks;
3. `applyVerifiedCentralAttendanceDomainTransitionMany`, que reaproveita domínio compartilhado de transição `open → in_progress`, registrando os participantes, workstation de origem, tempos e máquina no mesmo commit;
4. `appendAudit` na MESMA transação com usuário/sessão, workstation, chamado, máquina e IDs de técnicos — sem PIN, hash de token ou cookie.

Nenhuma camada isolada substitui a outra: não se aceita identidade arbitrária fornecida pelo navegador.

## Provas de integração no PostgreSQL `andon_test`
- Sessão sintética armazenada com hash do token; usuário limitado a um ID de máquina, com `andon.read` + `calls.attend`;
- Token inválido, workstation diferente, máquina fora do escopo, falta de permissão e PIN inválido não alteram chamada nem criam auditoria de sucesso;
- Um IP de 46 bytes excede a coluna `VARCHAR(45)` na hora de auditar, depois de aplicar domínio, provocando **rollback completo** de chamado, participantes e estado da máquina;
- Duas conexões Prisma independentes, credenciais em ordens inversas, disputam o mesmo chamado. Exatamente uma deve gravar; outra recebe `call_state_changed`. Persistem duas sessões técnicas, a workstation de origem e **um** evento de auditoria;
- Reenvio de chamado já atendido retorna conflito 409 e não gera segunda sessão/auditoria. É **at-most-once para esse chamado**, NÃO é o protocolo de idempotência HTTP com mesma resposta / idempotency-key;
- Revogação de sessão invalida nova tentativa; nenhuma trilha de sucesso é gerada;
- Falha de auditoria e tentativas negadas fazem rollback, sem registrar PIN, token ou respectivo hash.

A validação exige `ANDON_INTEGRATION_TEST=1`, URL de banco cujo path seja `/andon_test` e `ANDON_CENTRAL_ACCESS_ENABLED != 1`; cria somente dados sintéticos. Auditoria imutável de teste permanece no banco descartável.

## Exclusões e critérios para fase seguinte
- Não há novo handler Fastify ou mudança em `enforceWorkstationAccess`; **escritas centrais continuam negadas**, incluindo este fluxo quando chamado via HTTP.
- Antes de qualquer liberação: protocolo real de idempotência/replay e CSRF/origem por rota, auditoria de todas as 41 escritas faltantes, matriz de autorizações, testes de revogação administrativa concorrente, integração de identidades industriais e homologação em notebook/equipamento, backup/rollback e autorização explícita.
- Sem migração, rede externa, mudança em `HTTPS`, Node-RED, GPIO, máquina 37 ou base de produção.

## Rodar isoladamente
Após `npm run db:generate`, `npm run build` e a aplicação das migrations sobre banco de teste descartável:
`ANDON_INTEGRATION_TEST=1 DATABASE_URL=postgresql://.../andon_test node scripts/validate-central-attendance-e2e.mjs`.
A mesma prova passa a integrar `npm run test:access:integration` no CI.
