# Central B2.4C / Etapa 1 — Visão geral agregada do BI com escopo SQL

Data: 28/10/2026. PR independente da Fase 2B.

## Problema
Usuários da gestão central com acesso BI limitado a algumas máquinas já possuem leitura segura no Machine 360 e no drilldown, mas a rota `GET /api/analytics/overview` ficava bloqueada. Ela agrega dados de vários conjuntos (chamados, eventos, programação, episódios causais, contagens de exclusões, indicadores do período anterior). Filtrar apenas o resultado final seria inseguro.

## Correção
- A rota de visão geral foi adicionada à lista explícita de leituras com escopo central e continua sujeita à autenticação por sessão HTTPS, origem, workstation e permissão do módulo.
- Lê o escopo de máquinas associado **pelo backend**; IDs vindos apenas de query-string não concedem permissão.
- Filtro explícito para máquina fora do escopo é recusado com 404 **antes da primeira consulta**.
- Aplica o filtro SQL a chamadas, contagem atual de chamadas ativas, ativos da confiabilidade, eventos físicos e contagem de chamados excluídos, tanto no período corrente como no anterior.
- A leitura de programação de produção é limitada aos ativos que passaram pelo escopo.
- Preserva evento físico de máquina autorizada quando vinculado a chamado de outra máquina, mas oculta a relação fora do escopo e não usa aquele chamado como dimensão de setor. Intervalos de atribuição causal também exigem que a máquina do chamado esteja autorizada.
- Usuário sem máquinas: denominadores e contagens permanecem vazios/indisponíveis; nunca herda totais globais.
- Usuários globais e modo legado preservam comportamento antigo.
- Sem alteração das fórmulas, eligibility, snapshots e modelo do PostgreSQL.

## Segurança e testes
`scopedBiOverview.test.ts` cobre SQL onde=escopo em coortes atual/anterior, lista vazia, tentativa de máquina não autorizada sem acesso ao banco, ausência do vínculo de contexto central, modo legado/global, programação de produção e evento relacionado a chamado estrangeiro.

## Limites
Somente `/api/analytics/overview` recebe a integração nesta etapa. `/api/analytics/reliability`, `/maintenance`, `/failure-intelligence`, `/temporal`, `/data-quality-details` e outros agregados continuam **bloqueados** para usuários centrais de escopo restrito até receberem filtros específicos e testes independentes. A interface BI completa ainda não pode ser considerada homologada nesse modo.

A execução não altera dados de produção, node-red, HMI, senhas ou políticas de workstation. Não habilitar `ANDON_CENTRAL_ACCESS_ENABLED` no piloto sem homologação completa de todos os módulos e endpoints.
