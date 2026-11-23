# PENTE 2 — Prioridades | Registro técnico, riscos e homologação

Data: 23/11/2026. GitHub: #614, PRs #615 (A), #616 (B), #617 (C), #618 (D), E (histórico/testes). Base original: `main@7dd64d3a6c4cf9574fb271c32f38e70270b72cb2`.

## Escopo implementado em branches de desenvolvimento

- Sidebar desktop e Sheet mobile com cinco seções, sem alterar regras do Dashboard.
- P1–P5 continua determinado pelas cinco primeiras máquinas **ativas** da sequência inteira; independe de `productionMode`.
- `GET /api/dashboard-priority/order` devolve `productionMode` oficial, ou `null` se inválido, mais `productionModeChangedAt` do evento aberto coerente, nunca do `machine.updatedAt`. O filtro de escopo é aplicado **antes** da leitura dos eventos.
- Ação de programação utiliza exclusivamente `ProductionModeCredentialModal` e POST já protegido `/api/access/machines/production-mode`; exige concessões de operação/programação e credencial humana separada. A escrita é transacional, usa estado anterior (`expectedProductionMode`/HTTP 409), encerra evento anterior, cria `MachineProductionEvent` e registra auditoria. `priorities.write` não concede programação.
- Filtros de ID/nome, ativação e programação aplicam-se à renderização, mantendo `rows` completo. Reordenação filtrada modifica somente slots visíveis; máquinas ocultas não mudam de posição. Índice exibido indica posição **global**.
- `PUT /api/dashboard-priority/order` exige `expectedMachineIds` (comparação com snapshot original sob lock) para evitar overwrite concorrente mesmo quando catálogo não mudou. HTTP 409 mantém alteração local sem salvá-la e permite recarga explícita com confirmação.
- Histórico limitado a 100 registros reais de `MachinePriorityHistory` com filtro SQL por máquina. Identidade do editor é ocultada para usuários com escopo parcial. Sem métricas deduzidas.

## Segurança: invariantes

Sem migrações, limpeza de histórico, alteração de KPI/SQL BI, CLP, servidor industrial, Node-RED, CA, firewall ou certificados. O frontend não define permissões: HTTPS, Origin, CSRF, sessão, workstation, módulos, machineScope e a permissão separada continuam validados no servidor.

**Limitação proposital:** mudança de programação no painel Prioridades exige também acesso autorizado ao módulo operacional, pois o endpoint seguro existente verifica `assertModule(..., "operational")`; perfis apenas de Prioridades continuam em somente leitura para programação. Não criar bypass silencioso para acomodar perfis.

## Gates de teste automatizado

1. `test:ui`: PENTE2 sidebar, links compartilhados, programação protegida e read-only sem acesso.
2. `test:dashboard`: P1–P5, chamadas operacionais e reordenação sob filtro.
3. Rotas isoladas `scopedBiPriorityReads.test`: SQL máquina, produção, histórico, redigir editor, falha sem principal.
4. PostgreSQL `validate-central-priority-pg.mjs`: escrita com permissões, controle de concorrência, rollback, histórico e CSRF.
5. Validação dos KPIs oficiais BI read-only e regressões de autorização.
6. Build TypeScript, SSR, testes de integração e instalador Windows PowerShell 5.1.

## Homologação notebook — SOMENTE após CI final e integração controlada

1. Registrar backup e SHA instalado via instalador oficial/Health 6; conferir API, frontend, banco e HTTPS; ambiente industrial **não** autorizado.
2. Desktop sidebar persistente; mobile 360/390/412 px drawer, foco/ESC/teclado/touch, claro/escuro e PT/EN/zh-TW.
3. Lista P1–P5 idêntica ao Dashboard no conjunto completo; ativa/inativa não se mistura com programação.
4. Buscar e filtrar; mover com teclado e toque, arrastar sem mouse, testar máquinas ocultas mantendo posições e desfazer.
5. Só leitura sem botão de gravação; gerente com `priorities.write` e escopo global; gerente `selected` não edita; estação não aprovada/bloqueada sem acesso.
6. Programação por máquina: status real, horário de evento quando presente, ausência como desconhecido; separar solicitação e aprovação por senha; testar falta de `andon.read`, falta de `production.schedule.request`, falta de `production.schedule.write`, máquina inativa, estação sem módulo operacional e PIN/senha inválidos.
7. Em `andon_test`, transição scheduled → not_scheduled → scheduled e 409 com dois editores; verificar uma só transição/histórico e nenhuma mudança retroativa de KPI/intervalos.
8. Histórico: registros reais e usuário parcial sem nome de editor global; listagem limitada e atualização.
9. Simular edições concorrentes da ordem em duas sessões: uma salva, outra recebe 409, recarrega após confirmação; nenhuma perda silenciosa.
10. Links de módulos conforme permissão do servidor; Hub, ANDON, BI, Histórico Global; ausência de links sem autorização. Regressão de BI e PDF/CSV.

Resultado por caso: APROVADO / REPROVADO / NÃO TESTADO, evidencia visual anonimizável. Não declarar PENTE 2 homologado antes de completar esta lista no notebook.

## P2 pós-entrega

- Exportações CSV/PDF de prioridades e auditoria, após regras de escopo e sanitização.
- Agrupamentos por linha/turno, somente com dados fidedignos; marcadores de urgência com regras auditáveis.
- Melhorias de visualização e acessibilidade com testes reais em dispositivos.
- ERP/PLC/Node-RED, otimização automática e sugestões inteligentes ficam fora desta release.
