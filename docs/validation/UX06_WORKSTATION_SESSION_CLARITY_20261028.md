# UX-06 — Workstation, presença e sessão sem ambiguidades

Data: 28/10/2026. Continuação do roadmap #232, item original 4 (primeira entrega de interface).

## Problema
Uma estação registrada e seu IP/último contato não provam que o browser ou kiosk está conectado. A pessoa que solicitou a aprovação não é necessariamente o usuário autenticado. A informação genérica "sessão não válida" ocultava a causa.

## Comportamento
- Separar "sessão central autenticada", "solicitante da admissão" e "sem sessão central válida".
- Apresentar os estados retornados pelo backend: válida, expirada, revogada, usuário inativo e workstation bloqueada.
- Indicar se há registro no servidor nos últimos 30 minutos, sem atribuir status "online". Essa janela é consistente com o resumo do Hub.
- Manter PT/EN/ZH tradicional e responsividade, sem alterar ações de administração.

## Restrições
Sem mudança de contrato da API, banco, autenticação, regras de expiração, IP, workstation UUID, Node-RED/GPIO, HTTPS ou cálculo de KPIs. Gestão central continua desabilitada no piloto; sem deploy.

## Validação
CI de build/typecheck e testes regressivos existentes. Conferência adicional dos novos rótulos de sessão e de registros antigos/atuais no painel com fixture controlada antes de homologar no equipamento industrial. O teste de navegador `tests/browser/workstationAdmission.mjs` foi ampliado para validar os novos estados de sessão, a distinção entre solicitante e conta autenticada e o registro do último contato. O CI da revisão anterior passou com sucesso; a atualização desta documentação exige nova verificação do HEAD.
