# REFINE 17 — CFG-08B2: vínculo seguro de subcategorias sem promoção de KPI

## Escopo
Um usuário humano com sessão central válida e permissão explícita `andon.settings.open` pode associar **área técnica já cadastrada** a um motivo de chamado, com as mesmas exigências de workstation ativa/aprovada, HTTPS, Origin, CSRF, flags e auditoria existentes. `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED` permanece **OFF** por padrão.

## Contrato de autorização
- `POST /api/call-reasons/:reasonId/options` aceita do delegado SOMENTE: `id`, `technicalAreaId`, `displayName`, `active`, `displayOrder`.
- Os campos `natureOverride`, `maintenanceKpiPolicyOverride`, `suggestedResponsibilityOverride`, `analyticsDispositionOverride` são rejeitados antes de qualquer gravação.
- Dentro da transação, após bloquear usuário/workstation/catálogo global, revalidar a sessão, o grant e o perfil; o callback de domínio recebe **principal verificado no servidor**.
- Reconsultar o motivo e a área técnica no banco. Delegado só pode vincular a motivo **ativo**, com `maintenanceKpiPolicy != eligible`, a área **ativa** e relação válida; o resultado de `assertEffectiveReasonOption` também deve ser **não elegível**. Motivo corretivo exige área da manutenção.
- O Admin principal mantém a possibilidade de vincular motivos elegíveis segundo a política existente, inclusive com overrides explícitos sujeitos à validação original, sem regressão.
- Nenhuma nova permissão operacional, alteração de KPI corrente, backfill histórico, abertura hierárquica, regra de BI, flag ou integração GPIO/PLC.
- A UI desabilita o vínculo em motivo elegível/inativo para delegado, filtra áreas incompatíveis, mas não constitui fronteira de autorização; a API faz todas as verificações.

## Teste e aceite
- Testes de unidade para whitelist de payload, injeção de KPI, CSRF, grant ausente, conta de serviço e flags.
- Integração em PostgreSQL **isolado `/andon_test`** para criar Setup delegado (excluded), Manutenção pendente (pending), links permitidos, link de motivo elegível rejeitado (403), área incorreta rejeitada (400), injeção de override rejeitada (403), auditoria e integridade. Teste Admin legado preservado.
- `CI` GitHub Actions (Windows PS 5.1, backend, PostgreSQL, Vite/SSR, frontend) é pré-requisito de merge.
- Mesmo com CI aprovada, **main != notebook instalado != homologação física != release industrial**. Manter catálogo e abertura hierárquica individualmente desabilitados até autorização de teste; servidor industrial e HML antigo fora de escopo.

## Pendências explícitas
- CFG-08B3: cadastro delegado de **novas áreas técnicas** depende da autorização própria do catálogo de categorias e testes de impacto nas máquinas.
- CFG-15: varredura funcional restante das 11 abas.
- HIST-06 completo: layout global e por máquina, filtros e detalhamento integrados.
