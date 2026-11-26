# DOC 1 — Inventário de autorização, módulos e superfície de API

**Controle:** DOC1-SEC-001 · 25/11/2026 · baseline funcional `6018335c...`  
**Fontes primárias no código:** `server/src/access/policy.ts`, `server/src/access/centralActionRegistry.ts`, `server/src/routes/modules.ts`, `server/src/routes/accessAudit.ts`, `server/src/services/moduleRegistry.ts`, `src/routes/`.  
**Uso:** especificação de documentação interna baseada no código; não é pentest, revisão exaustiva de handlers ou prova de HML.

## 1. Princípio de menor privilégio

Em acesso central, a decisão depende de usuário autenticado, sessão válida, estado da workstation, grants por ação e `machineScope`. O Admin principal possui regra de autoridade própria; demais usuários **não** recebem privilégio por rótulo de cargo. `assertPermission` rejeita ação não conhecida, bloqueia usuário em troca obrigatória de senha e compara ID da máquina quando há escopo limitado. Restrições adicionais (owner, token, CSRF, transação, credencial de outra pessoa, CAS) são validadas no fluxo específico. Controle visual não é controle de API.

O modo legado tem políticas próprias de módulo por estação e não deve ser descrito como equivalente ao modelo central; `apiModule()` não aceita cabeçalho do cliente como fonte de autoridade. A tabela de rotas em `centralActionRegistry` **não autoriza requests por si só**.

## 2. Módulos

| Módulo / interface | Permissão de entrada central típica | Outras condições |
|---|---|---|
| ANDON `/andon` | `andon.read` | Aprovação da estação, sessão, `machineScope`, grants de operação |
| ANDON BI `/bi` | `bi.read` | Escopo das consultas; `bi.export` para exportar quando exigido |
| Prioridades `/machine-priorities` | `priorities.read` | `priorities.write` para editar sequência global; concorrência e sessão |
| Histórico Global `/history` | `andon.read` + `history.read` + `history.global.read` | Disponibilidade central e escopo do usuário; validar endpoint |
| Configuração ANDON | `andon.settings.open` | Acesso à tela não concede automaticamente todas as ações operacionais; catálogo possui delegação controlada |
| Hub / usuários / estações | Não há um único “admin tudo” delegável | Grants específicos de usuários, workstations e apresentação |
| Central de auditoria do Hub | `audit.read` | `audit.export` mais `audit.read` para CSV; Admin principal possui acesso |

`/api/modules/access` é o resumo autorizado de módulos; não tratar `localStorage` nem presença de ícones como autorização. Auditoria do usuário depende do contrato API em `accessAudit.ts`.

## 3. Permissões declaradas no backend

| Domínio | Grants do `policy.ts` | Uso de documentação |
|---|---|---|
| Operação | `andon.read`, `andon.settings.open` | Entrada/leitura, abrir configuração (escritas por regra específica) |
| Chamados | `calls.open`, `calls.cancel.own`, `calls.cancel.any`, `calls.attend`, `calls.technicians.manage`, `calls.finishMaintenance`, `calls.finish`, `calls.followUp`, `calls.returnToMaintenance` | Diferenciar abrir, atender, gerenciar técnicos, acompanhar, cancelar, concluir e retornar |
| Histórico | `history.read`, `history.global.read` | Histórico da máquina versus histórico transversal |
| Máquina e programação | `machines.status.write`, `production.schedule.request`, `production.schedule.write` | Estado, solicitação one-shot de alteração ou escrita autorizada; programação não é ranking |
| Diagnóstico/BI | `diagnosis.edit`, `analytics.reclassify`, `analytics.policy.manage`, `bi.read`, `bi.export` | Alterar dados e política é diferente de visualizar/exportar |
| Prioridades | `priorities.read`, `priorities.write` | Consulta versus alteração global com CAS |
| Catálogos | `catalog.assets.manage`, `catalog.reasons.manage`, `catalog.classifications.manage`, `catalog.technicians.manage` | Cadastros de ativos, motivos, classificações e técnicos |
| Estações | `workstations.read`, `workstations.screen.unlock`, `workstations.manage` | Consulta, desbloqueio one-shot e administração |
| Hub e usuários | `hub.settings.presentation.write`, `users.create` | Apresentação e criação de usuários; outros atos possuem gates adicionais |
| Auditoria | `audit.read`, `audit.export` | Consultar e exportar com permissões independentes |

A lista acima inventaria constantes do código, **não** concede automaticamente operações a papéis. Montar a matriz efetiva **usuário × recurso × ação × máquina** consultando grants e políticas no ambiente homologado antes de publicar um manual de cargos.

## 4. Famílias de rotas e verificação

| Família | Exemplos de endpoint | Risco/regra a testar |
|---|---|---|
| Catálogo/estado | `GET /api/machines`, `PATCH /api/machines/:id/status` | Leitura escopada, escrita de máquina |
| Chamados | `POST /api/andon-calls`, `POST /api/andon-calls/batch`, `PATCH /api/andon-calls/:id/attend`, `.../finish` | OS, grupo/setor, transações, mais de um técnico e autorização |
| Programação | `PATCH /api/machines/:id/production-mode` e fluxo central de sessão/credencial | `production.schedule.request/write`, mudança de modo, 409 e auditoria |
| Histórico | `GET /api/andon-calls/history` e endpoints de detalhe/exportação na família de chamados | Não vazar dados entre máquinas, filtros e CSV |
| Prioridades | `GET/PUT /api/dashboard-priority/order`, `GET /api/dashboard-priority/history` | Escrita global, P1..Pn, 409 por revisão |
| BI | `/api/analytics/*` | `bi.read`, filtros, denominação e cálculo causal, exportação |
| Auditoria Hub | `GET /api/access/audit-events`, `GET /api/access/audit-events/export` | 50/página, CSV até 20.000, ACL no servidor |
| Telemetria UI | `POST /api/access/audit-events/navigation`, `.../interactions` | Apenas página/controle permitidos; **não** enviar campos digitados, senha, PIN, token, query string |
| Módulos | `GET /api/modules/access` | Resumo autorizado vem do servidor, não de ícone/role textual |
| Health | `GET /health`, `GET /health/db` | Distinguir processo vivo de conexão com banco |

A correspondência endpoint→permission deve ser confirmada nos próprios handlers quando um novo manual citar mutações sensíveis. Não interpretar esta lista como especificação OpenAPI exaustiva.

## 5. Modelo mínimo de teste negativo

Para cada função, executar com: Admin principal; usuário com grant; usuário só leitura; usuário sem grant; escopo de máquina parcial; workstation pendente/bloqueada; sessão revogada; pedido concorrente. Validar **UI e URL direta**. Os 401/403 devem negar sem side effect; 409 deve solicitar atualização e preservar dados; 400 deve mostrar erro de validação sem operação parcial. Não fabricar resultado “sem permissão” a partir de um botão oculto.

## 6. Auditoria e privacidade

A central de auditoria consulta `AuditEvent` persistido. Leituras e exportações são eventos auditáveis. `audit.read` **não** implica `audit.export`. CSV é sanitizado contra execução de fórmula e limitado em volume; os filtros e o intervalo devem ser conferidos no fuso aplicável. Eventos de clique/navegação são **best effort** e não substituem evento transacional de alteração efetivada.

Ver [PENTE 6](PENTE6_AUDITORIA_I18N_NAVEGACAO_20261125.md), [homologação](DOC1_HOMOLOGACAO_GUIADA_20261125.md) e os próprios arquivos de implementação para o contrato exato.
