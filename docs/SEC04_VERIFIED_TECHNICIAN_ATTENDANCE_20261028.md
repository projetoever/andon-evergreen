# SEC-04/2A.9a — Credencial de técnico e exclusividade no fluxo central preparatório

Data de referência: 28/10/2026. Roadmap #232, continuação do PR #253.

## Problema

O orquestrador de acesso central `runCentralAttendanceWithAtomicAudit` (PRs #248/#251) já tinha sessão de usuário, workstation, escopo de máquina, lock transacional e auditoria, mas recebia um **callback genérico** sem um componente próprio para conferir credenciais do mantenedor e bloqueios de sessões técnicas. Uma futura integração que confiasse em um `technicianId` vindo do navegador poderia contornar regras fundamentais do atendimento.

## Escopo implementado nesta etapa

`server/src/access/centralVerifiedTechnicianAttendance.ts` introduz:

- `verifyCentralAttendanceTechnician(tx, call, credential)`: reusa `normalizeCredential`, `identifyTechnician` (hash scrypt de PIN/RFID) e `lockTechnicianSessionFlow` da operação atual, com nova identificação do mesmo técnico após obter o lock. Não aceita nome ou ID como substitutos da credencial.
- Reconsulta o chamado real **depois** do lock técnico, exigindo a mesma máquina, estado `open`, manutenção real e setor compatível com as áreas técnicas do profissional. Rejeita chamadas `isSystemTest`.
- Consulta sessões ativas por ID e também sessões legadas sem ID, cujo nome coincide sem diferenciar maiúsculas/minúsculas; bloqueia técnico já ocupado, no mesmo chamado ou em outro, inclusive acompanhamento.
- `runCentralAttendanceWithVerifiedTechnician`: compõe a validação acima com a transação e a auditoria atômica já existentes. O callback de domínio recebe exclusivamente a identidade verificada (ID, nome, matrícula), **não** o PIN. O ID auditado provém da validação do banco, nunca do navegador.

## Testes

`centralVerifiedTechnicianAttendance.test.ts` verifica credencial inválida, modo nome proibido, renovação/desativação enquanto aguardava o lock, área técnica, máquinas divergentes, estado alterado, teste de sistema e exclusividade por ID/nome legado.

`validate-central-technician-guard.mjs` verifica as mesmas invariantes essenciais em PostgreSQL real **somente em `andon_test`**, com mantenedor/chamados/sessões sintéticos, incluindo registro legado pelo nome e desativação do técnico. Ambos foram incluídos na suíte de CI de acesso.

## Pendências obrigatórias antes de operar

- O endpoint atual `PATCH /api/andon-calls/:id/attend` **não** chama esse módulo, e o middleware continua recusando a escrita central (`central_action_not_supported`). Essa etapa não inclui deploy.
- A implementação da **mutação real do domínio** deverá reutilizar o fluxo atual de andamento, tempos, técnico adicional, sessão de origem, sincronização da máquina, integração por GPIO/Node-RED e auditoria no mesmo commit. O callback atualmente é uma interface **apenas do servidor**, ainda sem implementação de transição central.
- Conferir possíveis relacionamentos de identidade pessoal ↔ técnico, múltiplos técnicos numa mesma operação, configurações de identificação (`attendanceMode`) e bloqueios concorrentes com o administrador de técnicos.
- A conclusão de manutenção, acompanhamento, finalização e alterações históricas têm autorização independente; não podem herdar permissão de início de atendimento.
- Testes HTTP/HTTPS, concorrência real e homologação com rollback deverão anteceder a liberação por fase e instalação em produção.

Sem alteração do servidor Evergreen, Máquina 37, banco produtivo, fórmulas de BI, Node-RED/GPIO ou credenciais reais.
