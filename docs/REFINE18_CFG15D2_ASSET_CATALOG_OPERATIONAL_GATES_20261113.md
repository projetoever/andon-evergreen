# REFINE 18 — CFG-15D2: catálogos de ativos em modo central (13/11/2026)

## Bug e risco
A aba Catálogos de ativos exibiu criação, edição, ativação, exclusão e a política global de abrir chamados no conjunto inteiro, mas com acesso central essas operações têm **guardas diferentes**. No backend, `centralAssetTypeCatalogEnabled()` só autoriza POST/PATCH de metadados, e **nunca DELETE**. A regra `allowWholeSetCalls` depende separadamente de `centralOperationalSettingsEnabled()`.

## Implementação
- O painel consulta `access.centralAccessEnabled` e aproveita a resposta de `getSystemSettings` já carregada para saber as flags `centralAssetTypeCatalogWriteEnabled` e `centralOperationalSettingsWriteEnabled`.
- Se qualquer flag correspondente estiver OFF ou se a leitura da API falhar, as ações de escrita associadas ficam desabilitadas e os handlers não emitem PATCH/POST. A lista, filtros, carregamento e atualização continuam disponíveis.
- Create/edit e ativar/inativar usam o gate do catálogo; política `allowWholeSetCalls` usa exclusivamente o gate de configurações operacionais. Começam em modo seguro enquanto as capabilities estão sendo consultadas.
- **DELETE oculto e bloqueado por handler no acesso central independentemente da flag**. A exclusão permanece apenas no modo legado. A inativação via PATCH, se o servidor e ACL permitirem, mantém integridade histórica.
- Não modifica o backend, nenhuma regra de KPI, nome da máquina, dados da fábrica, flags, banco, migrações ou permissões.
- Testes incorporados à suíte `tests/centralShiftsDualGates.test.ts` já executada pelo workflow existente, incluindo o contrato de guardas POST/PATCH.

## Próximos gates
CI completa Windows PS 5.1, Linux/PostgreSQL/API/SSR/UI. Validar no notebook oficial para flag catálogo OFF e ON, flag operacional OFF e ON, tentativa de excluir tipo central, compatibilidade de tipos em uso e modo legado. Não autorizar ativação de flags/produção como parte dessa PR.
