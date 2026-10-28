# ANDON BI — B2.4B | Drilldown seguro por máquina
Data: 28/10/2026 · Proposta de PR, sem deploy.

## Escopo
A rota `GET/HEAD /api/analytics/drilldown` é usada para detalhar uma máquina, um setor ou uma classificação de falha. Antes dessa etapa, o guarda de gestão central bloqueava usuários cujo escopo era apenas um conjunto de máquinas, já que o detalhamento não filtrava suas consultas.

### Contrato de autorização
- O hook do servidor autentica HTTPS, sessão, workstation, origem e a permissão `bi.read`, vinculando o escopo de máquinas da identidade autenticada.
- Dimensão `machine`: exige que `value` pertença ao escopo autorizado, respondendo 404 caso contrário, ANTES de consultar a política/SQL. A consulta de eventos mantém `machineId = value`.
- Dimensões `classification` e `sector`: aplicam `machineId: { in: machineIds }` diretamente ao `where` Prisma antes de qualquer `orderBy`, `take`, agregação ou mapeamento dos resultados.
- Se `machineId` for fornecido explicitamente, também precisa estar autorizado; sem máquinas cadastradas, a consulta SQL usa `IN []` (não vira resultado global).
- Escopo global e modo legado continuam com consulta sem filtro extra, exceto filtros explicitamente informados pelo usuário.
- Contexto de identidade ausente em modo central retorna 403, sem consultas a eventos ou chamados.

### Limites
- NÃO habilitar outras rotas do BI com métricas agregadas (`overview`, `maintenance`, `reliability`, `temporal`, `failure-intelligence`), ainda sem filtro completo de machine IDs.
- Excluídos: mudanças em fórmulas de KPI, banco, migrations, instalações, servidor da Evergreen, Node-RED, GPIO e Máquina 37.
- `ANDON_CENTRAL_ACCESS_ENABLED` permanece desativado por padrão.
- Validar tests:auth, integração HTTPS, testes de navegador e revisão independente antes do merge. Deploy separado, somente após homologação.
