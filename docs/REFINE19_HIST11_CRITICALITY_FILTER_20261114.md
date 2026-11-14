# REFINE19 HIST-11 — Filtro de criticidade do Histórico Global (14/11/2026)

## Lacuna confirmada
Issue #479 exige criticidade filtrável. A tela tinha criticidade no detalhe, porém sem controle na lista e sem query SQL. A abertura de chamados aceita quatro valores: `low`, `medium`, `high` e `critical`. Não introduzir novas categorias ou reclassificar históricos.

## Comportamento
- O Histórico Global tem seletor Todas/Baixa/Média/Alta/Crítica (PT/EN/ZH). O cliente só transmite `criticality` quando diferente de `all`.
- `buildScopedGlobalHistoryQuery` valida allowlist e adiciona filtro ao mesmo WHERE que já contém machineScope, status, datas, classificações, motivo, técnico e origem. Valores inválidos retornam 400 antes de acessar o banco.
- Pesquisa paginada e resumo agregado utilizam o MESMO construtor de filtros, garantindo contagem coerente. CSV continua exportando apenas a página autorizada. Não há nova exportação de grande volume ou nova métrica analítica.
- Com Todas, registros legados permanecem sem alteração mesmo se possuírem valores históricos incomuns.

## Segurança, implantação e critérios de aceite
Sem alterações de migração/banco, permissões, API de escrita, flags, indicadores MTTA/MTTR/MTBF, CLP, Node-RED ou produção. Testes unitários de filtros e períodos, query SQL e escopo, endpoint de busca e resumo e teste de UI. CI Windows PS 5.1 + Linux/PostgreSQL + SSR/browser obrigatória antes do merge.

No notebook, somente após atualização pela `main` e backup: selecionar criticidade, aplicar filtro, confirmar itens, contagem e CSV página; repetir com filtros combinados/máquina autorizada e escopo restrito. Não marcar homologado antes do retorno do operador.
