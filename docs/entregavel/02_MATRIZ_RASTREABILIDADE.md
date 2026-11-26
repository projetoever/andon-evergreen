# M1-TRC-001 — Matriz rastreável de funcionalidades

**Status:** minuta de pré-entrega. Cada linha liga comportamento → origem técnica → permissão → teste → manual. Evidência prática ainda não anexada.

| ID | Requisito verificável | Origem principal | Grants/salvaguardas | Teste DOC1-QA | Manual |
|---|---|---|---|---|---|
| F-01 | Hub só oferece módulos autorizados | `src/pages/HubPage.tsx`; `server/src/routes/modules.ts` | Sessão, workstation, permissão | H01, H02 | MAN-HUB |
| F-02 | Máquina identificada e legível em cards e detalhe | `DashboardPage.tsx`, `MachineDetailPage.tsx` | `andon.read` e escopo | H01, H22 | MAN-OP |
| F-03 | OS obrigatória e única quando configurado | `andonCalls.ts`; `workOrderUniqueness.ts` | `calls.open`, máquina/configuração | H03 | MAN-OP |
| F-04 | Abertura por grupo não duplica setor ocupado | `groupBatchOpening.ts`; `andonCalls.ts` | `calls.open`, validação transacional | H04 | MAN-OP |
| F-05 | Setor oculto mantém contexto de chamado ativo | `MachineDetailPage.tsx`; REFINE23 | Configuração e estado servidor | H05 | MAN-OP |
| F-06 | Vários técnicos, fases e tempos distintos | `server/src/routes/andonCalls.ts`; Prisma | `calls.attend`, `calls.technicians.manage` | H06,H07 | MAN-MNT |
| F-07 | Atribuição de impacto físico sem dupla contagem | `FailureEvent`, `CallImpactInterval`, analytics | Diagnóstico + ação legítima | H08,H16 | MAN-MNT, MAN-BI |
| F-08 | Histórico por máquina e global com filtro autorizado | `GlobalCallHistoryPage.tsx`; `andonCalls.ts` | `history.read`, `history.global.read`, escopo | H09–H11 | MAN-HIS |
| F-09 | P1..Pn até máquinas ativas e card do dashboard | `dashboardPriority.ts`, `DashboardPriorityPage.tsx` | `priorities.write`, CAS | H12,H13 | MAN-PRI |
| F-10 | Programação independe do ranking | `server/src/routes/machines.ts`; `machines.ts` | `production.schedule.request/write` | H14 | MAN-PRI |
| F-11 | BI distingue 0 real de sem amostra | `analytics/overview.ts`; `BiSampleDiagnosticsPanel.tsx` | `bi.read`, elegibilidade causal | H15–H17 | MAN-BI |
| F-12 | BI mantém valores ao trocar visual | `BiChartExplorer.tsx`, analytics | `bi.read` e filtros | H17,H18 | MAN-BI |
| F-13 | Auditoria de mutação e telemetria são diferentes | `accessAudit.ts`; `AuditEvent` | `audit.read` | H19,H20 | MAN-AUD |
| F-14 | CSV de auditoria exige permissão específica | `accessAudit.ts`, `modules.ts` | `audit.read` e `audit.export` | H19,H20 | MAN-AUD |
| F-15 | Sessão operacional persistente e revogável | `access/sessions.ts`; `AccessSession` | Sessão, policy, HTTPS, workstation | H21 | MAN-HUB |
| F-16 | Responsividade não esconde ações essenciais | MOB1; `src/pages`, `src/components` | Mesmo backend do desktop | H22,H23 | MAN-MOB |
| F-17 | Traduções funcionais PT/EN/zh-TW | `src/i18n` | Sem herança de permissões | H24 | Todos |
| F-18 | Falha de rede ≠ negação de acesso | UI e servidor de módulos | 401/403/503 distintos | H25 | MAN-SUP |
| F-19 | Atualização segura com Health sem writes | `installer`; docs REFINE15 | Operação autorizada no destino | H26,H27 | MAN-INS |
| F-20 | Nenhum bypass via URL direta | `access/policy.ts`; handlers | Sessão/escopo/CSRF | H02,H11,H19,H28 | MAN-HUB |

**Leitura:** as referências a código são pontos de partida para revisão, **não** uma prova de cobertura completa de cada teste. A trilha de evidência deve incluir ID de execução, resultado `PASS/FAIL/BLOCKED/NOT_RUN`, SHAs, responsável, data e anexo privado. `PASS` não pode ser atribuído por mera presença no código.

## Estados por grupo

| Grupo | Código presente | Teste automatizado | Teste notebook | Teste dispositivo | Autorização industrial |
|---|---|---|---|---|---|
| Hub e ACL | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | Quando aplicável: pendente | Não |
| Operação, grupos e atendimentos | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | Pendente | Não |
| Dashboard e prioridades | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | Pendente | Não |
| Histórico e BI | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | Pendente | Não |
| Auditoria e idiomas | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | Pendente | Não |
| Instalador/suporte | Confirmar no SHA de entrega | CI/PR a apontar | Pendente | N/A | Não |

Substituir os “pendentes” **apenas** depois de anexar as evidências correspondentes. Ver [Plano de homologação](../DOC1_HOMOLOGACAO_GUIADA_20261125.md) e [Termo de aceite](20_ACEITE_TERMO_E_FORMULARIOS.md).
