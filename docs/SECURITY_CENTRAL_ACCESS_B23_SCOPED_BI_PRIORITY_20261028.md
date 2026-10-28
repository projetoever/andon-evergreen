# SEC-03/B2.3 — Prioridades e filtros do BI com escopo de máquina

Data: 28/10/2026
Base de código: B2.2 (#224), dependente de B2.1 (#223). Nenhuma etapa da cadeia foi integrada à main neste momento.

## Objetivo

Aplicar autorização por máquina apenas a rotas cuja consulta é segura e
completamente mapeada. Evitar que um usuário de área limitada descubra
informações de outras máquinas a partir de opções de filtros ou da lista
de prioridades.

## Funcionalidades implementadas

- **GET /api/dashboard-priority/order**: `machine.findMany` inclui filtro
  PostgreSQL por IDs autorizados, antes da ordenação. Se usuário for restrito,
  `lastOrderUpdatedAt` e `lastOrderUpdatedBy` (metadados GLOBAIS)
  são nulos, pois podem revelar atividade fora da área permitida.
- **GET /api/analytics/filter-options**: filtro SQL de máquinas autorizadas.
  Opções de setores e classificações são catálogos globais, não ligados ao
  registro individual de uma máquina, e permanecem globais.
- Escopo vazio = nenhuma máquina; escopo `all` preserva a visão global.
- Regras de sessão, workstation, origem HTTPS e módulo são verificadas
  ANTES de vincular o contexto individual ao handler.
- GET e HEAD possuem a mesma autorização. PUT/PATCH/POST permanecem negados.
- A credencial legada da tela de Prioridades ainda é exigida quando a política
  atual solicitar senha; o login único será tratado separadamente. Não criar
  bypass dessa credencial sem substituir a política existente de modo auditável.

## Critérios de segurança

- A consulta do histórico e as rotas de chamados continuam protegidas
  pelas etapas B2.1/B2.2; a nova lista de prioridades não altera o banco.
- **Nenhuma métrica de BI agregada será liberada ao usuário restrito aqui.**
  O BI tem fontes independentes: AndonCall, FailureEvent, TechnicianSession,
  MachineProductionEvent, ImpactInterval, exclusões e drilldowns.
  Cada fonte precisa de escopo SQL coerente ANTES do cálculo; aplicar apenas
  um filtro visual ou filtrar o resultado já agregado é insuficiente.
- Outras rotas BI, inclusive overview, maintenance, reliability, temporal,
  machine-360, failure-intelligence, drilldown, continuam negadas para
  usuários restritos até essa revisão integral.
- Escrever prioridades e executar atendimentos exige permissão específica,
  regras operacionais de domínio e auditoria individual na fase B3.

## Testes

- Permissões por módulo diferentes: sem `bi.read`/ `priorities.read`,
  deve ser negado.
- Acesso por máquinas selecionadas, vazio e todas.
- Validação de predicados SQL dos dois endpoints.
- Metadados globais redigidos quando acesso restrito.
- GET/HEAD e mutação de prioridades com acesso central negado.
- Regressões existentes de workstations, Node-RED, banco e HTTPS.

## Dependência de merge

Este pacote contém o código das etapas B2.1 e B2.2 como ancestral da branch
e precisará de revalidação após essas duas integrações. Não realizar merge
fora de ordem, nem usar um CI verde como autorização para ativar o modo central.

## Evergreen

Sem alteração na Evergreen, firewall, certificados produtivos, mini PC,
Node-RED, GPIO ou Máquina 37. `ANDON_CENTRAL_ACCESS_ENABLED=0` permanece
obrigatório até teste industrial supervisionado e aceite da segurança.
