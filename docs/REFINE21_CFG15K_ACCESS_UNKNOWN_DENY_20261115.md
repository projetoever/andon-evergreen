# REFINE 21 — CFG-15K | Acesso Hub indeterminado não é modo legado

Data: 15/11/2026. Base `main`: `3d1834b9c0c1c6a5edca691fb309c06e9544b422` (em homologação pelo operador).

## Problema
O Provider de acesso possui estado legítimo `access: null` durante a primeira consulta ou após erro de rede/sessão. Três seletores de mutação nas abas **Configurações gerais** e **Modo de atendimento** usavam a expressão `!centralMode` como permissão de gravação. Como `centralMode` só era `true` quando o acesso estava conhecido e explicitamente central, `access: null` acabava interpretado como "modo legado" e habilitava os controles, apesar de o servidor recusar a operação.

## Correção mínima
- Exigir `access !== null` antes de considerar gravações e seleção por nome habilitadas. Modo legado realmente confirmado segue com o mesmo comportamento; modo central continua dependente de suas flags distintas.
- Preservar todas as regras existentes: configuração geral do ANDON, PIN/RFID, captura de modo declarado, autenticação própria do servidor, CSRF, escopo e auditoria.
- Não alterar o Provider, a API, os perfis, as flags ou o armazenamento do modo de atendimento.
- As mensagens e os campos existentes permanecem estáveis. Quando acesso do Hub não puder ser confirmado, as ações só poderão ser habilitadas depois da recuperação.

## Validação
- Atualizadas invariantes de testes já existentes `tests/adminUxRefinementA.test.ts` e `tests/centralAttendanceMode.test.ts`.
- Nova regressão na matriz `tests/centralSettingsCapabilityMatrix.test.ts` relaciona explicitamente a existência de `access: null` com a negação de escrita.
- CI deve passar Windows + PostgreSQL + backend + frontend/SSR + navegador desktop/mobile.

**Segregação:** PR independente e mantida em draft enquanto o operador atualiza e homologa a `main`. Nenhuma integração na `main` durante a atualização; sem deploy, migração, banco de fábrica, CLP, Node-RED, GPIO, alarmes ou KPI.
