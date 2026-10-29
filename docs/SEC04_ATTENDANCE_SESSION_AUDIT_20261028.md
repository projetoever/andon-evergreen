# SEC-04/2A.3 — Sessão revalidada e auditoria atômica de atendimento

Data: 28/10/2026. Roadmap #232, sequência dos PRs #246 e #247.

## Pacote implementado (sem ativação operacional)

`server/src/access/centralAttendanceAtomicAudit.ts` oferece um **orquestrador isolado**, não conectado às rotas:

1. Recusa token inválido antes de qualquer consulta. Identifica o usuário pelo hash do token no próprio banco; não aceita identidade ou permissões vindas da interface.
2. Na transação interativa, obtém primeiro o advisory lock do usuário existente (`lockUser`), revalida sessão, expiração, versão de autorização, permissão e workstation; só depois adquire o lock de máquina do ANDON.
3. Reutiliza `authorizeCentralAttendanceAfterLock` para conferir máquina e chamado real após o bloqueio. Revalida sessão e workstation novamente antes de qualquer mutação.
4. Exige callback de domínio fornecido pelo servidor para verificar técnico, PIN, sessão exclusiva, workstation de origem e efetivar o atendimento **na mesma transação**. Este pacote **não implementa nem conecta** esse callback aos handlers atuais.
5. Exige ID verificado de técnico e adiciona auditoria `calls.attend` no mesmo commit via `appendAudit`. Falha de auditoria ou do callback causa rollback pelo Prisma, nunca sucesso parcial.

Testes sintéticos verificam ordem de locks, sessão revogada após espera, estação bloqueada, máquina fora do escopo, mudança de status concorrente, erro na validação do técnico, falha de gravação de auditoria, token inválido e callback sem identidade validada.

## Dependências ainda bloqueadoras

- Os handlers legados não chamam essas funções. Toda escrita humana no modo central continua retornando `central_action_not_supported`.
- Validar e padronizar serialização de **todos** os caminhos de revogação (inclusive logout, alterações de estação e permissões) para cobrir corridas entre a última leitura e o commit. A releitura introduzida não é garantia universal de serialização.
- Implementar o callback real respeitando regras existentes de PIN/biometria, técnico exclusivo, lock de turno, múltiplos chamados, atendimento/acompanhamento e workstation de origem; revisar ordem de locks e possível deadlock.
- Definir o contrato da auditoria com identidade do técnico verificável, motivos e campos mínimos (sem PIN/segredos), com falha de persistência propagada.
- Homologar em ambiente isolado com PostgreSQL e concorrência real; revisar integração HTTPS, Node-RED/GPIO, operação da Máquina 37 e rollback antes de qualquer ativação central.

**Sem deploy, alterações de produção, migrações, novas permissões efetivas, alteração de indicadores BI ou modificação direta no fluxo legado.**
