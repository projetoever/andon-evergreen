# UX-12 — Aparência / Cores (issue #289)

**Frente em pequenos PRs. Status deste pacote: fase 1/4 — catálogo de presets e prévia exclusivamente local.** Nenhuma atualização global, migração, publicação de cores para terminais ou alteração de banco ocorreu neste PR.

## Fase 1 — protótipo seguro da experiência

- Preset imutável `DEFAULT_VISUAL_PALETTE` versão 1, cinco campos visuais não críticos, quatro acentos previamente aprovados com variantes claro/escuro.
- Parser estrito rejeita CSS/HEX arbitrário, chaves adicionais, versões inesperadas e referências a cores de parada/atenção.
- Nova aba `Aparência e cores` no painel administrativo legado e prévia na área de configurações do ANDON no Hub central. Duas visualizações simultâneas (tema claro/escuro), com exemplos de card normal, seleção, setor, botão e foco.
- `Restaurar padrão da prévia` apenas redefine o rascunho de interface e **não realiza escrita no banco**. A UI identifica explicitamente que nada foi salvo globalmente.
- Nenhuma alteração nas cores de alerta `danger` e `warning`, no estado de chamados, som, PLC, Node-RED, GPIO, KPI ou PDFs. Alerta conserva a semântica existente.

## Próximas fases obrigatórias

### Fase 2 — persistência protegida

- Criar migration aditiva e default preservado em `system_settings` para `andonVisualPalette` com controle de versão.
- API de leitura com fallback seguro e **endpoint de escrita dedicado**, nunca abrir genericamente `PATCH /api/system-settings`.
- Central: Admin principal com permissão explícita, sessão normal, workstation aprovada, HTTPS/Origin/CSRF, revalidação sob lock, auditoria atômica antes/depois e rollback transacional; flag específica OFF por padrão.
- Modo legado preservado, com política administrativa independente e restritiva apenas se ainda necessário para migração.
- Rejeitar alterações externas aos cinco acentos homologados; não expor outros tokens, status, sirene ou credenciais.

### Fase 3 — salvar e aplicar globalmente

- Aplicar variáveis CSS somente de contorno e seleção não críticos, sem sobrescrever componentes de segurança. Cores de alerta continuam protegidas.
- Criar ação de confirmação `Restaurar padrão` no servidor com audit trail. UI com preview isolado e `Salvar globalmente` separado, estado de conflito e erro.
- Atualização entre terminais por polling controlado com versão/ETag ou evento específico, sem preferência local individual compartilhada.
- Não alterar o `theme=dark|light` local do UX-11.

### Fase 4 — aceite

- CI Windows, PostgreSQL isolado (permissões/concorrência/rollback), SSR, Playwright e testes de alteração entre dois navegadores.
- Verificar contraste mínimo e acessibilidade, PT/EN/ZH, kiosk 16:9, mobile e PDF BI.
- Homologação no notebook; **nenhum deploy na Evergreen ou na M37 sem autorização separada**.

O README geral será atualizado ao fim da estabilização, conforme plano de documentação do release em `docs/PLANO_DOCUMENTACAO_RELEASE_ANDON_20261030.md`.
