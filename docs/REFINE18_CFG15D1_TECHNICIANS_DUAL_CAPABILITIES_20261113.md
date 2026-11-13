# REFINE 18 — CFG-15D1 Mantenedores: gate duplo real e fail-closed (13/11/2026)

## Evidência
`server/src/services/systemSettings.ts` expõe, individualmente e a partir dos guardas centrais existentes, `centralTechnicianCreateEnabled` e `centralTechnicianUpdateEnabled` (não são equivalentes). `TechniciansSettingsTab.tsx` exibia uma mensagem genérica de disponibilidade, mas permitia criar e editar mesmo com as flags desligadas, gerando tentativas de escrita inevitavelmente rejeitadas pela API.

## Implementado
- `TechniciansSettingsTab` usa `useModuleAccess().access.centralAccessEnabled` e consulta uma vez `getSystemSettings` para descobrir as duas capacidades já expostas pela API.
- Enquanto carrega, em falha de conexão ou quando flag está desligada, inicia e permanece **sem permissão de gravação**; permite nova consulta por Tentar novamente.
- `canCreateTechnician` e `canUpdateTechnician` são independentes em login central; no legado, comportamento existente preservado.
- O controle Adicionar requer flag de create; edição/ativação/desativação exige update; os inputs e o salvamento dependem da operação efetiva. Em cada handler há guarda adicional para evitar bypass pelo callback.
- Leitura, seleção de registro, filtros, listagem e retry da lista permanecem acessíveis mesmo se a escrita estiver desabilitada.
- Não substitui ACL: servidor ainda aplica todos os controles de sessão, workstation, CSRF, escopo e auditoria.
- Sem alterações em banco, schemas, flags, credenciais, dados da fábrica ou endpoint.
- Mensagens de status com traduções PT/EN/zh-TW; teste de regressão incorporado ao `tests/adminUxRefinementA.test.ts` na suíte já executada pelo CI.

## Gates
Validar com CI completo Windows e Linux/PostgreSQL/SSR/UI; depois de main verde, responsável deve testar no notebook com flags ON/OFF independentes e usuários variados. Não ligar flags como parte do pacote. Outras abas CFG-15D continuam pendentes.
