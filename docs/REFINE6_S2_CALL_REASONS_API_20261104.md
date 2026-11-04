# REFINE 6 — S2: API segura de motivos e subcategorias

**Data:** 04/11/2026. **Status:** implementação do catálogo HTTP sob opt-in; sem interface de botões, sem alterar a abertura dos chamados e sem alteração nos indicadores atuais.

## Controle de ativação

O novo catálogo HTTP só funciona quando **ambas** as variáveis estão explicitamente em `1` no **notebook de homologação**:

- `ANDON_CENTRAL_ACCESS_ENABLED=1`: sessão central já homologada;
- `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=1`: flag específica, **OFF** por padrão em todas as instalações.

Não ativar essas variáveis no Windows Server da Evergreen. Desativar a segunda flag bloqueia imediatamente a consulta e a escrita na API, mas **não apaga** os dados criados, permitindo revisão do rollback. O catálogo pode existir sem qualquer efeito no Andon/BI até futuras fases autorizadas.

## Endpoints sob acesso central

| Método e caminho | Função | Regras |
| --- | --- | --- |
| `GET /api/call-reasons` | Listar todos os motivos/opções, incluindo os inativos e política efetiva para conferência administrativa | Admin principal, acesso operacional, workstation autorizada, escopo completo |
| `POST /api/call-reasons` | Criar motivo com natureza e política de KPI obrigatórias | Requisitos acima + `catalog.reasons.manage`, `analytics.policy.manage`, CSRF |
| `PATCH /api/call-reasons/:reasonId` | Renomear, (des)ativar e editar política | `expectedRevision` obrigatório, não altera ID, valida opções existentes |
| `POST /api/call-reasons/:reasonId/options` | Criar opção de subcategoria vinculada a especialidade existente | Rejeita FK inválida, opções ativas ligadas a área inativa e política impossível |
| `PATCH /api/call-reasons/:reasonId/options/:optionId` | Editar nome/status/ordem/exceção de política | `expectedRevision` obrigatório; ID, motivo e especialidade imutáveis |
 
Nenhum endpoint `DELETE` foi disponibilizado. A política e os IDs mantêm integridade referencial; retirada eventual será realizada pela desativação.

## Dados e garantias

- **Motivo:** `id`, `displayName`, `color`, `active`, `displayOrder`, `nature`, `suggestedResponsibility`, `maintenanceKpiPolicy`, `analyticsDisposition`. Natureza e política precisam ser explícitas em `POST`.
- **Opção:** `id`, `technicalAreaId`, `displayName`, `active`, `displayOrder` e exceções opcionais `...Override`. Um mesmo `AndonCategory` (ex.: Mecânica) pode ser usado por pais diferentes; não pode aparecer duas vezes no mesmo pai.
- **Concorrência:** `PATCH` exige `expectedRevision`. Se outra pessoa já alterou o registro, retorna HTTP **409** sem gravar nem gerar auditoria de sucesso.
- **Validação:** Setup e Apoio nunca podem ser elegíveis para MTTR/MTBF corretivos. Mesmo Manutenção elegível continua apenas candidata; não gera falha física automaticamente. O cadastro de opções verifica a **política efetiva** (pai + exceção), não apenas valores individuais.
- **Segurança:** HTTPS, Origin exato, cookie de sessão central, ID de workstation aprovada, Admin principal, escopo integral, `catalog.reasons.manage`, `analytics.policy.manage` nas escritas, token CSRF e conferência da sessão **novamente dentro da transação**.
- **Auditoria:** gravação do catálogo e evento em `audit_events` na mesma transação, com autor, workstation, requisição, antes/depois sem segredo. Falha na auditoria cancela a gravação. Nenhuma credencial sai na resposta ou no log de auditoria.
- **Read-only industrial:** identidades Node-RED/GPIO nunca recebem permissão de catálogo. A flag OFF e o guard de rota impedem leitura e escrita fora do fluxo central.
- **Legado:** instalação em modo legado OFF não passa a ter API de motivos nova. Chamados, classificações, tempos e fórmulas `bi-causal-1` existentes permanecem exatamente como antes.

## Testes de regressão

`npm run test:auth --prefix server` e `npm run test:access --prefix server`: regras de domínio, permissão, CSRF, flag OFF, imutabilidade de ID, bloqueio de alterações conflitantes e isolamento da API sem marcador autenticado.

`ANDON_INTEGRATION_TEST=1 node server/scripts/validate-call-reasons-api-pg.mjs` roda exclusivamente na CI/PG local `andon_test`: cadastro de Setup, opção Mecânica, leitura efetiva, edição concorrente em duas conexões PG, recusa de Setup elegível, rollback quando a auditoria falha, negações de Origin/CSRF/workstation, permissão ausente, Admin não principal e mudança das flags. A execução gera exclusivamente dados sintéticos e os elimina ao final.

**Próximas etapas:** componente de administração no Hub, seletor de subcategorias no dashboard Andon com um chamado por especialidade, gravação de snapshot imutável do motivo na abertura, idempotência e futura versão `bi-reasons-1` com coortes/testes B01–B08. Aprovação em CI **não** autoriza o deploy industrial nem comprova a homologação física da Máquina 37, GPIO ou Node-RED.
