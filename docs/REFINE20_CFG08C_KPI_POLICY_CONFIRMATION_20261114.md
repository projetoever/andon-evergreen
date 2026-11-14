# REFINE 20 — CFG-08C | Apresentação separada de política de KPIs

**Base:** main `b1605f5b4b22824a23144ba57ae4f83639d2a948`, 14/11/2026.  
**Refs:** issue #477 (11 abas), #480 (backlog); PRs anteriores de delegação de Config. ANDON.

## Falha evitada
Um Admin que apenas alterasse nome, cor, ordem ou ativação de um motivo existente enviava junto os valores analíticos de natureza, responsabilidade e política de KPI, ainda que esses campos não tivessem mudado. O backend já os protegia; o formulário agora reduz o payload por padrão, removendo a possibilidade de regravação analítica desnecessária na edição de apresentação.

## Contrato
- **Editar apresentação de motivo existente:** PATCH mínimo com `displayName`, `color`, `active` e `displayOrder`, tanto Admin quanto delegado. Mantém `expectedRevision` e todos os checks existentes no servidor.
- **Alterar natureza ou política KPI de motivo existente (Admin principal):** exibe confirmação explícita na tela. Sem marcar, salvar fica desabilitado, com proteção também no handler. Envia os campos completos somente nessa ação deliberada; o servidor segue exigindo sessão e `analytics.policy.manage`.
- **Criar motivo elegível:** exige confirmação explícita do Admin. Criação delegada permanece conservadora, sem campo analítico.
- A confirmação é limpa ao selecionar outro motivo, criar novo, alterar natureza/política e após salvar. `ui()` usa textos já traduzidos em PT/EN/ZH.
- Não altera cálculo de MTTR/MTTA/MTBF/disponibilidade/downtime, históricos ou snapshots de chamados.

## Segurança e escopo
Confirmar na UI **não é** autorização. O servidor mantém prehandler central, CSRF, HTTPS/Origin, grants, sessão/workstation, locks, revisões e auditoria transacional. Não modifica flags, PostgreSQL, Node-RED, GPIO, CLPs, instalador, HML nem operação de fábrica.

## Evidências / testes
`tests/callReasonsDelegationUi.test.ts` revisado para exigir payload apresentação mínimo e prova de confirmação explícita; regressões legadas de delegação/CSRF mantidas.

**Gate:** PR isolada + CI frontend TypeScript/build, Linux/PostgreSQL e Windows PowerShell 5.1. Notebook oficial somente após merge verde, com homologação manual pelo operador.
