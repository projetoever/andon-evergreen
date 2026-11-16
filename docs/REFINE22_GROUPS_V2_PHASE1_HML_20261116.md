# REFINE 22 — Grupos de chamados V2 — Entrega segura Fase 1

Data: 16/11/2026. Origem: Issue #585, arquitetura aprovada. Ambientes: somente branch, CI e notebook isolado após merge. **Não atualizar o servidor industrial antes de homologação de contratos GPIO reais.**

## O que muda
- Config ANDON → Setores, categorias e grupos → **Grupos de chamados**. Reutiliza `CallReason` (grupo) e `CallReasonOption` (vínculo com `AndonCategory` preexistente). Nome, cor, ordem, natureza, política corretiva, BI operacional, revisão e opção de ativar/inativar permanecem sujeitos à permissão e auditoria.
- **Setores/Categorias não são alterados.** Elétrica, Mecânica, Hot Melt e outros permanecem com os mesmos IDs, nas mesmas rotas e botões diretos, mesmo se forem membros de grupos adicionais.
- **Na tela da máquina:** botões diretos são exibidos SEMPRE; grupos disponíveis aparecem como atalhos adicionais, sem substituir setores. Mesmo quando a API de grupos está indisponível, o caminho direto permanece operante com a permissão original.
- **Na abertura geral:** o operador pode selecionar setor diretamente, ou grupo e depois um setor. Ambos utilizam a rota individual já existente; quando grupo é usado, a abertura envia o par validado `reasonId/optionId` e revisões esperadas, que são conferidas pelo backend na transação de abertura.
- **No grupo:** um setor já ativo não é aberto novamente nem reclassificado. O sistema seleciona seu chamado ativo.
- **BI:** grupo é fonte autoritativa de elegibilidade corretiva para os NOVOS snapshots; antigos campos `*Override` de opções permanecem fisicamente no banco para retrocompatibilidade, mas não podem elevar elegibilidade na nova resolução. Novas tentativas de configurar políticas por setor retornam 400, com auditoria/ACL existentes.
- **Direto:** chamado sem snapshot de grupo mantém a política legada, sem mudança dos contratos e critérios prévios.
- **GPIO/alarme:** `AndonCall.subtype` continua com o ID técnico do setor. Sons do navegador continuam por `subtype`. Não foi adicionado silenciamento especial ao grupo Setup porque o agente físico de Node-RED/GPIO não consta do repositório e requer confirmação separada.

## Homologação Fase 1
- [ ] SHA do notebook verificado, backup/restore/health antes de abrir chamadas de teste.
- [ ] Todas as categorias pré-existentes aparecem no ANDON e seguem abrindo diretamente com OS/condição/operador; sem alteração de BI ou som legado.
- [ ] Novo grupo Setup com Elétrica + Mecânica, ordem e cor; ambos setores permanecem visíveis separadamente.
- [ ] Setup → Elétrica abre o MESMO subtipo do chamado direto, mas snapshot registra `nature=planned_setup`, `maintenanceKpiPolicy=excluded`, `analyticsDisposition=include`; não contribui aos KPIs corretivos, preserva operação, tempo técnico e downtime físico independente.
- [ ] Manutenção → Elétrica abre snapshot corretivo candidato somente se grupo elegível e evidências de manutenção física. Alteração no grupo não reclassifica chamados anteriores.
- [ ] Setor já ativo ao clicar via grupo seleciona o existente, sem duplicar/alterar seu grupo original.
- [ ] Catálogo de grupo offline/erro 403: botões diretos continuam operáveis, sem conceder acesso ao catálogo ou abrir por grupo sem autorização; retry da consulta.
- [ ] Operações proibidas por perfil/workstation/CSRF, edição de política de grupo por não Admin, alteração por option override e revisão obsoleta são negadas.
- [ ] Entradas serviço `GET /api/machines`, `GET /api/andon-calls` e `GET /api/dashboard-sound-state` mantêm forma e semântica. Compatibilidade com mini PC/Node-RED/GPIO requer captura real de consumidor.

## Fase 2 — multi-setor
Fase 1 permite **uma seleção por clique**. Fase 2 posterior implementará escolha de vários setores no mesmo modal e abertura transacional aditiva com contexto de grupo por chamado, em um único commit ou rollback total, deduplicação, OS, stop owner, CSRF e auditoria. **Não reutilizar sem alteração o batch legado**, que aceita apenas `subtypes[]` sem grupo/revisões. Fase 2 fica bloqueada até CI e aprovação operacional do fluxo individual.

## Condições de liberação
Com flags de grupo OFF, comportamento público é legadamente idêntico. Não atualizar fábrica sem homologar lote de testes de interface, operação e consumidores. Issue #586 é revisão final obrigatória; issue #474 acompanha falha de finalização intermitente.
