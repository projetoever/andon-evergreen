# REFINE 12 / R12-04G1 — Temporizadores do áudio do navegador, independentes do GPIO (#368)

Data: 09/11/2026. Base PR #408 R12-04E (tipos) → #406 (subconjuntos) → #404 (conjuntos) → #402 (categorias) → E034 #385.

## Diagnóstico de aproveitamento
A edição de máquinas existentes já está pronta em E034: `PATCH /api/machines/:id` atualiza apenas `name` e `requireWorkOrderAtOpen` por `centralMachineSettingsHttp.ts` com flag OFF por padrão, humano qualquer papel com `andon.settings.open`, CSRF, locks/auditoria e testes unit+PG `validate-central-machine-settings-pg.mjs`. **Não duplicar na suposta R12-04F.** Comandos `/status`, `/production-mode`, `/active` continuam separados e não se habilitam por `andon.settings.open`.

A revisão de som identificou que `PATCH /api/system-settings` já possui guarda central global auditada `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED` (OFF por padrão), porém sua allowlist negava os quatro temporizadores de áudio que a tela legada já oferece. Isso impede a gestão completa de Configurações do ANDON para qualquer pessoa delegada.

## Mudança de código R12-04G1
- Reutiliza rota existente `PATCH /api/system-settings` e sua revalidação de sessão humana, workstation, Origin, CSRF, ACL role-agnostic de `andon.settings.open`, lock de row global e auditoria transacional.
- **Acrescenta SOMENTE quatro campos da política de áudio do navegador:** `dashboardSoundMuteTimerEnabled` booleano, `dashboardSoundMuteDurationMinutes` inteiro 1..240, `dashboardSoundAutoMuteTimerEnabled` booleano e `dashboardSoundActiveDurationMinutes` inteiro 1..240. Nenhuma mudança de esquema/banco e sem duplicação da tela.
- **Não** habilita `dashboardSoundMuted` (mute dinâmico), `PATCH /api/dashboard-sound-state`, sirene externa, GPIO, PLC, Node-RED, segredos, módulo de BI, login do Hub, nem permissões de workstation. O som do navegador e a sirene industrial permanecem logicamente independentes. O botão mute real precisa de validação funcional específica na E034 antes de qualquer liberação.
- Preserva modo legado quando central OFF; flag `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED` existente segue OFF no launcher de HML e fábrica. Qualquer pessoa com grant `andon.settings.open` pode editar os quatro campos junto das demais configurações elegíveis; gerente com grant parcial `hub.settings.presentation.write` continua sem essa autoridade.

## Testes de segurança
- Atualizado `server/src/security/centralOperationalSettingsHttp.test.ts`: parsing positivo dos quatro campos e acesso humano delegado; rejeita timer 0/>240/string, mute runtime e tentativa de gestor parcial configurar áudio.
- Teste de regressão anterior `server/scripts/validate-central-operational-settings-pg.mjs` continua negando mute e agora usa temporizador inválido para o caso negativo.
- Novo `server/scripts/validate-central-browser-sound-timer-pg.mjs`: protege com `ANDON_INTEGRATION_TEST=1` e DATABASE_URL path **/andon_test**, ambos flags inicialmente OFF; usuário Produção humano scope selected com grant, teste via HTTP Fastify de HTTPS/Origin/CSRF, dados inválidos/flag off, sucesso dos quatro campos, audit rollback de gravação após falha intencional IP >45, auditoria idempotente, grant revogado imediatamente, runtime mute/Sirene fora do alcance, estado atual do mute preservado. Adicionado à suite `test:access:integration` para PostgreSQL real em GitHub Actions Windows/Linux/backend/frontend/browser.

## Portões
PR DRAFT, CI-only PR contra main NUNCA MERGIR. Não instalar no notebook antes de homologação: E034 #385 head `92debbe57d96f452cc2d72082e3fd6787294b246` permanece única versão em teste. #368 continua aberta para a parte **G2 — mute em tempo real e prova de isolamento externo (GPIO)** e R12-04H revisão das 10 abas/perfis, além de aceite na HML. Não tocar `C:\web-andon-industrial\andon`, `andon_db`, fábrica, M37, Node-RED, GPIO ou CLP.
