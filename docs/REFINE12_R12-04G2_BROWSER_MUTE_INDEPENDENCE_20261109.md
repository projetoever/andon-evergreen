# REFINE 12 — R12-04G2 | Mute do Dashboard desacoplado da sirene externa (#373, #368)

Data: 09/11/2026. Base: R12-04G1 PR #410 → R12-04E #408 → #406 → #404 → E034 #385.

## Diagnóstico
O código E034 já separava a preferência de áudio **local** do navegador quando `access?.centralAccessEnabled === true`, por `dashboardBrowserSoundState.ts`. Contudo o caminho legado — ou quando a informação de acesso central não está disponível — persistia o mute pelo `PATCH /api/dashboard-sound-state` do servidor. Isso contradiz o requisito de que uma sirene de mini-PC/GPIO, opcional, NÃO deve impedir o usuário de silenciar ou reativar o som reproduzido pelo navegador.

## Correção R12-04G2 (sem novos privilégios)
- O botão **Silenciar som** no `DashboardPage.tsx` agora lê e grava **apenas** `readBrowserDashboardSoundState` / `updateBrowserDashboardSoundState` para **ambos** os modos central e legado, inclusive antes de carregar o status da sessão.
- Nenhuma chamada GET/PATCH do estado sonoro compartilhado é disparada pelo botão, por timer, ao recarregar o navegador ou ao abrir novo chamado. O mute persiste neste navegador quando storage está disponível; sem storage funciona na memória enquanto a página estiver aberta. Timer local e reativação por novo chamado continuam aplicados, sem interferir no áudio da tela de máquina.
- **API externa industrial preservada**: `GET/PATCH /api/dashboard-sound-state` continua existindo no backend e em `systemSettingsService.ts` para quem explicitamente opera o estado compartilhado de sirene/mini-PC. O botão de áudio do navegador **não** comanda o GPIO e não depende de disponibilidade do agente externo, PostgreSQL ou API para mutar/desmutar. A interface de controle da sirene externa permanece tarefa separada e auditada — nunca associá-la automaticamente à permissão de sons do navegador.
- Nenhuma mudança de esquema, migração, estado histórico, autenticação, workstation, KPI, Node-RED, PLC ou dispositivo físico. Diferença funcional intencional no modo legado: o botão deixa de controlar o mute compartilhado do servidor, passando a representar **som do navegador**.

## Regressões
- `tests/dashboardSoundMuteTimer.test.ts` passa a exigir seleção incondicional de preferência browser para os dois modos, ausência de acesso à API compartilhada em `DashboardPage`, `stopAndonSound(undefined, "dashboard")`, reativação por novo chamado.
- Teste dinâmico com dois objetos `Storage` independentes: mute manual/automático em quiosques diferentes, reativação de apenas um e prazo de expiração, sem qualquer requisição HTTP.
- A API de sirene para o agente continua presente em `server/src/routes/systemSettings.ts` e `src/services/systemSettingsService.ts`; seus testes antigos de funcionamento são preservados.
- Gates: Windows PowerShell 5.1, frontend/UI, backend/PostgreSQL, teste browser GitHub Actions. Não declarar CI sucesso antes da execução completa e do log.

## Homologação manual ainda necessária (usuário)
Na HML isolada, pressionar **Iniciar Painel**, depois **Silenciar som** e **Reativar som** mesmo com mini-PC/Node-RED/GPIO desligados. O botão deve responder sem alerta sobre sirene externa; novo chamado deve reativar áudio do dashboard de acordo com regras existentes; o som da página de máquina permanece independente. Confirmar em dois navegadores simultâneos que um mute não silencie outro; validar reinício, temporizador, permissão central e modo legado. O servidor industrial `C:\web-andon-industrial\andon`, DB `andon_db`, máquina 37, PLC e mini-PC não podem ser usados no teste automatizado.

**PR funcional DRAFT, SEM MERGE/DEPLOY. PR CI-only contra main NUNCA MERGIR.** Notebook do usuário permanece exclusivamente E034 #385, ainda sem aceite operacional de R12-04G2. Issue #373 só pode ser fechada após confirmação visual; #368 segue aberta para R12-04H 10 abas/ACL e homologação final.
