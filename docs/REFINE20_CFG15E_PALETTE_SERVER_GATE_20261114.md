# REFINE 20 — CFG-15E | Paleta global: revalidação ao foco/evento sem perda da prévia

Data: 14/11/2026. Base `0011235e66e60b9c6aed9113c70edf72791954c6`. Fonte: #477 (11 abas) e #480.

## Defeito prevenido
A aba Aparência e cores consultava `andonVisualPaletteWriteEnabled` somente no carregamento. Se autorização/flag/revisão mudassem enquanto a tela permanecia aberta, a edição de aparência podia aparentar estar liberada até a tentativa de gravar, com erro 403 ou 409. As outras abas já revalidam capacidades ao recuperar foco/evento.

## Intervenção mínima
- Ao receber `focus` ou `SYSTEM_SETTINGS_CHANGED_EVENT`, buscar `readGlobalVisualPalette()`, que consulta GET `/api/system-settings` e sua flag no servidor. Nunca usar `CustomEvent.detail` como autorização.
- Bloquear gravação conservadoramente durante consulta ou falha; a prévia local pode continuar. Mensagem específica PT/EN/ZH e status adequado.
- Caso a revisão do servidor difira da revisão carregada, marcar conflito e exigir **Recarregar paleta** antes de qualquer sobrescrita.
- Atualização de capacidades NÃO chama `setDraft`, `setSaved` nem `setRevision`; não apaga HEX/RGB ou preset em edição. Apenas o reload explícito restaura os dados atuais.
- Desvincular listeners e invalidar respostas obsoletas ao sair; bloquear também restauração global se a capacidade foi revogada.
- Continuam valendo PATCH protegido, CSRF/Origin/session/workstation/ACL, optimistic concurrency, auditoria em PostgreSQL e proteção das cores críticas danger/warning.

## Escopo e homologação
Somente `AppearanceSettingsPreview.tsx`, duas traduções e `tests/globalVisualPalette.test.ts`. Sem alteração de backend, políticas KPI, dados, migrations, flags, temas locais, CLPs/Node-RED/GPIO ou fábrica.

Teste manual: editar cor HEX/RGB e mudar foco; revogar flag/grant em outra sessão; GET falhar; reativar flag; outro Admin alterar revisão; cancelar/restaurar; trocar tema claro/escuro; confirmar ausência de perda do rascunho. CI Linux/PG/frontend/SSR/Windows antes de merge; notebook apenas pelo operador.
