# REFINE 12 — R12-04D2 | Subconjuntos das máquinas — configurações ANDON (#368)

Data: 09/11/2026. Base empilhada: R12-04D1 PR #404 (conjuntos) → R12-04C PR #402 (categorias) → #400 (turnos) → #398 (mantenedores) → E034 #385. Todas continuam em draft.

## Operações migradas
- `POST /api/machine-sets/:machineSetId/subsets` e `PATCH /api/machine-subsets/:id` em acesso central sob flag **exclusiva, OFF por padrão** `ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED=1`.
- `DELETE /api/machine-subsets/:id` continua **NEGADO**. A flag de conjuntos **não** habilita subconjuntos e vice-versa. Sem operação sobre produção/CLP/GPIO ou status físico da máquina.
- Sessão pessoal normal do Hub, HTTPS/Origin, estação admitida, CSRF e `andon.read`; Admin principal ou qualquer perfil humano com `andon.settings.open` pode configurar os ativos globais mesmo com `machineScope=selected`. Permissão `catalog.assets.manage` isolada segue exigindo full-scope. Não confere administração do Hub, BI, workstations, nem poder de alterar chamados.
- Revalidação de sessão, direitos, estação e flag dentro de transação PostgreSQL, com lock **usuário → estação → máquina proprietária (persistida) → conjunto pai (row lock) → subconjunto (row lock)**. Proíbe confiar em `machineId`/`machineSetId` enviados no corpo: o proprietário é resolvido sempre no banco ou na URL.
- Allowlist: `name`, `code`, `typeId`, `description`, `manufacturer`, `model`, `assetTag`, `isActive`, `displayOrder`. Rejeita reparenting, IDs forjados, credenciais e campos extras; valida tipo ativo, unicidade do código dentro do conjunto e ativo/inativo do conjunto pai.
- **Integridade histórica:** não permite alterar nome/código/tipo de subconjunto referenciado em chamada antiga ou confirmada; não permite desativar subconjunto em chamada ativa; alterações documentais não sobrescrevem os snapshots dos chamados existentes.
- Auditoria própria `andon.machine_subset.settings.create` ou `andon.machine_subset.settings.update`, autor humano/estação/máquina, before/after sanitizados na **mesma transação** que a mudança. Falha na auditoria implica rollback integral.
- GET do catálogo de subconjuntos é ampliado globalmente **somente** para delegado humano real e com a flag D2 ligada. A edição operacional permanece restrita ao escopo original da sessão.

## Testes de gate
- `server/src/security/centralMachineSubsetSettingsHttp.test.ts`: flag OFF, métodos exatos, DELETE bloqueado, 5 rótulos humanos, escopo selected com grant, sem grant, kiosk/troca senha, CSRF e allowlist.
- `server/scripts/validate-central-machine-subset-settings-pg.mjs`: **somente /andon_test** com `ANDON_INTEGRATION_TEST=1`, central + flag OFF ao iniciar. Exercita HTTP simulado HTTPS/Origin/CSRF, múltiplos usuários/estações, POST/PATCH, DELETE negado, subcomponente ligado à máquina via conjunto do DB, histórico e chamado ativo, conjunto pai inativo, corrida de duas conexões PostgreSQL por código, auditoria/rollback e revogação.
- Testes adicionados a `test:access` e `test:access:integration`. CI Windows, Linux/PostgreSQL e Playwright browser deverá ser aprovada antes de qualquer decisão de liberar HML.

## Aceite/segurança
**Sem merge, deploy, flags no launcher ou instalação no notebook.** A HML do usuário permanece exclusivamente E034 #385 SHA `92debbe57d96f452cc2d72082e3fd6787294b246`; testes operacionais de cadastro, histórico, cancelamento, mute, desfixar pendentes. Também faltam tipos de conjuntos/subconjuntos, edição de máquinas existentes e configurações de som na issue #368, além de homologação visual, portanto não declarar a segurança concluída. PR CI-only contra main é apenas para execução de workflow e **NUNCA DEVE SER MESCLADA**. Proibido alterar `C:\web-andon-industrial\andon`, `andon_db`, máquina 37, servidor da fábrica ou CLP/Node-RED/GPIO.
