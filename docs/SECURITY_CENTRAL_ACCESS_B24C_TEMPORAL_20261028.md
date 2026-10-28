# B2.4C/4b — Padrões temporais do BI por escopo de máquina

Data: 28/10/2026. PR após B2.4C/4a (#239).

## Alteração
A rota `GET/HEAD /api/analytics/temporal` reutiliza a fonte `loadOverviewDataset` já protegida no PR #236, passando os IDs das máquinas obtidos do contexto autenticado pelo backend. Não cria uma fonte analítica alternativa.

- Um `machineId` explícito fora do escopo é recusado com 404 **antes de ler banco ou catálogo**.
- Sem `machineId` explícito, as fontes SQL de chamados, eventos físicos, impactos causais e máquinas são filtradas com `machineId IN (máquinas autorizadas)`.
- O escopo vazio devolve amostra vazia, sem recorrer às consultas globais. Contas globais e modo legado mantêm o comportamento anterior.
- Eventos físicos na máquina autorizada que referenciam chamados de outra máquina são tratados conforme a proteção validada no `loadOverviewDataset`, sem expor identificadores ou setores estrangeiros.
- Os cálculos de distribuição horária, temporalidade, turnos e downtimes são preservados.

## Testes
`scopedBiOverview.test.ts` inclui prova de 404 sem consultar catálogo, escopo SQL da rota temporal, vínculo cruzado, atribuição causal, escopo vazio, global e ausência de binding. Testes de middleware conferem GET/HEAD e impedem métodos de escrita.

## Limites
Os detalhes de qualidade dos dados `/api/analytics/data-quality-details` continuam não habilitados para usuários centrais restritos até a etapa B2.4C/4c. Não ativar a gestão central em produção. Sem migrations, deploy, alterações industriais, Node-RED, GPIO ou configuração HTTPS.
