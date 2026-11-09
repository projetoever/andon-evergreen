# REFINE 12 / R12-04E — Catálogos de tipos de conjuntos e subconjuntos (#368)

Data 09/11/2026 | Base R12-04D2 #406 (subconjuntos) → D1 #404 (conjuntos) → #402 → #400 → #398 → E034 #385.

## Motivação e distinção

A interface e as rotas legado `server/src/routes/machineCatalogs.ts` já permitem cadastrar e editar tipos de conjuntos (`machine_set_types`) e subconjuntos (`machine_subset_types`). R12-04E **não recria nenhuma tela nem migrates**; amplia apenas sua integração na autenticação central para qualquer perfil humano ao qual o Admin atribuir `andon.settings.open`.

- `GET /api/machine-set-types` e `GET /api/machine-subset-types` passam como catálogos de referência de ANDON (`andon.read`), mesmo para usuários `machineScope=selected`, sem acesso a históricos de máquinas fora de escopo.
- `POST /api/machine-set-types`, `PATCH /api/machine-set-types/:id`, `POST /api/machine-subset-types`, `PATCH /api/machine-subset-types/:id` por guarda central exclusiva `ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED=1`, **OFF por padrão**, independente das flags de conjuntos e subconjuntos.
- **DELETE de tipos continua NEGADO em central**; o legado só é usado no modo central OFF, sem mudanças.
- Principal Admin ou qualquer usuário humano normal com `andon.read` e `andon.settings.open` em papel Produção/Manutenção/Líder/Gerente/customizado (inclusive `machineScope=selected`) pode editar estes catálogos GLOBAIS de configurações. Não confere administração do Hub, BI, Prioridades, workstations ou direitos operacionais sobre chamadas/máquinas. `catalog.assets.manage` isolado exige escopo total.
- HTTPS, Origin fixada, cookie seguro sessão Hub, workstation admitida, CSRF específico, marcador por requisição, e revalidação de usuário/permissões/workstation/flag em transação PostgreSQL após locks **usuário → workstation → catálogo de tipos específico → row do tipo**.
- Corpo validado rigorosamente: `name` não vazio, `code` normalizado (com código único por catálogo), `description` texto opcional, `isActive` booleano e `displayOrder` inteiro limitado. Proibidos ID/reparenting/machineId, dados de credenciais e campos extras.
- **Proteção referencial e do histórico:** nome/código de tipo já usado por conjunto ou subconjunto é imutável para não reinterpretar identidade/indicadores; não desativa tipo com equipamentos ativos vinculados. Metadados documentais e ordenação podem ser editados sem alterar snapshots anteriores. Sem apagar registros de tipo em uso.
- Auditoria imutável transacional: `andon.machine_set_type.settings.create/update` e `andon.machine_subset_type.settings.create/update`, identidade humana, station, antes/depois. Falha ao escrever auditoria reverte alteração integral.

## Evidências e gates

Testes unit `server/src/security/centralAssetTypeCatalogHttp.test.ts`: rotas exatas, flag OFF, DELETE negado, todos perfis humanos, scope selected, kiosk e sessão de troca de senha, CSRF e payload.
Testes PostgreSQL real isolado `server/scripts/validate-central-asset-type-catalogs-pg.mjs`: **somente** URL com path `/andon_test`, `ANDON_INTEGRATION_TEST=1`, flags inicialmente OFF; HTTP simulado com TLS/Origin/CSRF, POST/PATCH para **ambos** catálogos, leitura da referência para usuários com `andon.read`, equipamento vinculado e chamado histórico com snapshot estável, deactivation bloqueada, concorrência de duas workstations/clientes PG pela mesma chave, reversão de mudança por falha da auditoria e revogação de permissões.
Integrados em `test:access` e `test:access:integration`; CI Windows PS5.1, Build/PostgreSQL/frontend/browser. Não declarar etapa pronta até `COMPLETED/SUCCESS` e confirmação do log PG.

## Restrição de implantação

PR funcional DRAFT empilhada, PR de CI-only contra main **NUNCA MESCLAR**. E034 #385 SHA `92debbe57d96f452cc2d72082e3fd6787294b246` continua como versão do notebook HML do usuário; nenhum novo flag foi ativado nela. Não tocar ambiente industrial `C:\web-andon-industrial\andon`, `andon_db`, fábrica, M37, CLP, Node-RED nem GPIO. Issue #368 aberta: pendentes editar máquinas existentes, som, revisão final das 10 abas, aceites reais da HML e fechamento de segurança.
