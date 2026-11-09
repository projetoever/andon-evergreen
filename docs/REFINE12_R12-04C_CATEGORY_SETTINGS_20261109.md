# REFINE 12 / R12-04C — Gestão de setores/categorias com delegação ANDON (#368)

Data: 09/11/2026. Branch criada sobre R12-04B #400 (turnos) → R12-04A #398 (mantenedores) → E034 #385, ainda sem merges.

## Escopo implementado
- Criação **POST /api/andon-categories** e edição **PATCH /api/andon-categories/:id** atrás de flag exclusiva `ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED=1`, **OFF por padrão** e NÃO ativada no launcher/HML/fábrica.
- **DELETE permanece bloqueado no acesso central** até uma fase distinta de política de exclusão com histórico e dependências. Não há bypass genérico de escrita.
- Admin principal ou **qualquer usuário humano com `andon.read` e `andon.settings.open`**, inclusive Produção/Manutenção/Líder/Gerente/personalizado e `machineScope=selected`. Para quem possui só `catalog.reasons.manage`, mantém-se a exigência de escopo completo. Rótulo de cargo não autoriza; o grant explícito é obrigatório.
- Pré-requisitos HTTPS, Origin, sessão Hub normal, workstation ativa/admitida, CSRF e marcador por requisição; revalidação de sessão, estação e permissão após locks em transação PostgreSQL. Senha administrativa legada só é dispensada na rota central prevalidada.
- Campos permitidos: no POST `id` (padrão já existente `[a-z0-9_]{2,40}`), `displayName`, `categoryGroup` (somente valores já existentes `maintenance`/`production`), `color` `#RRGGBB`, `active` booleano e `displayOrder` inteiro entre 0 e 9999. No PATCH, mesmos campos **exceto ID**, sem mutação de chamadas, KPIs, usuários ou máquina. Dado não permitido é rejeitado.
- Locks `user → workstation → category(id)`, compartilhando advisory lock com a implementação legada, e row lock para PATCH. A validação detecta setor duplicado, impede inativar/mudar grupo com chamado ativo e **rejeita qualquer mudança de grupo que reinterpretaria um chamado histórico**. Também rejeita mudar grupo de categoria vinculada a mantenedor ou `CallReasonOption`.
- Eventos de auditoria atômicos `andon.category.settings.create` e `andon.category.settings.update`, com snapshots do catálogo, usuário e estação reais; falha na escrita da auditoria desfaz alteração.
- A leitura de categorias em central com escopo selected já é operacional e permanece liberada; o fluxo legado não é alterado.
- Não inclui `quality` ou `leadership` como novos grupos físicos, porque a versão atual admite somente `maintenance`/`production`. A evolução das classificações de processos/qualidade/liderança e da política de KPI fica **separada**, sem conversão silenciosa.

## Verificação
- `server/src/security/centralCategorySettingsHttp.test.ts` cobre flags, rotas exatas, exclusão bloqueada, todos os rótulos humanos com grant, CSRF, sem grant, kiosk, allowlist/cores/grupos.
- `server/scripts/validate-central-category-settings-pg.mjs` exige `ANDON_INTEGRATION_TEST=1`, URL PostgreSQL com banco **somente `/andon_test`** e acesso central/flag OFF na entrada. Exercita HTTP real simulado TLS+Origin, 2 estações/pessoas, autorização, CSRF, leitura, criação/edição/auditoria, duplicidade, exclusão, chamado ativo, histórico/KPI, mantenedor atribuído, concorrência de duas conexões PostgreSQL, falha transacional na auditoria e revogação.
- Testes plugados em `test:access` e `test:access:integration`. CI Windows PowerShell 5.1 + Linux/PostgreSQL + frontend/Playwright. Não inferir aceite até CI concluída.

## Restrições de homologação
**PR DRAFT, SEM MERGE/DEPLOY.** E034 instalada pelo usuário no notebook permanece SHA `92debbe57d96f452cc2d72082e3fd6787294b246`; não mesclar branches empilhadas nem usar PR CI-only para deploy. Nenhuma flag nova foi habilitada na HML. A issue #368 permanece **ABERTA** até edições de máquinas, conjuntos/subconjuntos, sons e outras configurações, testes visuais reais e aceite explícito. Proibido tocar `C:\web-andon-industrial\andon`, `andon_db`, fábrica, M37, GPIO/PLC/Node-RED.
