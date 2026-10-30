# SEC-04/2R — Configurações operacionais do ANDON via Admin central

30/10/2026 — P0 de homologação dos 11 ajustes. Flag: `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED=1`, **OFF por padrão**, requer `ANDON_CENTRAL_ACCESS_ENABLED=1`.

## Objetivo
No login central, o PATCH de `/api/system-settings` estava bloqueado, impossibilitando o Admin de alterar OS obrigatória, restrição de conclusão na workstation original, modo de identificação técnica, teclado virtual e preferências de organização do dashboard. Esta migração é deliberadamente limitada e **não** autoriza configurações de alarme ou credenciais.

## Segurança
- Somente **Admin principal**, com `machineScope=all`, sessão central `normal`, estação aprovada com módulo operacional, HTTPS, Origin exata, cookie HttpOnly e CSRF.
- Validação novamente sob locks usuário → própria estação → linha de configurações globais, com verificação de sessão/permissão revogada, whitelist estrita e auditoria **atômica**.
- Campos permitidos: `clientName`, `clientUnit`, `allowWholeSetCalls`, `virtualKeyboardEnabled`, `requireWorkOrderAtOpen`, `restrictMaintenanceCompletionToAttendanceWorkstation`, `dashboardMachineOrderMode`, `attendanceMode` (somente `pin`/`rfid` no central), `rfidReaderMode`, `rfidInputTerminator`, `rfidCodeLength`, `filterTechniciansByCurrentShift`. Reenvio sem mudança não duplica auditoria.
- **Permanecem negados**: estado de mute/sirene, temporizadores globais do som, segredos e senhas administrativas, `hubEnabled`, `requireWorkstationApproval` e quaisquer campos extras. Preferências locais de workstation continuam próprias e separadas.
- Histórico de auditoria armazena usuário central, estação, campos modificados e antes/depois (sem credenciais ou tags). Se audit falhar, a atualização é desfeita na mesma transação.
- O modo legado anterior é preservado integralmente, sem migração de schema.
- O cliente adiciona CSRF derivado ao PATCH apenas no modo central.

## Critérios de aceite
- Suíte unitária de flag OFF, Admin principal, machineScope total, CSRF, módulo e whitelist.
- PostgreSQL isolado `/andon_test`: tentativa de usuário não-Admin, scope selecionado, ausência de cookie/CSRF, campos de som bloqueados, PIN/RFID versus nome, rollback forçado, no-op e revogação.
- Regressão de backend, frontend, HTTPS e instalador Windows na CI.
- **Apenas uma das 21 rotas não classificadas passa a ter política própria** (21→20); não abrir permissões genéricas. Global dashboard mute continua pendente de decisão de escopo físico.
- Nenhum deploy, edição de flags, banco industrial, certificados, servidor Evergreen, Máquina 37, Node-RED ou GPIO até homologação separada.
