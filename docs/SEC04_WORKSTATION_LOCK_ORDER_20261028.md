# SEC-04/2A.6 — Bloqueio de workstation na autorização de atendimento

Data: 28/10/2026. Roadmap #232. Pacote independente após a fundação transacional #248.

## Risco identificado

O orquestrador `runCentralAttendanceWithAtomicAudit`, ainda isolado dos handlers produtivos, já obtinha lock de usuário e máquina, mas apenas **consultava** o estado da workstation sem adquirir o mesmo lock usado pelos endpoints que bloqueiam/desativam workstations ou decidem admissões.

Assim, uma mudança administrativa de estado ou permissão poderia acontecer concorrente à autorização de um futuro atendimento central.

## Ajuste preventivo

Antes da primeira leitura de sessão/permissões, após descobrir o usuário pelo hash do token e adquirir `lockUser`, o orquestrador agora chama `lockWorkstationFlow(tx, workstationId)`, já existente no repositório. Só então lê novamente a sessão e as permissões da estação, e depois adquire o bloqueio por máquina durante a guarda de chamado.

Ordem padronizada para o caminho **preparatório**: **usuário → workstation → máquina → validação de domínio → auditoria → commit**.

Os testes em `centralAttendanceAtomicAudit.test.ts` garantem a ordem de aquisição e verificam que operações negadas não chegam ao callback de domínio.

## Garantias e limites

- O lock de workstation é do PostgreSQL, escopo da transação, e é liberado no commit ou rollback.
- Reutilizamos o bloqueio administrativo existente; não criamos novos nomes/identificadores de lock.
- **Não é a ativação de escrita central.** O orquestrador não é utilizado nos endpoints e continua exigindo callback com regras de técnico/PIN e exclusividade; a autorização de produção permanece bloqueada pelo middleware.
- A revisão global de caminhos de revogação e a homologação de concorrência com vários usuários/workstations ainda são obrigatórias. Não há afirmação de cobertura universal.
- Sem deploy, migração, mudança no banco real, M37, comunicação Node-RED/GPIO, relatórios BI ou comportamento legado.
