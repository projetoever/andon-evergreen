# REFINE 12 / R12-04B — Edição auditada de turnos no ANDON para qualquer perfil delegado (#368)

Data 09/11/2026 | Base: R12-04A PR #398 (técnicos) sobre E034 PR #385.

## Operação migrada
- `PATCH /api/shifts/:id` passa pela nova guarda central independente `ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED=1`, **OFF por padrão** e não adicionada ao launcher do notebook/fábrica.
- Somente Admin principal ou usuário humano normal com `andon.read` + `andon.settings.open`; qualquer `roleLabel`, inclusive Produção e Manutenção com `machineScope=selected` tem autoridade **global de configuração de turnos**, não autoridade para controlar produção física. `production.schedule.write` isolada não serve como substituto.
- Obriga HTTPS, Origin, Hub cookie/session, estação ativa/admitida, CSRF, marker por requisição, validação novamente após locks no PostgreSQL; bypass da senha Admin antiga apenas para a rota já aprovada e nunca para Hub/BI/workstations.
- Corpo com allowlist estrita `name` até 80 caracteres, `startTime` e `endTime` no formato HH:MM e `active` booleano. Preserva turnos que atravessam meia-noite, e não altera registros de chamados ou máquinas.
- Locks `user → workstation → catalog shift → row shift`; unicidade de nome sem diferenciar maiúsculas/minúsculas entre edições centrais. Bloqueia modificação quando houver sessão de manutenção ativa vinculada ao turno para não reinterpretar escalas durante atendimento.
- Atualização e auditoria imutável `andon.shift.settings.update` no mesmo transaction, autor humano/estação/sessão e before/after. Falha da auditoria desfaz a alteração. GET /api/shifts torna-se catálogo operacional público ao módulo para contas centrais com acesso ANDON, inclusive escopo selected.
- Não altera o caminho LEGADO para central OFF, nem cria ou apaga turnos, nem confere permissões de BI/Prioridades/Hub.

## Testes
`server/src/security/centralShiftSettingsHttp.test.ts`: flag OFF, autorização role-agnostic, CSRF, exclusão de kiosk sem grant, ausência de role escalation e validação de horários.
`server/scripts/validate-central-shift-update-pg.mjs`: banco **exatamente /andon_test** + `ANDON_INTEGRATION_TEST=1`; HTTP ACL/Origin/CSRF/flag/allowlist, alteração real de turno noturno, bloqueio durante sessão ativa, falha da auditoria reverte dados, duas conexões PostgreSQL/workstations disputam nome, revogação e flag OFF.
Comandos integrados ao `test:access` e `test:access:integration`, validados via GitHub Actions Windows/Linux/PostgreSQL/frontend/browser.

## Portões
PR DRAFT, sem merge/deploy. A branch é uma etapa posterior à PR #398, que passou na CI 42561118330. A HML do usuário segue E034 #385 SHA `92debbe57d96f452cc2d72082e3fd6787294b246`; não atualizar nem habilitar flags sem autorização, backup/restauração e aceite do usuário.
A issue #368 permanece aberta para outras famílias: máquinas existentes, setores/categorias, conjuntos/subconjuntos, sons e demais abas. Não tocar `andon_db`, fábrica, M37, GPIO/PLC/Node-RED nem instalador legado.
