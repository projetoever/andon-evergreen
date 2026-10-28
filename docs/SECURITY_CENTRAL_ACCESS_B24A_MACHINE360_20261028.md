# ANDON BI — B2.4A | Controle de leitura por máquina no Machine 360
**Data:** 28/10/2026 · **Estado:** proposta de integração, sem deploy

## Problema e objetivo
O modo central permite que usuários tenham permissão de BI restrita a máquinas selecionadas. A rota detalhada `GET /api/analytics/machine-360` aceita um `machineId` informado pelo cliente. Antes da alteração, ela não verificava o escopo vinculado à identidade autorizada; por isso continuava bloqueada para usuários restritos pelo guarda global da API.

## Alteração segura
1. Adicionar apenas `GET/HEAD /api/analytics/machine-360` à lista explícita de leituras filtráveis. Demais relatórios agregados continuam bloqueados para usuários com escopo restrito.
2. O guarda existente do servidor vincula a identidade central após validar HTTPS, origem, sessão, workstation e `bi.read`. Os parâmetros de URL não concedem permissões.
3. O handler recusa `machineId` fora do escopo com 404 (mesma resposta de máquina inexistente), antes de consultar a política analítica, metadados, chamados, eventos ou sessões.
4. Uma conta com escopo global segue com o comportamento anterior. No modo legado o filtro não é aplicado.
5. Novos testes abrangem máquina negada, HEAD, nenhuma máquina autorizada, máquina permitida, escopo global, ausência de vínculo autenticado e modo legado.

## Limites e próximos passos
- Não liberar `overview`, `reliability`, `maintenance`, `temporal`, `failure-intelligence`, `drilldown` ou outros endpoints para usuários restritos até aplicar filtros SQL **em todas** as consultas e agregações do respectivo endpoint.
- A gestão central não é ativada por esta alteração: `ANDON_CENTRAL_ACCESS_ENABLED` continua desligado por padrão.
- Não alterar regras dos KPIs (MTTR, MTTA, MTBF, disponibilidade ou downtime) nesta etapa.
- Sem alterações em banco de produção, migrations, node-red, GPIO, Mini PC, Máquina 37, HTTPS, instalador ou servidor industrial.
- Exigir CI e revisão de segurança, depois eventual merge controlado. Deploy requer homologação separada.
