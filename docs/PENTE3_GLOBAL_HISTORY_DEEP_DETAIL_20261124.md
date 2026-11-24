# PENTE 3-G — Histórico Global: detalhamento e altura total

Projeto: ANDON Web Industrial — **Ever Green**
Issue de referência: #621
Baseline do branch: `main@b97a43fa49f45e66e0386cfede8ab7d8b1332fd3` (inclui PENTE 2 visual; a PR original PENTE 3 #627 já está em main).
**Estado:** branch e PR para CI + homologação em notebook. Nenhuma aprovação industrial é implícita.

## Escopo implementado
1. Grade desktop: a coluna esquerda passa a acompanhar a altura do painel de detalhe. Conteúdo longo da lista rola internamente; filtros têm rolagem controlada quando expandidos; paginação continua na base do painel. Mobile conserva fluxo lista/detalhe/voltar.
2. Participação dos mantenedores: sessões individuais com início/fim, duração calculada somente quando timestamps válidos e finalizados, motivo de saída e observações; consolidação por nome com tempos de atendimento, acompanhamento, total e marcador de parcialidade. Para registros legados sem sessões, exibir alocações registradas **sem duplicar** períodos.
3. Tempos oficiais de espera/atendimento/acompanhamento/total/parada continuam inalterados.
4. Impacto operacional: tempo atribuído, status de parada, quatro categorias correspondentes ao histórico da máquina — parada produtiva, falha fora da programação, atendimento sem impacto produtivo, atendimento fora de produção — e expansão dos intervalos reais. Uso de `calculateOperationalImpactBreakdown` compartilhado **somente** se `impactTrackingVersion===1`, todos os intervalos de programação do chamado cobertos e sem conflito, sem truncamento. Caso contrário, valores de classificação aparecem como `—` com explicação; sem forjar zeros.
5. Backend read-only: a rota de detalhe **já autorizada por chamada e máquina** devolve somente períodos de produção sobrepostos ao chamado, projeção mínima de cinco campos e teto de 1001 para detectar truncamento. Nenhuma consulta de séries é feita para IDs fora de escopo. Sem novas rotas, permissões, migrations, alterações em BI ou mutações.
6. Timeline: diferencia visualmente eventos de parada, técnico, auditoria e demais ações, preservando ordem por timestamps reais.
7. PT/EN/zh-TW e testes: `tests/pente3HistoryDeepDetail.test.ts` e atualização de testes de autorização e de filtro.

## Critérios de aceite — HML-23 a HML-31
| ID | Cenário | Estado |
| --- | --- | --- |
| HML-23 | Desktop 1366/1600/1920: borda inferior da lista acompanha detalhe; paginação na base; rolagem independente | PENDENTE |
| HML-24 | Mobile 360/390/412: lista, seleção, voltar sem painel preso ou overflow | PENDENTE |
| HML-25 | Filtro expandido/recolhido sem ocultar chamados nem impedir paginação | PENDENTE |
| HML-26 | Mantenedor com duas fases e múltiplas sessões: início/fim, minutos, subtotal e total consistentes | PENDENTE |
| HML-27 | Sessão aberta ou relógios inválidos: `—` e total explicitamente parcial, sem extrapolar | PENDENTE |
| HML-28 | Histórico legado sem sessões: alocação legado independente e não duplicada | PENDENTE |
| HML-29 | Produção com cobertura histórica completa + impacto v1: quatro tempos por classificação; validação com histórico da máquina | PENDENTE |
| HML-30 | Sem programação completa, conflito ou legado: `—` em categorias e tempo oficial preservado | PENDENTE |
| HML-31 | Usuário sem permissão, máquina fora do escopo e limites: nenhum período de outra máquina, regressão de BI, CSV e temas/idiomas | PENDENTE |

## Segurança e governança
- Testes de código e CI não substituem homologação física.
- Não atualizar automaticamente a main nem instalar no notebook sem aprovação do responsável.
- Não modificar banco industrial, configurações de fábrica, CLPs, Node-RED, certificados ou firewalls.
- Após CI verde, revisar PR e solicitar decisão de merge. Depois testar com instalador oficial e Health 6 registrando SHA instalado e evidências HML-23–31.
- Issue #621 permanece aberta até aceite operacional completo.
