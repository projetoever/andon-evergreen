# B2.4C/4a — Confiabilidade e saúde dos dados com escopo de máquina

Data: 28/10/2026. Continuação do roteiro #232, posterior a #238.

## Escopo da entrega
`GET/HEAD /api/analytics/reliability` passa a aceitar somente usuários autorizados pelo middleware central, respeitando as máquinas vinculadas à identidade autenticada. A rota continua bloqueada para operações diferentes de GET/HEAD.

- Validação de `machineId` informado pelo cliente antes da leitura do catálogo ou dos dados; retorna 404 para máquina fora da lista.
- Restrição em SQL das **sete fontes**: `Machine`, `AndonCall` históricos, `FailureEvent` históricos, chamados ativos, `TechnicianSession` ativa, eventos físicos abertos, contagem de chamados concluídos sem classificação.
- `includeInactive=true` preserva somente máquinas inativas **autorizadas**, sem ampliar o escopo.
- Usuários sem máquinas possuem amostra vazia. `machineScope=all` e modo legado mantêm a regra anterior.
- O evento físico da Máquina 37 pode apontar para chamado da Máquina 38 no esquema atual. Nessa situação, somente os dados próprios do evento definem sua elegibilidade, e o identificador/metadados do chamado estranho ficam ocultos.
- Filtro de setor exige que o chamado relacionado também pertença ao escopo. Sessões técnicas ativas exigem máquina da sessão E do chamado autorizado.
- Não muda fórmula MTTR, MTBF, estimativas de confiabilidade, tempo de parada, elegibilidade legada ou modelo do banco.

## Testes
`scopedBiReliability.test.ts` cobre bloqueio anterior a consultas, GET/HEAD, sete fontes SQL, máquina inativa autorizada, máquina estrangeira, vínculo cruzado com `isSystemTest` estrangeiro, filtro de setor, escopo vazio, escopo global, contexto autenticado ausente e modo legado.
`workstationAccess.test.ts` valida permissão central `bi.read` e vínculo de escopo de máquina.
`centralScopedMachineReads.test.ts` garante que somente GET/HEAD sejam autorizados.

## Restrições
Não libera `/api/analytics/temporal` ou `/api/analytics/data-quality-details` para usuários restritos, nem habilita o acesso central em produção. Não realiza deploy, migração, configuração de TLS, mudança de Node-RED, GPIO, mini PC ou Máquina 37. Alterações de classificação e auditoria dos dados reais não fazem parte desta entrega.
