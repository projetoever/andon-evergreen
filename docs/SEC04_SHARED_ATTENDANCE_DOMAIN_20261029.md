# SEC-04/2A.9b1 — Transição compartilhada do atendimento (preparação sem ativação)

Data: 29/10/2026. Roadmap #232.

## Problema
A fase #254 construiu uma guarda transacional central com sessão, workstation, lock de máquina, credencial técnica, exclusividade e auditoria, mas a passagem `open → in_progress` e seus efeitos ainda existiam apenas no handler legado. Duplicar essa lógica geraria divergências de tempos, registros técnicos e atualização do estado industrial.

## Mudança implementada
- `server/src/routes/andonCalls.ts` contém agora uma única função privada `persistAttendanceTransition`, reutilizada pelo handler legado, preservando sem reinterpretação os campos `attendedAt`, `currentAttendanceStartedAt`, `technicianNames`, `technicianArea`, snapshots de modo/status da máquina, `maintenanceReturnCount + 1`, registro das sessões por técnico e `syncMachineOperationalState`.
- A função exportada `applyVerifiedCentralAttendanceDomainTransition` serve **somente ao código servidor**, dentro da transação e depois das guardas centrais. Reconfere workstation aprovada e com acesso, chamado real da máquina em estado `open`, categoria de manutenção e ausência de teste automático. Busca o técnico real por ID após a guarda de PIN, reconfere atividade/área, reutiliza `lockAndFindMissingActiveTechnicians` (incluindo nomes legados) e chama a mesma `persistAttendanceTransition`.
- O adaptador `server/src/services/centralVerifiedAttendanceDomain.ts` fixa o callback central ao código acima e reutiliza `runCentralAttendanceWithVerifiedTechnician`, que engloba a transação, os locks na ordem usuário → workstation → máquina → técnico e `appendAudit`. O navegador não fornece callback nem ID do técnico.

## Testes
- `server/src/access/sharedAttendanceDomain.test.ts`: verifica contrato da transição compartilhada, preservação da rota legada, validações adicionais do servidor, adaptador sem endpoint e bloqueio central `central_action_not_supported`.
- `server/scripts/validate-shared-attendance-domain.mjs`: PostgreSQL real apenas em `andon_test`, com fixtures sintéticas. Verifica que falha posterior à mutação **reverte** chamado, sessão e estado de máquina; verifica atendimento bem-sucedido, horários, workstation de origem, ciclo, fase, estado da máquina e bloqueio do mesmo técnico em outro chamado.
- Regressões de manutenção legada, múltiplos chamados, workstation, admin, HTTPS e interface continuam incluídas no CI.

## Fronteiras de segurança
- **NÃO há conexão do adaptador ao endpoint HTTP.** `PATCH /api/andon-calls/:id/attend` permanece no caminho legado; a escrita humana central continua bloqueada pelo middleware.
- A primeira implementação central atende somente **um técnico por credencial**. Múltiplos mantenedores simultâneos, sessões adicionais, acompanhamento, conclusão e a política de autenticação para todas as escritas exigem etapas próprias.
- O teste PostgreSQL verifica atomicidade e regras de negócio no domínio isolado; não equivale à homologação do fluxo HTTP/HTTPS completo nem da concorrência real envolvendo usuário+workstation.
- A estação 37 do piloto, Node-RED/GPIO, banco produtivo, fórmulas do BI e certificados não foram modificados. Sem migrations, deploy, habilitação de escrita central ou homologação operacional.

## Próximas etapas
SEC-04/2A.9b2: validar adaptador central completo em sessão real simulada (PostgreSQL e HTTP isolado), integrar múltiplos técnicos de forma atômica com PIN/RFID individual, testar concorrência e preservar sessão de origem. SEC-04/2A.9c: autorização por ação para os endpoints remanescentes e habilitação somente após homologação independente.
