# REFINE 18 — CFG-15C: gravação segura nas abas Geral e Modo de Atendimento

Data: 13/11/2026. P0 do inventário vivo 116 itens.

## Problema reproduzido por revisão do código
No acesso central, `GET /api/system-settings` já informa `centralOperationalSettingsWriteEnabled` de forma segura. O aviso da aba mostrava o gate, mas os inputs e botões das abas Geral/Atendimento ainda podiam tentar `PATCH /api/system-settings` com a flag OFF, causando erros de API previsíveis (403). Essas abas fazem parte das 11 áreas do Admin e não devem oferecer alteração que o próprio servidor declara desabilitada.

## Mudanças
- **Geral**: após consulta da API, `centralWritable` é definido exclusivamente por `settings.centralOperationalSettingsWriteEnabled === true`; começa false e reverte a false durante refresh; `canWriteSettings` mantém comportamento legado em acessos não-centrais. Bloqueados: teclado virtual, OS obrigatória global, anti OS duplicada, restrição de finalização pela estação e ordem dos cards do dashboard. Guards também em cada handler evitam escrita por execução manual inadvertida. Leitura e botão Tentar novamente continuam disponíveis.
- **Modo Atendimento**: `canWriteAttendance` deriva do gate central operacional. Modos Nome/PIN/RFID, leitor, tamanho da tag e Salvar ficam somente leitura se gate OFF; o flag independente `centralDeclaredAttendanceEnabled` ainda restringe seleção por nome, mesmo com gravação disponível. Aviso explícito de leitura somente; Cancelar preservado para eventuais edições pendentes.
- Nenhum `updateSystemSettings` novo; nenhuma modificação ao backend, grants, registro de produção, tempos/KPI, banco, GPIO ou PLC.
- Traduções do aviso PT/EN/zh-TW.
- Regressão adicionada à suíte `tests/adminUxRefinementA.test.ts`, já contemplada pelo script `npm run test:ui --prefix server`.

## Testes necessários
CI Linux PostgreSQL/segurança/API/frontend SSR e UI + Windows PS 5.1. Depois de main CI GREEN, teste físico no notebook com flag OFF (leituras funcionam, inputs e save bloqueados) e ON após autorização (200/403 por ACL e reauth). Não ligar flags automaticamente.

## Próximas frentes
CFG-15D demais abas com erros/retry, CFG-08B3 integração categoria→motivo→opção→abertura, segurança operacional, HIST-06, rollout comercial somente após homologação.
