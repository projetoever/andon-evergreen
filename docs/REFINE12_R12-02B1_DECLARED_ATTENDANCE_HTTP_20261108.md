# REFINE 12 — R12-02B1 | Endpoint central de atendimento por nome declarado (08/11/2026)

## Estado
Subetapa implementada em PR DRAFT encadeada sobre R12-02A (#386), que descende da candidata E034 (#385). **Ainda NÃO liberada no launcher HML, nem na UI, nem homologada.**

## Contrato operacional
PATCH /api/andon-calls/:id/attend-declared
Body estrito: { "technicianNames": ["Ana", "Bruna"] }
Requer ANDON_CENTRAL_ACCESS_ENABLED=1 e ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED=1 (nova flag independente, omitida/desabilitada por padrão).

Segurança obrigatória:
- HTTPS, Origin, sessão central válida, workstation ativa e aprovada, CSRF já no guard global.
- Apenas contas humanas purpose=normal com andon.read e calls.attend.
- Máquina do chamado resolvida do PostgreSQL, escopo do usuário validado dentro da transação.
- Ordem de lock usuário -> workstation -> máquina -> IDs dos técnicos ordenados.
- Seleção exata por nome do cadastro ativo; nomes ambíguos, duplicados, inexistentes, inativos, áreas divergentes e sessões ativas (inclusive legado por nome) são rejeitados.
- Após locks revalida identidades, sessão, workstation, área, estado e exclusividade.
- Reutiliza domínio existente de atendimento e sessões para preservar contadores e KPI; grava auditoria no mesmo commit.
- A auditoria tem action=calls.attend.declared, reason=operator_selected_name, identificationMethod=name, identityVerified=false, conta/sessão autora, workstation, requestId, máquina, chamado e técnicos. **NÃO equivale a identificação comprovada por PIN/RFID**.
- Rota existente PATCH /api/andon-calls/:id/attend para PIN/RFID não foi alterada, modo legado permanece isolado.

## Gates restantes antes de HML
- Verificar CI integral da branch sobre E034+R12-02B1, Windows, PostgreSQL e browser.
- Desenvolver testes integrados próprios em PostgreSQL para corrida de 2 workstations, sessão revogada, rollback de audit e métricas invariáveis.
- Definir política UI/config central de modo nome com flag OFF por padrão e identificação visível como DECLARADA em PT/EN/ZH. Só então incluir flag no launcher HML com teste de opt-in estrito.
- Testar nome no início e adição de técnico em acompanhamento separadamente; este lote trata SOMENTE início do atendimento.
- Somente homologar no notebook isolado após autorização; NÃO modificar nem fazer merge em E034 #385, nem atualizar o laboratório original.

## Convivência com HML E034
A candidata #385 já tem CI aprovada e pode formar rodada HML própria quando autorizada, sem aguardar R12-02B1. PR de CI para branch mais nova NÃO é candidata a merge. Nunca executar ATUALIZAR_NOTEBOOK.ps1 (#372) nem tocar C:\web-andon-industrial\andon, banco andon_db, fábrica, PLC, GPIO ou Node-RED.
