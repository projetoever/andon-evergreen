# REFINE 12 — R12-04D1 | Gestão auditada de conjuntos do ANDON (#368)

Data: 09/11/2026. Base: R12-04C #402 → R12-04B #400 → R12-04A #398 → E034 #385.

## Escopo concluído no código (ainda não liberado)
- `POST /api/machines/:machineId/sets` e `PATCH /api/machine-sets/:id` passam por uma política de configuração central com **flag independente** `ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED=1` (**OFF por padrão**). `DELETE /api/machine-sets/:id` e todas as rotas de subconjuntos continuam BLOQUEADAS na central. Não se altera a API legada com central OFF.
- O administrador principal ou **qualquer usuário humano com `andon.read` e `andon.settings.open`** pode gerir o catálogo de conjuntos de todas as máquinas por meio dessas rotas de configuração, mesmo tendo `machineScope=selected` para os chamados e operações normais. Cargo não determina o poder; `catalog.assets.manage` isolada continua exigindo escopo total. `GET` de conjuntos de outras máquinas só é ampliado, por essa flag, para delegado real; não amplia leitura de histórico/chamados nem controle físico.
- Exige HTTPS/Origin, workstation ativa/aprovada, sessão humana normal Hub, CSRF e marker específico por solicitação. Revalida identidade, estação e autorização **dentro** da transação PostgreSQL após locks de usuário, estação e máquina. O bypass da senha Admin antiga é restrito à solicitação pré-validada.
- O proprietário do conjunto é obtido **da URL para criação** ou do banco para edição; o corpo nunca pode mudar `machineId`. Não aceitar `type` legado, ID forjado, objeto/credencial ou campos extras. Campos permitidos: `name`, `code`, `typeId`, `description`, `isActive`, `displayOrder`. Tipo ativo obrigatório na criação e em trocas de tipo. Código normalizado como no fluxo legado e único por máquina, com bloqueio de concorrência.
- **Integridade de histórico e KPIs:** nenhuma mudança de nome/código/tipo em conjunto referenciado por chamada histórica, inclusive vínculos de conjunto confirmado. Impede desativar conjunto em chamada ativa ou com subconjunto ainda ativo. Permite atualização de metadados descritivos sem reescrever snapshots dos chamados.
- Eventos auditáveis `andon.machine_set.settings.create` e `andon.machine_set.settings.update` com autor real, estação, ID da máquina, snapshots allowlist antes/depois. Escrita de catálogo e registro de auditoria formam **uma transação**, com rollback em falha.
- Não adiciona migrate nem altera banco original ou máquina 37.

## Testes obrigatórios
- `server/src/security/centralMachineSetSettingsHttp.test.ts`: flag OFF, método e URL exatos, DELETE/subset/estado físico bloqueados, perfil Produção/Manutenção/Líder/Gerente/customizado com grant (e selected), conta sem grant/kiosk/troca de senha negados, CSRF, payload/reparenting.
- `server/scripts/validate-central-machine-set-settings-pg.mjs`: exige `ANDON_INTEGRATION_TEST=1` e **PostgreSQL exclusivo `/andon_test`**, flags centrais OFF na entrada; duas pessoas e workstations com duas conexões, HTTP TLS fake/Origin/CSRF, POST/PATCH, READ delegado, DELETE bloqueado, rejeição de tipo inexistente, chamados ativos e históricos, filho ativo, corrida de código, falha de auditoria com rollback e revogação.
- Incluídos no `test:access` e `test:access:integration` do servidor. A CI Windows/Linux, PostgreSQL e browser decide o gate; não presumir aceite antecipado.

## Fronteiras do REFINE
R12-04D1 cuida de **conjuntos**, não subconjuntos. Próxima fase R12-04D2: subcomponentes, escopo derivado do conjunto, manufacturer/model/assetTag, snapshots de chamadas, auditoria e testes de concorrência. A issue #368 fica aberta para conjuntos/subconjuntos completos, máquinas, sons, demais configurações e HML.

**SEM MERGE, SEM DEPLOY, SEM FLAG NA HML.** O notebook usa E034 #385 SHA `92debbe57d96f452cc2d72082e3fd6787294b246`, backup/restauração já validados, mas testes operacionais do usuário pendentes. Nunca tocar `C:\web-andon-industrial\andon`, `andon_db`, servidor fábrica, M37, Node-RED, GPIO ou CLP. PR CI-only contra main é somente para testes: **NUNCA MERGIR**.
