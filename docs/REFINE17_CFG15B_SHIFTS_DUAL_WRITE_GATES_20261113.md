# REFINE 17 — CFG-15B: controles independentes da aba Turnos

Data: 13/11/2026. Esta etapa complementa a matriz das 11 abas (CFG-15A).

## Problema confirmado

A aba de Turnos oferece duas gravações com backends e permissões distintas, mas ambas eram acionáveis no acesso central mesmo quando o respectivo endpoint estava sob feature flag OFF. Isso gerava tentativas `403` esperadas da API e podia confundir o operador:

1. `PATCH /api/shifts/:id` — alteração de nome, horários e status do turno, com `ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED`.
2. `PATCH /api/system-settings` — `filterTechniciansByCurrentShift`, com `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED`.

Ambas dependem adicionalmente de sessão, estação aprovada, Origin/HTTPS, autorização individual, CSRF, locks e auditoria. O gate não equivale a permissão de usuário.

## Correção

- Reutiliza exclusivamente as flags **read-only** já retornadas pelo servidor `centralShiftUpdateEnabled` e `centralOperationalSettingsWriteEnabled`, introduzidas/verificadas no CFG-15A.
- No modo central, inputs de turno e botão Salvar são desabilitados quando o gate do turno está OFF ou desconhecido. O filtro de mantenedores permanece **independente** desse gate, com seu próprio controle de disponibilidade.
- Quando o gate do filtro está OFF/desconhecido, a preferência é consultável, mas não pode ser alterada. Impede gravação duplicada enquanto a API responde.
- Em caso de falha de gravação do filtro, a UI reverte o valor otimista; em sucesso usa **o valor confirmado pela API**.
- Avisos PT/EN/zh-TW explicitam a independência. Modo local/legado permanece com o comportamento de edição existente.
- Não cria novos turnos, não altera a definição de turno no servidor nem mexe em permissões, banco industrial, CLPs, físicos, Node-RED, GPIO, volumes ou feature flags.

## Testes

`tests/centralShiftsDualGates.test.ts` verifica separação das flags, controles indisponíveis, retorno conservador, confirmação pela API e rota central protegida. CI deve validar build frontend, i18n, SSR, segurança, PostgreSQL, instalador Windows PowerShell 5.1.

## Pendências

CFG-15C: estados de erro e retry explícito para cadastro de turnos, editores de máquinas/mantenedores, classificações e sons; validar fluxos reais no notebook após atualização autorizada pela main. Nenhum aceite físico foi realizado por esta PR.
