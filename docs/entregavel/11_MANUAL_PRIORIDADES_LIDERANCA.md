# MAN-PRI-001 / MAN-LID-001 — Prioridades, programação e supervisão

**Edição:** 0.1 · Pré-entrega M1 · **Status:** minuta interna baseada em código, sem aceite de usuários.  
**Público:** líderes de produção, supervisores, gestores de fila e leitura de dashboard.  
**Fonte:** `src/pages/DashboardPriorityPage.tsx`, `server/src/routes/dashboardPriority.ts`, `src/pages/DashboardPage.tsx`.

## 1. Conceitos fundamentais

- **Rank/Prioridade:** ordem P1, P2…Pn que orienta o sequenciamento operacional. Não determina, por si só, se a máquina está programada para produzir.
- **Quantidade de destaques:** parâmetro global `priorityHighlightCount`, com padrão 5 e intervalo permitido de 1 até o número de máquinas ativas. Modifica quantas prioridades são realçadas no dashboard.
- **Produção programada:** estado histórico `scheduled` ou `not_scheduled` da máquina, separado do ranking.
- **Máquina ativa:** elegível para configurações e visualização conforme seu status; uma máquina inativa pode ser mostrada como contexto, mas não precisa integrar o limite N de destaques.
- **Permissão:** ver Prioridades (`priorities.read`) não significa poder editar (`priorities.write`). Alterar programação exige `production.schedule.write` ou solicitação one-shot via `production.schedule.request`, quando suportado.

## 2. Navegar e interpretar a sequência

1. No Hub, abra **Prioridades de produção** se o módulo estiver autorizado.
2. Observe a Visão Geral e o resumo das máquinas prioritárias; não confunda resumo com lista integral quando houver truncamento visual.
3. Abra a seção de sequência e confira ordem de P1 até o último registro.
4. Utilize filtros de nome, atividade e programação sem alterar a ordenação oficial sem salvar.
5. Observe a exibição em cartões/linhas: o ranking indica posição, o badge de programação indica condição de planejamento, o status de máquina indica outra dimensão.
6. Caso o botão de Histórico não apareça em uma máquina, confirme o direito individual de acesso; a ausência pode ser intencional.

**Checagem:** no Dashboard ANDON, as primeiras N posições devem refletir o parâmetro configurado, respeitando quantidade de máquinas ativas. A atualização pode ser refletida por polling/atualização de dados, não necessariamente por reload integral.

## 3. Reorganizar prioridades com permissão

1. Entre com perfil que possua `priorities.write`.
2. Confira que a lista inicial não possui alterações externas desde seu carregamento.
3. Reordene as máquinas por controles disponíveis na versão homologada.
4. Defina a contagem de destaques, entre 1 e o total de máquinas ativas, caso seu perfil tenha a configuração.
5. Revise o resumo de alterações antes de salvar.
6. Acione **Salvar** uma única vez e confira o aviso de sucesso e a ordem no servidor.
7. Se houver 409 por revisão concorrente, atualize a lista e refaça conscientemente suas alterações. O servidor usa controle transacional de concorrência; não force um valor antigo.

**Não** atribuir prioridades com base apenas no índice visível de um filtro: a ordenação persistente deve abranger o conjunto correto.

## 4. Alterar produção programada sem mudar o ranking

1. No status da máquina, confira se está **Produção Programada** ou **Fora de Produção**.
2. Se o badge/status for somente leitura, sua conta não tem autorização de escrita.
3. Em perfil autorizado, acione o próprio status, escolha a nova condição e confirme o diálogo.
4. Quando o fluxo exigir aprovação por outra credencial, utilize o modal específico, sem compartilhar a senha com o solicitante.
5. Confirme no histórico/auditoria que a alteração foi registrada e a condição atual está consistente.
6. Confira que P1..Pn **não foi reordenado** pela mudança de programação.
7. Em caso de 409, recarregue o estado real antes de reaplicar.

**Atenção BI:** programação histórica alimenta a cobertura dos KPIs. Não falsificar modo de produção para aumentar a disponibilidade; o cálculo deve respeitar os eventos reais.

## 5. Supervisor: leitura do dashboard

O dashboard operacional oferece cards por máquina, identificação de setor e, quando aplicável, origem do grupo. Nomes longos precisam manter legibilidade. Prioridade, condição de produção, chamado ativo e estado físico devem ser interpretados separadamente.

| Pergunta de gestão | Onde consultar | Cuidado |
|---|---|---|
| Quais máquinas precisam de atenção primeiro? | Sequência de Prioridades | Ranking não substitui análise de criticidade real |
| Qual máquina tem chamado ativo? | Dashboard ANDON e detalhe | Ativo ≠ manutenção já iniciada |
| O setor chamado veio de um grupo? | Card/detalhe/histórico | O grupo não converte automaticamente a falha em corretiva |
| Houve parada produtiva? | Histórico, detalhe de impacto, BI | Minutos de parada são físicos, não horas-pessoa |
| Há retorno de manutenção? | Histórico/BI | Retorno ao mesmo chamado ≠ novo chamado de reincidência |
| Os indicadores têm amostra confiável? | Qualidade dos Dados do BI | `Sem amostra` não equivale a 0 |

## 6. Problemas e resolução

- **Erro 403:** conta sem grant; solicitar revisão ao Admin.
- **Erro 409:** ordem/contagem ou produção mudaram em outra estação; não sobrescrever silenciosamente.
- **Mais máquinas do que cabem:** utilizar rolagem e filtros; não reduzir artificialmente N sem entender o impacto nos cards.
- **Badge não clicável:** máquina inativa, modo desconhecido ou permissão insuficiente podem justificar somente leitura.
- **Histórico indisponível:** verificar `history.read`/escopo antes de reportar erro visual.
- **Máquina sem cobertura de programação:** reportar à administração funcional/BI; não inventar eventos retrospectivos.

## 7. Exercício controlado de liderança

Com 14 máquinas fictícias ativas, configurar destaques para 1, 5, 14, validar o dashboard, abrir Prioridades em dois navegadores, tentar atualizar ambos e observar tratamento de conflito 409. Em seguida mudar programação de uma máquina e comprovar que a ordem não mudou.

**Aceite:** `DOC1-QA-H12`, `H13`, `H14`, `H18`, `H22`. Registrar ordem antes/depois, capturas sanitizadas, usuário/perfil sintético, SHA, resultado e responsável.

## 8. Referências, imagens e aprovação

[Documento técnico da faixa P1..Pn](../PENTE2_PRIORITY_RANGE_20261125.md) · [Mapa de telas](../DOC1_MAPA_TELAS_NAVEGACAO_20261125.md) · [Matriz QA](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).  
**Imagens reais:** pendentes. **Validação de liderança:** pendente. **Instalação industrial:** não autorizada.
