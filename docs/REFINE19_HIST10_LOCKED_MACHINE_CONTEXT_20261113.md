# REFINE19 HIST-10 — Contexto de máquina fixo ao investigar histórico individual

## Evidência e problema
A issue #479 exige que a rota de Histórico Global aberta pelo histórico de uma máquina mantenha a máquina obrigatória e imutável na consulta. O código atual usa `?machineId` ao carregar e preserva ao Limpar (HIST-09), porém ainda exibia `<select>` com `Todas permitidas` e permitia mudar o ID durante um filtro, podendo ampliar a consulta visual sem voltar ao Hub.

## Alterações
- Quando a URL de origem contém um machineId específico, a interface troca o seletor por um campo de leitura com cadeado e nome da máquina autorizada (ou apenas o ID que já constava na URL se não houver catálogo).
- A edição do draft força `machineId` da URL; Submeter também reaplica a máquina antes da validação do filtro, evitando que mudanças tardias no estado do formulário ampliem o escopo. O botão Limpar continua preservando o ID (HIST-09). Ao abrir Histórico Global normalmente pelo Hub sem machineId, o seletor Todas/máquinas autorizadas continua funcionando.
- Os filtros, exportação por página, indicadores, seleção cronológica, detalhe e paginação permanecem com consulta server-side. A autorização SQL `history.read` e `machineScope` continua obrigatória em cada rota, não delegada ao frontend.

## Segurança / testes
Frontend, texto PT/EN/ZH e regressão HIST-10. Não altera backend, API, banco, snapshots, KPI, registros, usuário, permissões, produção, PLC, GPIO ou Node-RED. Requer CI Windows PS5.1 + Linux/PostgreSQL/SSR/UI antes de merge. Notebook: histórico da máquina 10 -> Histórico Global; aplicar filtros e Limpar não deve permitir mudar de máquina; entrada pelo Hub oferece seleção global autorizada. Não declarar homologado sem retorno.
