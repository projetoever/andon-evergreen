# SEC-04/2Q — Compatibilidade visual de modo de atendimento com login central

Data: 30/10/2026. P0 para rodada consolidada dos 11 ajustes, depois de #290.

## Problema constatado
O padrão legado `attendanceMode=name` ainda pode persistir no sistema e a opção “lista de nomes” aparece nos modais de atendimento e encerramento. Em central, as operações efetivas estão corretas em rejeitar nome sem credencial, mas a interface oferecia ação impossível, gerando tentativas repetidas e mensagens confusas.

## Comportamento
- Em **legado** (central OFF), manter integralmente seleção por nome, PIN e RFID conforme configuração global existente. Não alterar `SystemSettings.attendanceMode` e não migrar banco.
- Com **login central** (central ON), jamais habilitar a rota de escolha por nome para ações de atendimento, inclusão ou saída individual; derivar **PIN** caso o legado esteja configurado como `name`, ou manter `pin`/`rfid` escolhidos. Opções alternativas continuam PIN e RFID, não nome.
- Mostrar instrução na UI, traduzida PT/EN/ZH-TW. No painel de configuração legado, desabilitar seleção do modo `name` quando a sessão central estiver ativa, com explicação de que não autentica o profissional. Não escrever automaticamente um modo novo no banco.
- Corrigir também o handler `handleNameSubmit` como defesa de profundidade em ambos os modais; back-end continua a exigir credential com checks transacionais.
- Testar os dois regimes e o modo salvo, sem mudar regras do último técnico (1→0 bloqueado), permissões, CSRF, Node-RED, som, severidade ou classificação do BI.

## Validação
`tests/centralAttendanceMode.test.ts` integrado a `test:dashboard` e regressão completa backend/PostgreSQL/HTTPS/frontend/Windows via CI. Flags seguem OFF por padrão. Nenhuma alteração no servidor industrial, certificados, banco real, Máquina 37, GPIO ou Node-RED.
