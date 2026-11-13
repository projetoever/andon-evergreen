# REFINE 14 — S3-B | Botões hierárquicos e pacote de entrega pela main

Data de decisão: 10/11/2026. Baseline verificada: `main` em `dbc3046a9bceee8df6f4afc290f91816bd5bdc18` (PR #430 integrada).

## Diretriz operacional do proprietário (substitui referências anteriores à HML)
- **HML removida do fluxo ativo de desenvolvimento, homologação e aceitação.** A referência única de integração é `main`; trabalho novo entra por PR curta originada em `main`, CI automatizada isolada, revisão e merge seguro.
- **Não executar scripts, migrations, reinícios ou deploys no servidor industrial nesta etapa.** O build e os scripts devem ficar preparados para execução futura no servidor Evergreen apenas após janela/aceite.
- Testes automáticos de CI podem criar banco temporário descartável; isso não é instalação em HML nem autoriza tocar no `andon_db` produtivo.
- Migrações estritamente aditivas e reversão documental; credenciais, configuração local, sessões, chamados e dashboards existentes preservados.

## Estado de código que não deve ser reimplementado
- S1: Prisma `CallReason` e `CallReasonOption` com revisão, flags, política, relação técnica e migração aditiva.
- S2: API segura GET/POST/PATCH de catálogo com flag `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED` **OFF por padrão** (PR #429).
- S3-A: editor no Hub e chave de capacidade somente leitura, ainda dependente da flag, sem ativação dos botões (PR #430).
- `server/src/services/callReasons.ts`: `resolveReasonOption` já produz IDs, nomes e revisões de snapshot, natureza, responsabilidade sugerida e KPI; `confirmedCorrectiveKpiContribution` exige evidência independente para KPI corretivo.
- PR #431 (sessão permanente e logout remoto) segue trabalho separado; não juntar migrações ou merge incidental.

## S3-B — Contrato mínimo de implementação por etapas
1. **Banco (PR S3-B1):** acrescentar campos opcionais/snapshot imutável associados ao chamado na abertura (ou uma tabela anexa 1:1 com FK RESTRICT e índice único por chamada). Guardar `reasonId`, `reasonNameSnapshot`, `reasonRevision`, `optionId`, `optionNameSnapshot`, `optionRevision`, `technicalAreaId`, `nature`, `suggestedResponsibility`, `maintenanceKpiPolicy`, `analyticsDisposition`. Sem backfill por inferência; registros históricos ficam `null`/legado. Não modificar `AndonCategory` para fingir que ele é motivo.
2. **Backend (PR S3-B2):** aceitar `reasonId` e `optionId` de forma compatível e exclusivamente quando flag operacional nova e o catálogo estiverem habilitados. Sob transação do mesmo chamado, reler pais/opções/área ativos, verificar ligação e versões correntes, chamar `resolveReasonOption`, gravar snapshot junto da abertura, e registrar auditoria. Nunca confiar na política KPI enviada pelo navegador. Quando flag OFF, preservar exatamente o fluxo atual. Respeitar ACL central, CSRF, máquina e workstation, OS obrigatória e bloqueio opcional de OS duplicada, concorrência, abertura em lote e chamadas simultâneas. A seleção pai+filho cria **um único chamado**; batch deve resolver consistentemente a escolha para os chamados criados por submissão.
3. **Frontend (PR S3-B3):** mostrar motivo principal → especialidades ativas, apenas em abertura de chamado com flag operacional habilitada; manter botões antigos intactos com flag OFF. Evitar duplicar Mecânica/Elétrica por motivo e não exigir novo login. Mostrar seleção e confirmação em PT, EN e ZH-TW.
4. **Histórico e dados (PR S3-B4):** expor snapshot de abertura, não nomes do catálogo vivo como se fossem fatos históricos. Alterar categoria/motivo posteriormente só por fluxo auditado com justificativa e permissões próprias; nunca fazer reclassificação tácita.
5. **S4 BI em PR própria:** Setup e Apoio são chamados reais com horas de equipe e downtime físico independente; não contar automaticamente episódios não corretivos em MTTR, MTTA ou MTBF. `eligible` é apenas candidato; requer natureza corretiva, responsabilidade manutenção confirmada, parada física verificada, episódio integralmente corretivo e não-teste. `pending` permanece pendente. Confrontar regressões de disponibilidade/downtime e histórico com fixtures sanitizadas e CI.
6. **Segurança/rollback:** migrações aplicadas somente após backup consistente de PostgreSQL, teste de restore e checklist de serviços/HTTPS/credenciais; em eventual falha manter flags OFF, restaurar código e, se necessário, banco a partir de backup seguindo procedimento previamente aprovado. Desativar flag não deve apagar snapshots nem alterar histórico.

## Critérios de CI para aceitar merge na main
- Backend typecheck e testes Prisma/PostgreSQL efêmero: flags OFF, ausência/combinação inválida de opções, revisão concorrente, opção inativa, política KPI, rollback transacional, OS individual/lote e simultaneidade.
- Frontend testes e navegação em resoluções existentes: motivo→opção, locale PT/EN/ZH-TW, fluxo legado OFF, acessibilidade teclado/modal e sem duplo envio.
- Windows PowerShell instalador: opção de atualização sem acionar comandos destrutivos por padrão, backup pré-migração, health check, rollback e compatibilidade Windows Server 2016 / PostgreSQL 17 / Node 22 verificados no roteiro de implantação.
- Testar matriz de permissões e limites de sessão com Produção, Manutenção, Líder, Gerente e Admin; nenhuma nova capacidade de gestão acidental.

## Entrega futura no servidor da Evergreen (não executada)
1. Aprovação das PRs e CI verde na `main`, congelamento do SHA a instalar.
2. Revisão de diferenças de schema + backup consistente das configurações e PostgreSQL e restauração validada em ambiente isolado/temporário apenas durante janela técnica.
3. Plano de mudança agendada: parada/retorno dos serviços, migrations, health 3001/8080 HTTPS, login central, workstations fixadas, abertura/cancelamento/histórico, OS, BI, Node-RED/GPIO e rollback.
4. Ligar flags progressivamente e com aceite: primeiro catálogo; depois hierarquia de botões; depois nova regra BI. Não ativar automaticamente ao atualizar.
5. Registrar versão, executante, hora, evidências, resultados e reversão no Diário do Drive.

## Ordem ativa de pendências
P0: concluir PR #431 (sessões sem expiração, logout remoto), CI e revisão, sem ativação antecipada.
P1: S3-B1 snapshot aditivo; S3-B2 servidor; S3-B3 UI; S3-B4 histórico.
P1: S4 BI + testes de paridade.
P1: revisar 33 controles de segurança sem marcar concluído sem evidências.
P2: preparar pacote e roteiro oficial de atualização do servidor/rollback.
**Status deste arquivo:** contrato técnico e preparação registrados, sem nova funcionalidade em execução; nenhum deploy na fábrica.
