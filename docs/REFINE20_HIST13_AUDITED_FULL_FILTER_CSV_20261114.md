# REFINE 20 — HIST-13 | Exportação filtrada com sessão revalidada e auditoria transacional

**Referências:** issues #479 e #480; HIST-12 (PR #548). **Base** main `0011235e66e60b9c6aed9113c70edf72791954c6`. Data: 14/11/2026.

## Entrega
- O Histórico Global passa a oferecer **CSV da página** (até 25 linhas, opção antiga) e **CSV filtrado (até 500)** com duas ações explícitas.
- Nova rota **GET /api/andon-calls/history/export** usa a flag preexistente `ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED` (não a ativa). Sem fallback legado ou service account.
- O hook HTTPS/Origin/workstation valida conta pessoal, módulo ANDON, `history.read` e escopo; o endpoint obtém principal exclusivamente vinculado pelo hook. Durante a transação, relê o cookie HttpOnly e revalida sessão, autorização e máquina para evitar exportação após revogação.
- Escopo SQL resulta da INTERSEÇÃO da permissão antes da transação e da permissão revalidada. Os filtros de busca/OS/status/criticidade/tipo/técnico/classificação/motivo/origem/período usam o mesmo construtor SQL do Histórico Global.
- O servidor conta TODAS as linhas filtradas, impede resultados acima de 500 (413, exige refinar filtros), consulta com `take:501`, valida consistência do total e só retorna após `appendAudit` no mesmo `RepeatableRead`. Falha de auditoria impede a entrega.
- Auditoria contém ator, sessão, estação, IP, requestId, tipo da ação e quantidade de linhas; NÃO armazena exportação, OS, nomes, diagnósticos ou credenciais.
- A resposta é JSON de **todos** os registros limitados e auditados; o navegador compõe CSV UTF-8 com BOM e neutralização de fórmulas usando o exportador existente, adequado ao idioma atual. Nenhum PDF introduzido; o arquivo não contém registros além dos autorizados.
- HEAD não gera exportação; GET rejeita limit/offset do cliente; menu mantém o CSV antigo da página.

## Segurança e limites
- A auditoria representa a liberação no servidor, NÃO comprova que o browser salvou o arquivo.
- A API recalcula autorização antes de retornar, mas a consulta não é um snapshot de um segundo evento físico. Dados novos depois da transação exigem nova exportação.
- Não usar a mesma requisição para stream ilimitado nem expor valores `N/A` como zero; períodos e timezones respeitam o filtro aplicado.
- Nenhuma migration, banco industrial, KPIs, propriedades físicas, Node-RED/GPIO/CLPs, firewall, senha, instalação de fábrica, alteração de flags ou HML antiga.
- Testes adversariais `server/src/routes/globalHistoryExport.test.ts`, query path e integração UI; CI Windows PowerShell5.1 + PostgreSQL/backend + SSR/frontend. Homologação posterior somente no notebook oficial pelo operador.

## Próximos critérios
- Futura exportação PDF gerada com cabeçalho e paginação, reutilizando contrato autorizado e auditoria; NÃO habilitar envio massivo sem rate limit e política de acesso.
- Testar manualmente 0 / 1 / 25 / 500 / 501 registros, filtros combinados, estação bloqueada, sessão revogada, falta de grant, máquina fora do escopo, texto de fórmula, PT/EN/ZH, ligação por máquina fixa e auditoria append-only.
