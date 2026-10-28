# Fase 2B — Auditoria causal das amostras de manutenção

Data: 28/10/2026 — proposta de integração segura ao ANDON Web Industrial.

## Objetivo
Entender **quais episódios físicos realmente entram ou ficam fora** dos cálculos oficiais MTTR e MTBF, sem assumir que um atendimento técnico é uma falha física atribuída à manutenção. O piloto da Máquina 37 é a primeira população candidata à conferência humana.

## Entrega técnica
- `server/src/analytics/biCausalCohortAudit.ts`: auditoria determinística de um ativo e uma janela, reaproveitando o construtor causal, a política de elegibilidade e a checagem exata de programação dos KPIs oficiais.
- Produz, por episódio físico unificado, início e término, responsabilidade, sufixos dos IDs dos eventos participantes e os motivos de inclusão/exclusão *separados* de MTTR e MTBF.
- Reconcilia sua amostra e métricas à mesma função que produz `plannedMtbfMinutes`, `resolvedMttrMinutes`, `productionFailureEpisodes` e `pendingAttributionEpisodes`. Um episódio pode gerar MTTR, mas não MTBF se tiver começado antes da janela.
- Respeita `isEligible`, excluindo testes, falsos chamados e duplicidades já marcados, evitando contagem em dobro de eventos sobrepostos.
- Não altera fórmulas, snapshots, histórico, classificação de falha, indicadores executivos ou endpoints.

## Execução opcional em cópia isolada
Na pasta `server`, com Prisma Client gerado, build disponível e variável `DATABASE_URL` apontando para `andon_test`:

```powershell
node scripts/audit-bi-causal-cohort.mjs --machine=37 --start=2026-10-21T00:00:00-03:00 --end=2026-10-28T00:00:00-03:00
```

A ferramenta exige datas com fuso, janela de no máximo 31 dias e máquina explícita. Todas as consultas ficam numa transação PostgreSQL `READ ONLY`; a execução não modifica banco, máquina, chamados ou configurações.

**Atenção:** fora de `andon_test`, exige `--ack-live-read`, além de autorização do responsável local. Esse parâmetro não constitui aprovação para consultar a Evergreen. Não executar em produção enquanto a Fase 1 está em homologação.

## Diagnósticos disponíveis
- Causas pendentes/mistas e paradas não atribuídas à manutenção.
- Eventos que continuam abertos ou se encerraram fora da janela.
- Paradas iniciadas antes do recorte, mas encerradas durante ele.
- Início de falha fora da programação verificada.
- Falta de continuidade nos eventos de programação.
- Bloqueio global de MTBF por atribuições pendentes, mesmo com outras falhas válidas.
- Exames de eventos sobrepostos sem criar novos episódios de parada.

## Limites
- O resultado não prova que a classificação operacional é verdadeira; exige conferência pelo time de manutenção.
- Identificadores de eventos são apresentados apenas por sufixo e podem não ser globalmente únicos. Conferir no histórico local antes de corrigir qualquer registro.
- O resultado não é uma nova métrica oficial, um painel acessível aos operadores ou um mecanismo de alteração automática.
- A auditoria não deve ser publicada sem controle de acesso: o servidor produtivo e os usuários limitados ainda dependem da Fase B2.4C (proteção dos indicadores agregados).
- Para o piloto, usar dados reais verificados e a política de responsabilidade, nunca preencher MTTR/MTBF com zero ou com médias de chamadas.

## Homologação futura
Executar primeiro em banco de teste com extrato autorizado, comparar com a API /overview para **mesma máquina, janela e horário do servidor**, revisar casos de fronteira e amostras pequenas, registrar achados sem alterar históricos. Só então planejar um painel gerencial de auditoria com autorização por usuário e workstation.
