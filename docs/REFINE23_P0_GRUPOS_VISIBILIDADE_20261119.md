# REFINE 23 — Grupos de chamados e visibilidade temporária dos setores (19/11/2026)

## Estado e controle de release
- Repositório: projetoever/andon-evergreen; branch de desenvolvimento: `refine23/p0-grupos-visibilidade-20261119`.
- Base `main` confirmada na análise: `4387b6eadb61222a1d0cd6f3557322fdc31aa07d` (REFINE 22.5).
- Somente branch isolada; **nenhuma promoção à main, instalação ou deploy em fábrica** sem CI e aprovação humana.
- Homologação em notebook oficial `C:\web-andon-industrial\andon`, somente pelo instalador opção 2 após merge aprovado. Saúde/integração não substituem aceite operacional.

## Diagnóstico reproduzível
1. Cadastros globais de setores: `server/prisma/schema.prisma` → `AndonCategory` (`active`, `displayName`, `color`, `categoryGroup`, `displayOrder`).
2. Grupos: `CallReason`; vínculo: `CallReasonOption` com `@@unique([reasonId, technicalAreaId])`.
3. Chamado: `AndonCall.machineId`, `subtype`, `status`; snapshot imutável `AndonCallReasonSnapshot` tem os IDs e a política analítica congelados, **sem FK ao vínculo mutável**.
4. Tela: `src/pages/MachineDetailPage.tsx` filtra `activeCalls` por máquina, chamados reais e status `open`, `in_progress`, `post_maintenance`. `src/components/machines/MachineActionPanel.tsx` seleciona pelo callId e bloqueia duplicidade de abertura.
5. Contexto `src/context/AndonProvider.tsx` sincroniza chamadas com API periodicamente, em focus/online; não depende de `localStorage` para a identidade de chamadas.
6. **Lacuna confirmada:** não foi identificado cadastro de visibilidade de setor específico por máquina no modelo `Machine` ou no editor de máquinas. O `active` de `AndonCategory` é global e não substitui preferência local por máquina. Criar esse controle requer especificação e implementação próprias, sem reutilizar inativação global.

## Implementação em revisão — P0-A
- `DELETE /api/call-reasons/:reasonId/options/:optionId` exclui **somente** `CallReasonOption`.
- Corpo estrito `{ "expectedRevision": N }`; conflito 409 se o registro mudou. Sem alterações no setor nem na tabela de chamados/snapshots; retorno auditado.
- Proteção: feature gate central, método/caminho exatos, sessão válida, CSRF, permissões do Admin principal, workstation, escopo, duas revalidações transacionais e log de auditoria atômico.
- UI: cartões compactos, edição/ativação, prévia de BI recolhível, botão Remover do grupo com confirmação inline e mensagens discretas. Delegado não pode excluir vínculo nem alterar política KPI.
- Nota de idempotência: uma segunda exclusão após a primeira deve retornar não encontrado, sem qualquer modificação em setores/chamados.

## Implementação em revisão — P0-B
- `src/utils/deriveMachineSectorTiles.ts`: função pura para unir **setores normalmente visíveis** com setores presentes em **chamados ativos e reais** da máquina; deduplicação por `subtype`; exclui testes e estados finais.
- Setores excepcionais usam ID, nome e cor do catálogo de setor (mesmo que inativo); não mudam `AndonCategory.active` nem máquinas, grupos ou indicadores.
- Botão excepcional traz atributo `data-temporary-active` e aviso `Chamado ativo`; clique usa `onSelectCall(activeCall.id)`, nunca `onOpenSubtype`.
- Depois de todos os chamados ativos do setor terminarem, a função o remove da exibição excepcional. Continua visível durante atendimento mesmo se seu grupo for desvinculado, pois depende de `AndonCall`, não do grupo.
- UI da máquina carrega catálogo completo apenas para identidade/cor e mantém setores globais ativos para abertura direta.
- Não há alterações planejadas em Node-RED/GPIO, BI, banco físico, PIN ou sessões.
- Limite: como não existe preferência de ocultação por máquina, o cenário de setor originalmente oculto **somente nessa máquina** fica pendente de um controle explícito de visibilidade por máquina. Não declarar a prioridade inteiramente homologada.

## Testes e bloqueios de merge
- Suite adicionada a `npm run test:ui --prefix server`: `tests/refine23GroupSectorVisibility.test.ts`.
- Backend: regressões em `server/src/security/centralCallReasonsHttp.test.ts` e `server/src/services/callReasonMutations.test.ts`.
- Preservar os testes antigos de grupos, classificação, permissões, chamada simultânea, autorização e BI; PR aciona `.github/workflows/pr-validate.yml`, incluindo Windows PowerShell, PostgreSQL, UI, BI, TLS e Playwright.
- Não há execução local de npm test nesta edição conectada; registrar CI separadamente com resultado real. CI verde não substitui homologação física.

## Roteiro de homologação no notebook, **somente depois de merge aprovado**
1. Fazer backup e confirmar SHA e health; atualizar pela opção 2 do instalador, nunca servidor da fábrica.
2. Criar dois grupos, vincular Elétrica ao primeiro, tentar duplicar vínculo, abrir chamado de grupo e conferir só um registro; atendimento, acompanhamento e finalização sem regressões.
3. Criar chamado de setor não presente nos botões normalmente visíveis da máquina em ambiente de teste; validar botão temporário, nome/cor, estado e clique que seleciona ocorrência, sem abrir nova. Não usar a inativação global como substituto de ocultação por máquina.
4. Com chamado ativo, desvincular setor do grupo usando Admin principal. Validar confirmação, botão ainda selecionável, fluxo de técnico e histórico, sem mudar o setor original nem snapshot de BI.
5. Recarregar navegador, fechar/abrir Firefox e Chrome, reiniciar workstation e abrir segundo terminal; garantir mesmo estado derivado dos chamados no servidor; encerrar todos e confirmar restauração.
6. Testar 403 delegado, 401 sessão, 409 revisão obsoleta, CSRF, falta de permissão, tela em mobile/tablet e mensagem em PT/EN/ZH-TW; confirmar cores e responsividade.
7. Comparar BI antes e depois, MTTA/MTTR/MTBF, downtime e snapshots de nature/KPI; verificar histórico global, Hub, som, Node-RED/GPIO sem mutações nesse release.
8. Marcar cada critério aprovado/reprovado com captura e SHA instalado no diário do Drive.

## Backlog retido
- **P0** — incluir configuração explícita por máquina de setores ocultos/visíveis com leitura/escrita central autenticada e auditable, sem reclassificar/inativar `AndonCategory`.
- **P0** — homologar visualmente Hub REFINE 22.5; chamados simultâneos; seleção de ocorrência e multi-técnico.
- **P0** — verificar invariância dos snapshots, classificação BI e preservação histórica no PostgreSQL real de notebook.
- **P1** — aprimorar responsividade em desktop/tablet/mobile, estados vazios/erros e criação/revinculação.
- **Separado** — SDK/integrações industriais permanece laboratório sem ativação em fábrica.

## Decisão
Não integrar `main` antes de CI completa, revisão humana, implementação/decisão explícita sobre lacuna de configuração por máquina e gate de homologação.
