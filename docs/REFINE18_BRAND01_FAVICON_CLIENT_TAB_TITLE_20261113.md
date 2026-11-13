# REFINE 18 — BRAND-01: favicon próprio e título da aba por cliente

Data: 13/11/2026. Escopo: identidade no navegador, **não** mudança do logotipo do Hub, do dashboard ou dos relatórios.

## Evidência e referência do código
- O produto é "Andon Web Industrial"; `src/components/layout/AppHeader.tsx` apresenta um ícone `Activity` sobre superfície em cor primária.
- `src/styles.css` e `src/theme/andonVisualPalette.ts` usam verde industrial/esmeralda, grafite e componentes de alto contraste. Nome Evergreen é cliente piloto, não marca universal.
- `src/routes/__root.tsx` usava título fixo `Andon Evergreen` e não tinha favicon próprio no repositório.
- `src/components/settings/HubClientIdentitySettings.tsx` já usa `getSystemSettings`/`updateSystemSettings` com `clientName`, `clientUnit`; a persistência está no PostgreSQL; o evento `SYSTEM_SETTINGS_CHANGED_EVENT` já é emitido somente após PATCH bem-sucedido.

## Entrega
1. `public/favicon.svg`: monograma A geométrico e traço de pulso industrial, verde esmeralda e grafite, SVG vetorial autossuficiente para renderização a 16, 32, 64 px. Sem nome do cliente, dependências de terceiros, scripts ou fonte.
2. Em `src/routes/__root.tsx` o `head` usa título neutro `Andon` no SSR e `<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=1">`; nenhuma outra logo é substituída.
3. `AndonBrowserIdentity` monta uma única vez no root; lê `GET /api/system-settings` existente no browser, exibe `Andon (Empresa)`; aplica imediatamente o evento após salvar em Hub, reconsulta ao focar a aba, e evita sobrescrever evento recente com consulta antiga.
4. `formatAndonBrowserTitle` limita e normaliza nome da empresa, preserva UTF-8/acento/CJK, remove controles e caracteres bidi; se ausente ou inválido mostra somente `Andon`; evita inserir HTML usando `document.title`.
5. Testes em `tests/hubCustomerBranding.test.ts`, já executados pelo job `test:ui`: fallback, unicode, evento, favicon autônomo, import root e API.
6. Não altera schema, banco, workflow industrial, credenciais, flags, permissões nem a imagem do Hub.

## Validação de entrega
- CI do PR: Windows PowerShell 5.1 + Linux/PostgreSQL/backend/SSR/frontend/browsers desktop/mobile.
- Verificar Vite copia `public/favicon.svg` em `dist/client/favicon.svg` após build e que o frontend compilado o serve com `image/svg+xml`.
- Teste físico após atualização no notebook: abrir `/hub` e `/andon` em Chrome Android/Windows, alterar nome da empresa por Hub > Empresa e unidade, confirmar atualização imediata no título, refresh, navegador sem cache, simular erro de consulta e confirmar fallback sem bloquear UI.

## Backlog e estimativa
Issue BRAND-01 #494; inventário vivo de 116 itens no Drive https://docs.google.com/document/d/1ZCJ8_SCBmFcPmbqDzUhuRFhDQe66CL3zDsNeUd_K1XU/edit?usp=drivesdk.
A etapa não inclui redesign geral, material comercial ou release industrial; fazem parte das fases de portfólio e marketing planejadas em paralelo.
