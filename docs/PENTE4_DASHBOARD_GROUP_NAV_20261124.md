# PENTE 4 — Dashboard ANDON: setor e grupo no card + navegação por permissão

Data: 24/11/2026. Issue #631. Repositório `projetoever/andon-evergreen`.
Baseline: `main@922e627e11e67506dc967408172670704e3fe034`.
Branch isolada: `pente/04-dashboard-grupos-navegacao-20261124`.

## Confirmação da origem
- Fluxo direto: `AndonCall.subtype` mantém ID técnico do setor; chamadas diretas não possuem snapshot de Grupo. Contrato confirmado em `docs/REFINE22_GROUPS_V2_PHASE1_HML_20261116.md`.
- Fluxo de Grupo: seleção envia `reasonId`, `optionId` e revisões; o backend valida o par e persiste no `callReasonSnapshot` uma cópia do nome original do Grupo e da opção/setor, sem FK de apresentação ao cadastro editável.
- O Dashboard destaca o chamado selecionado por `machine.currentCallId`, sem usar o motivo de outro chamado simultâneo.

## PENTE 4-A — Cards
- `src/utils/dashboardCallIdentity.ts`: função pura; Grupo somente com snapshot coerente (IDs, nomes e subtype/technicalAreaId consistentes). Recuo seguro ao rótulo do setor para abertura direta, legacy ou snapshot incompleto.
- `MachineCard.tsx`: exibe `Setor — Grupo` usando a seleção histórica; nome completo em tooltip e texto truncado para preservar dimensões, sem card extra, alteração de temporizadores ou de som.
- A identidade do Grupo é de apresentação. Não altera abertura, BI/KPI, prioridade, classificação, histórico, som ou política de participação.

## PENTE 4-B — Navegação
- `DashboardPage.tsx` usa `<ModuleNavigation showModuleLinks />`; remove botões duplicados de BI e Prioridades.
- `ModuleNavigation` mantém as condições `available && enabled && allowed` para os links e `centralAccessEnabled + globalHistory.available/allowed` para o Histórico Global.
- `DashboardPriorityPage` continua exigindo login quando a política da sessão o requer; uma navegação não substitui a autorização da rota/API.
- Controles específicos de som, destaque e Configuração permanecem no Dashboard; a Configuração continua a validar sessão/permissão no servidor.

## Testes e riscos
- `tests/pente4DashboardGroupNavigation.test.ts`: direto, grupo Setup, Apoio, setor oculto Pneumática, rótulo histórico, snapshot incompleto/incoerente, chamados simultâneos selecionados, binding e navegação.
- `tests/biPente1ModuleNavigation.test.ts`: teste antigo da navegação atualizada para o novo gate PENTE 4.
- A suíte `test:ui` inclui o teste novo. CI de PR será o gate automatizado completo.
- Homologação no notebook permanece pendente para layout em 1366x768/Full HD/tablet/mobile, clique/tooltip, tema claro/escuro, permissões de perfis reais, sessão persistente, reprodução e mute de áudio, estados, prioridade P1–P5 e atualização de chamados simultâneos.

## Restrições
- Sem alteração em database/schema/API/backend, CLP, Node-RED, GPIO, firewall, certificados, produção ou instalação.
- NÃO INTEGRAR NA MAIN sem autorização expressa. Notebook e ambiente industrial não homologados.
