# PENTE 5-C — Diagnóstico dos KPIs sem amostra (24/11/2026)

Referências: issue #637, PR #638 integrada, baseline main `97e31af6b2907214fa9820a0df8e170b4c10eb8b`.

## Problema relatado
Operador abre e atende falhas que entende elegíveis, mas MTTR, MTBF e taxa de retorno permanecem "Sem amostra". Não há acesso remoto validado ao banco de dados real neste trabalho; a causa específica de cada chamada ainda precisa ser confrontada no notebook.

## Hipóteses verificadas no código
1. `CallReasonsSettingsTab` permite `analyticsDisposition=include` (aparece no BI operacional), com `nature=unclassified` e `maintenanceKpiPolicy=pending` (padrão de Grupo novo). Esse Grupo **não é candidato** a KPIs corretivos mesmo sendo visível no BI.
2. `buildExecutiveOverview` só usa taxa de retorno sobre chamados `status=finished` dentro da janela, corretivos e com `failureResponsibility=maintenance`. Atendimento isolado não gera denominador; sem retorno com ao menos um elegível = 0%.
3. MTTR de restabelecimento requer episódio físico encerrado e atribuído inteiramente à manutenção. Chamado atendido sem parada física ou ainda ativo pode não gerar restauração.
4. MTBF programado exige falha confirmada com início durante janela verificável de Produção Programada. Uma amostra confirmada gera valor; outras origens pendentes mantêm estimativa rotulada como parcial.
5. O catálogo de classificação, a política imutável do Grupo na abertura do chamado e o domínio físico são três fontes independentes; sugestões não viram responsabilidade comprovada. Atualizar o cadastro do Grupo não reclassifica snapshots de chamadas anteriores.

## Entrega PENTE5C
- `server/src/analytics/biSampleDiagnostics.ts`: funil da mesma coorte já autorizada da API Overview, apenas leitura. Conta aberturas/atendimentos/finalizações, chamados corretivos concluídos com responsabilidade confirmada/pendente/de outra área e episódios físicos oficiais de MTTR/MTBF. Produz até 20 chamados recentes com ID abreviado, máquina, Grupo e motivo da não elegibilidade: não finalizado, fora da janela, Grupo não corretivo/pendente, sem responsabilidade, outra área, parada física vinculada ausente ou candidato que exige conciliação causal.
- A API devolve `sampleDiagnostics` usando os mesmos filtros, períodos e máquina já autorizados; não amplia escopo nem faz consultas extras no banco.
- `src/components/bi/BiSampleDiagnosticsPanel.tsx` na aba Qualidade dos Dados, aberto quando existem ocorrências mas KPIs estão sem amostra. Informação explícita de que parada transferida e candidato a coorte não equivalem a amostra comprovada.
- `CallReasonsSettingsTab` apresenta aviso *direto* quando BI operacional está incluído mas política corretiva não foi habilitada, sem alterar o Grupo automaticamente. Preserva todas as regras de aprovação do Admin.
- Regressões unitárias e UI; PT/EN/ZH.

## Teste no notebook
1. Backup. Atualizar apenas após CI verde e merge aprovado; conferir SHA vivo.
2. Criar Grupo de manutenção corretiva, policy eligible e disposition include, somente por Admin autorizado; criar classificação de falha com responsabilidade maintenance e disposition include.
3. Abrir chamado com modo *máquina parada* e programação registrada; realizar atendimento, concluir manutenção e finalizar chamado com classificação específica e descrição. Garantir fechamento real do evento de parada e ausência de transferência sobreposta.
4. Atualizar BI, 7d, máquina selecionada. Conferir na aba Qualidade dos Dados o chamado pelo sufixo ID e seus três vínculos. Esperado: ao menos 1 correctivo encerrado confirmado; MTTR com 1+ restauração válida, MTBF com 1 falha na programação, retorno 0% se nenhum ciclo.
5. Testar chamado apenas atendido, Grupo com pending, diagnóstico process/quality, parada sem fechamento e mudança de turno. Cada falha deve explicar sua exclusão. Sem inventar valores.
6. Dados sensíveis (credenciais, PIN, descrições livres, OS) nunca retornam na auditoria adicional. Nenhum update no PostgreSQL é feito pelo diagnóstico.

**Limitação:** relatório agregado por amostra ajuda a encontrar o bloqueio, mas não confirma automaticamente homologaçao com dados físicos de produção. A reconciliação com banco real e evidência do operador permanece na #637.
