# UX-12/2B — Escrita global auditável (preparação para homologação)

**Status:** implementação isolada e bloqueada por default. Somente após integração do UX-12/2A e CI completa; sem habilitação na empresa.

## Nova rota

`PATCH /api/andon-visual-palette` (NÃO é a rota genérica de configurações).

Corpo aceito: `{ "palette": { "version": 1, "cardBorder": "slate", "selectedCardBorder": "evergreen", "sectorSelection": "evergreen", "operationAccent": "evergreen", "focusAccent": "evergreen" }, "expectedRevision": 0 }`.

- Apenas cinco propriedades não críticas + versão literal 1; acentos na whitelist. Vermelho/amarelo, alarmes, sons, KPIs, credenciais e CSS arbitrário não são configuráveis.
- Condição de ativação **ANDON_CENTRAL_ACCESS_ENABLED=1** E **ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED=1**, flag nova OFF por padrão. A flag não foi incluída nos perfis de produção nem na inicialização do notebook.
- Sessão central HttpOnly vinculada à workstation, HTTPS real e Origin autorizado, CSRF, workstation aprovada e ativa com módulo operacional, Admin principal, escopo de todas as máquinas. Não há credencial legada substituta.
- Processo sob transação: lock de usuário → workstation → linha global, releitura de sessão, concessões e workstation antes da mutação; compara `expectedRevision` após lock e rejeita conflito com HTTP 409.
- Registra ação `andon.visual_palette.updated` com antes/depois e revisão, na mesma transação. Erro no log reverte a atualização. Dados idênticos não criam nova revisão nem auditoria.
- Restaurar padrão no futuro será pedido explícito com preset versionado e revisão esperada; a UI ainda não envia gravações.
- API de leitura permanece `GET /api/system-settings`, autorizada conforme políticas atuais, com fallback quando JSON é inválido.
- Registros de mutação adicionados ao inventário SEC-04, com testes unitários da ACL, validação e E2E `andon_test` para CSRF, permissões, concorrência, auditoria/rollback, revogação e preservação do áudio.

## Pendente antes de ativar

- CI verde em todas as plataformas, testes de browser/foco e validação PostgreSQL de duas conexões.
- Aplicar o resultado nos componentes sem interferir nos estados de perigo/atenção e com variante claro/escuro.
- UI com `Salvar globalmente`, alerta de atualização concorrente, confirmação para `Restaurar padrão`, polling/ETag de revisão, tradução PT/EN/ZH, evidências e rollback.
- Homologação em notebook isolado e autorização específica, backup do banco e implantação controlada. **Não alterar a fábrica/Node-RED/PLC/GPIO**.

Ver `docs/UX12_GLOBAL_PALETTE_ROADMAP_20261030.md` e `docs/PLANO_DOCUMENTACAO_RELEASE_ANDON_20261030.md`.
