# REFINE 18 — CFG-15D4: timers do alarme do Dashboard

Data: 13/11/2026.

## Revisão
O componente `DashboardSoundMuteSettings`, exibido na aba Sons, usa `PATCH /api/system-settings` para alterar o ciclo global de alarme (período ativo e período de silenciamento). Essa mutação só pode funcionar no acesso central com `centralOperationalSettingsWriteEnabled` habilitada. Antes desta correção, a UI oferecia switches, campos e botão Salvar mesmo com a flag OFF, gerando falhas evitáveis.

## Mudança
- Usa `useModuleAccess` para diferenciar acesso central/legado. Capacidade inicial false, atualizada exclusivamente pela resposta `getSystemSettings().centralOperationalSettingsWriteEnabled === true`; volta a false quando inicia cada refresh.
- `canWriteCycle` impede edição dos switches/durações e submissão por handler durante leitura, erro, salvamento ou flag OFF.
- A consulta, os valores e o retry permanecem disponíveis. O modo legado não perde a possibilidade anterior de editar.
- Os arquivos de áudio e sons locais continuam independentes em `SoundsSettingsTab`/`soundStorageService`. Esta correção NÃO controla nem bloqueia uma sirene externa, GPIO, Node-RED, CLP ou áudio físico. Nenhuma alteração no servidor ou configurações de fábrica.
- Teste de regressão adicionado em `tests/dashboardSoundMuteTimer.test.ts`, executado pela CI.

## Aceite
CI Windows PowerShell 5.1 + Linux/PostgreSQL/API/SSR/frontend/desktop/mobile totalmente verdes; merge somente depois. Testar no notebook central com flag OFF/ON e permissão do perfil, sem ativar flags pela PR.
