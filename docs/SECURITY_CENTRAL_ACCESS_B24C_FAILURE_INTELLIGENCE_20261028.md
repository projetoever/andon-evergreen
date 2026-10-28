# B2.4C/3 — Reincidência de falhas por escopo central
Data: 28/10/2026. Requer a integração anterior B2.4C/2 (#237).

A rota de leitura `GET/HEAD /api/analytics/failure-intelligence` passa a suportar os usuários centrais restritos mediante a mesma autorização HTTPS, Origin, sessão e módulo BI que as outras rotas.

## Regras
- O filtro de máquinas autorizado é **aplicado ao SQL da busca histórica**, antes de carregar descrições, OS, diagnósticos e snapshots de conjuntos/subconjuntos.
- Filtro explícito de máquina fora da lista => 404 sem consultar catálogo nem histórico.
- O período de lookback de até 30 dias continua calculado somente para a população autorizada; o denominador de reincidências nunca utiliza chamados de outras máquinas.
- Usuários sem máquinas recebem coorte vazia; usuários globais e modo legado preservam a regra anterior.
- A fórmula e os conceitos de reincidência (24h, 7d, 30d) permanecem intactos. O setor do chamado anterior não limita o lookback; só a máquina e o diagnóstico.
- Nenhuma alteração operacional, SQL migration, dados existentes, Node-RED, GPIO ou deploy.

## Testes
`scopedBiFailureIntelligence.test.ts`: consulta proibida antes do banco, caso anterior legítimo da Máquina 37 para 24h, ocultação da OS da Máquina 38, máquina explícita, escopo vazio, global, falta de binding e legado.

A gestão central ainda **não está pronta para ser ligada no piloto**. Reliability, temporal, data-quality-details e demais rotas agregadas continuam bloqueadas para usuários com escopo restrito até revisão individual.
