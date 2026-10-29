# SEC-04/2A.9b2a — Atendimento simultâneo de múltiplos mantenedores

Data: 29/10/2026. Continuação do roadmap #232 e do PR #255.

## Objetivo
Permitir que a futura operação central de início de atendimento identifique **cada** mantenedor por PIN ou RFID, obtenha todos os bloqueios em ordem determinística, recuse o grupo inteiro se qualquer técnico não estiver disponível e grave todas as sessões em uma única transação com auditoria.

## Implementação
- `server/src/access/centralMultiTechnicianVerification.ts`: valida entre 1 e 6 credenciais; identifica técnicos ativos pela função de hash existente; proíbe identidade duplicada; adquire locks `andon-technician-session` por ID **ordenado**, independentemente da ordem enviada; revalida cada PIN/RFID depois dos locks; confirma estado, categoria, setor, exclusão de chamados de teste e sessões ativas por ID ou nome legado. A primeira falha aborta o grupo, sem mutação parcial.
- `server/src/routes/andonCalls.ts`: a nova `applyVerifiedCentralAttendanceDomainTransitionMany` verifica workstation, chamado e todos os técnicos a partir do banco, reutiliza `lockAndFindMissingActiveTechnicians` e `persistAttendanceTransition` (também usada pelo atendimento legado). Mantém ordem dos nomes da solicitação, todos os horários, um registro `TechnicianSession` por técnico, workstation original, fase/ciclo e atualização da máquina. A função anterior de técnico único continua como wrapper compatível.
- `server/src/access/centralAttendanceAtomicAudit.ts`: auditoria atômica contém `technicianId` principal e `technicianIds` do grupo, validados quanto a duplicidades, comprimento, strings vazias e consistência; operações anteriores com um técnico mantêm payload de auditoria existente.
- `server/src/access/centralMultiTechnicianAttendance.ts` e `server/src/services/centralVerifiedAttendanceDomain.ts`: compõem o grupo com o fluxo central de sessão, permissões, locks e trilha de auditoria **sem novo endpoint**.

## Testes
- `centralMultiTechnicianVerification.test.ts`: ordem dos locks, ordem de credenciais, duplicação, credencial inválida, revogação, área/status e sessões legadas ativas.
- `centralAttendanceAtomicAudit.test.ts`: registra todos os técnicos em evento único e impede payloads de auditoria inconsistentes.
- `validate-central-multi-technician.mjs`: PostgreSQL isolado (`andon_test`), com dois técnicos e chamados sintéticos; testa rollback integral, PIN inválido, gravação conjunta de duas sessões, origem, horário e sincronismo de máquina. Também usa **duas conexões Prisma simultâneas** disputando o mesmo chamado e exige exatamente um commit, com a segunda tentativa rejeitada após observar o novo estado. Não é teste completo de uma requisição HTTP autenticada.

## Segurança e limites
- **Não está habilitado o acesso central de escrita**, que segue recusado por `central_action_not_supported`. Não houve criação de rota HTTP e nenhum operador do piloto pode invocar esse fluxo.
- Ainda são obrigatórios: teste ponta a ponta com sessão central autenticada, auditoria real por usuário/IP/estação, concorrência paralela em duas conexões da transação inteira, idempotência/reenvio de requisição, verificação de watchdog Node-RED/GPIO e homologação no notebook antes da ativação gradual.
- Sem deploy, migrations, alteração do banco produtivo, máquina 37, BI, certificados, modos de atendimento legados, PINs cadastrados ou integração PLC/Node-RED.
