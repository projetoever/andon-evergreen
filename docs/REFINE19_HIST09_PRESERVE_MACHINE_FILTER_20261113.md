# REFINE19 HIST-09 — Limpar filtros preserva máquina de origem

Data: 13/11/2026. Issue #479. Cenário: usuário autorizado entra em Histórico Global pelo link do histórico individual de uma máquina.

## Problema
O componente respeitava o parâmetro `?machineId=` ao entrar e quando a URL mudava. Mas o botão Limpar descartava o ID e passava para `machineId: all`, expandindo a consulta visual para todas as máquinas autorizadas sem que o usuário tivesse solicitado isso. O servidor ainda aplicava o escopo, porém a navegação surpreendia o usuário e descontextualizava a análise da máquina.

## Solução
O botão Limpar utiliza a configuração padrão combinada com `requestedMachineId` vindo da URL validada. Para entrada normal pelo Hub, o padrão continua all. Limpa datas, horários, categorias, técnicos, OS e paginação; fecha detalhe mobile; mantém somente o contexto original da máquina. A busca continua server-side e a política SQL de escopo/ACL de histórico não muda.

## Segurança e testes
Somente UI, sem mudança de API/DB/SQL, flags ou qualquer operação industrial. Regressão HIST-09 em tests/globalHistoryUiIntegration.test.ts e gates CI Windows/Linux/PostgreSQL/SSR. No notebook: abrir Histórico individual Máquina 10 > Histórico Global, aplicar filtros e Limpar; máquina 10 deve permanecer. Abrir Histórico Global pelo Hub e Limpar; deve continuar Todas permitidas. Não homologado sem retorno do responsável.
