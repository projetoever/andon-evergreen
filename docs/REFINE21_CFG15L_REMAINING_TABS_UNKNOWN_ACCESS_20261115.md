# REFINE 21 — CFG-15L | Cinco abas administrativas fail-closed com acesso Hub ainda não verificado

**Data:** 15/11/2026. **Base oficial congelada:** `05e46767faf982d0bebf242738d389622d906fe4` (patch P0 de login em homologação no notebook). **Issue:** #477.

## Evidência do código e correção

Nas abas **Turnos**, **Setores/categorias**, **Mantenedores** e **Catálogos de ativos**, uma consulta central de acesso em andamento ou indisponível produz `useModuleAccess().access === null`. O código anterior usava `!centralMode || flag` onde `centralMode = access?.centralAccessEnabled === true`. Portanto o estado desconhecido era interpretado como modo legado e a UI liberava comandos de gravação sem validação de identidade. A API já nega alterações não autorizadas, mas essa UX confunde a operação.

Todos os controles desses quatro painéis passam a exigir a identidade de acesso **não nula**. Só quando a API confirmou `centralAccessEnabled:false` podem usar permissões legadas. Com acesso central confirmado, ainda é necessária a flag correspondente:
- Turnos: `centralShiftUpdateEnabled` e, independentemente, o filtro `centralOperationalSettingsWriteEnabled`.
- Setores: `centralCategorySettingsWriteEnabled`; botão e função de **exclusão** só existem/executam em modo legado confirmado (DELETE central continua proibido).
- Mantenedores: gates independentes para criar/editar `centralTechnicianCreateEnabled` / `centralTechnicianUpdateEnabled`.
- Catálogos de ativos: `centralAssetTypeCatalogWriteEnabled` e política `centralOperationalSettingsWriteEnabled`; **exclusão** apenas em modo legado confirmado.
- Motivos/subcategorias: a função central já usava a flag `centralCallReasonsCatalogEnabled`, porém podia manter esse estado enquanto `access` passava a `null`. Agora a guarda de escrita exige também o Hub confirmado; o modo de prévia dos formulários não concede permissão.

## Correção de desatualização de permissões

A aba **Catálogos de ativos** consultava as flags globais apenas na montagem da tela. Agora consulta novamente ao retornar foco ou ao receber `SYSTEM_SETTINGS_CHANGED_EVENT`. Enquanto verifica, as capacidades ficam em `null` (somente leitura). Uma falha de consulta não concede acesso. Respostas atrasadas são ignoradas por número de requisição e cleanup. Essa validação **não modifica** a seleção de catálogo, formulários em edição nem a política de chamada previamente carregada.

A autorização no servidor continua soberana: todas as alterações requerem conta/sessão válida, workstation, permissões específicas, CSRF, filtros de máquina, validações e auditoria já existentes.

## Testes e limites

- Novas asserções em `tests/centralUnknownAccessFailClosed.test.ts`, incluídas em `npm run test:ui`, verificam as cinco abas, bloqueios de DELETE, flags independentes e não mutação de drafts.
- Atualizados os testes legados em `tests/adminUxRefinementA.test.ts`, `tests/centralShiftsDualGates.test.ts`, `tests/centralSettingsCapabilityMatrix.test.ts`.
- Esperar CI Linux, PostgreSQL, compilação, UI e instalador Windows sem falhas.
- Não modifica schema, migrações, configurações de ambiente, trabalho industrial, produção, privilégios de usuário ou flags. Não executa deploy; branch independente.

**Homologação visual:** com uma conta sem permissão, abra cada aba e force uma falha temporária de verificação. Botões devem permanecer desabilitados/ocultos; após retorno autorizado, habilitar somente funções do perfil e flags. Na aba Catálogos, altere a flag no servidor em ambiente seguro, volte o foco e confirme que a tela não mantém botão de gravação habilitado por cache; rascunho permanece.
