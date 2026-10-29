# SEC-04/2B.1 — Escopo e permissão de conjuntos e subconjuntos

Data: 29/10/2026. Continuação do roadmap #232 depois do PR #260.

## O que foi implementado

Seis mutações do catálogo de ativos deixaram a lista de rotas **sem classificação** e foram incluídas exclusivamente no catálogo **de planejamento**, todas exigindo `catalog.assets.manage` e leitura do módulo ANDON. Nenhuma operação central passou a funcionar no HTTP.

| Método | Rota | Origem autoritativa de machineId |
|---|---|---|
| POST | /api/machines/:machineId/sets | parâmetro da URL + existência da máquina |
| PATCH | /api/machine-sets/:id | `machineSet.machineId` consultado no banco |
| DELETE | /api/machine-sets/:id | `machineSet.machineId` consultado no banco |
| POST | /api/machine-sets/:machineSetId/subsets | `machineSet.machineId` + pai ativo |
| PATCH | /api/machine-subsets/:id | `machineSubset.machineSet.machineId` consultado no banco |
| DELETE | /api/machine-subsets/:id | `machineSubset.machineSet.machineId` consultado no banco |

`preflightCentralAssetWrite` rejeita workstation desativada/pendente, sessão de outra estação, sessão provisória e ausência de permissões, **antes de consultar recursos**. Para conta restrita, ativos de outra máquina retornam `asset_not_found` (404) sem revelar a existência do equipamento. Campos `machineId` e `machineSetId` no corpo são proibidos, impedindo rebinding artificial. Requer máquina ativa e, para adicionar subconjunto, conjunto pai ativo.

## Segurança operacional e escopo desta fase

- O preflight é **somente leitura**: não substitui validações existentes de código, tipo ativo, referências e máquinas em uso.
- O middleware `enforceWorkstationAccess` continua recusando **todas** as escritas centrais com `central_action_not_supported`. Não criou rota, não removeu controle legado, não mudou credenciais e não gravou dados.
- O inventário restante passa de **41 para 35 rotas ainda sem entrada no catálogo de planejamento**. Isso **não** significa 6 endpoints migrados/autorizados no runtime; todos continuam exigindo integração de ACL, trava de transação, tratamento de referencial e auditoria durável antes da ativação.
- Para uma futura mutação: revalidar principal/workstation, tomar locks na ordem estabelecida, reler máquina e vínculo de pai depois do lock, aplicar a alteração e anexar evento de auditoria na **mesma transação**; teste de concorrência e rollback obrigatório.
- O suporte a método DELETE foi incluído apenas no tipo/classificador das rotas de planejamento, não no middleware ativo.

## Testes

- `centralAssetWritePreflight.test.ts`: 6 rotas, negativa de recurso externo, recusa de reparenting, status de máquina/conjunto, sessão e permissão antes de consultar objetos, payload/path inválidos.
- `validate-central-asset-preflight.mjs`: PostgreSQL de teste `/andon_test` com duas máquinas e conjuntos/subconjuntos sintéticos, 6 permissões positivas e 6 negativas. Confirma que as consultas não alteraram nome/vínculo de nenhum ativo.
- Regressão `centralWriteInventory.test.ts`: falha se uma operação declarada no código ficar fora do planejamento ou da lista de pendências.
- As duas suítes são obrigatórias em `test:access` e `test:access:integration`, com CI Windows, HTTPS, frontend e navegador já existentes.

## Próximo ciclo

Classificar as mutações de tipos globais de conjuntos/subconjuntos e de falhas, depois implementação de guards e auditoria por ação. Só após fechamento e revisão dos 35 itens restantes avaliar quaisquer ligações HTTP centrais. Homologação no notebook apenas na rodada consolidada combinada.

Sem deploy, migrations, alterações da Máquina 37, Node-RED/GPIO ou PostgreSQL industrial.
