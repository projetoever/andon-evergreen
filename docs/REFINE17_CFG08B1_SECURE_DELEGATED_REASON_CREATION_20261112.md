# REFINE 17 — CFG-08B1 | Cadastro de motivos com delegação conservadora

Escopo: somente o cadastro de um motivo pai por conta humana central com `andon.read` + `andon.settings.open`, workstation autorizada e feature flag `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED=1` ativada sob homologação. A flag permanece OFF por padrão; a abertura hierárquica é independente.

- `POST /api/call-reasons` por delegado admite exclusivamente `id`, `displayName`, `nature`, `color`, `active` e `displayOrder`.
- Natureza `corrective_failure` ou `unclassified`: responsabilidade `unassigned` e KPI `pending` (nunca `eligible`).
- Natureza `planned_setup` ou `production_support`: responsabilidade `operations` e KPI `excluded`.
- Sempre `analyticsDisposition=include`, preservando chamada operacional/tempo físico e regras posteriores de evidência.
- Natureza/política de motivo existente e criação de vínculos de especialidades permanecem reservadas ao Admin principal; vinculação delegada requer projeto CFG-08B2 com testes de não promoção KPI.
- API e adapter verificam a whitelist separadamente; sessão, escopo workstation, CSRF e auditoria atômica com rechecagem de grants na transação são obrigatórios.
- Testes: unidade/HTTP e integração PostgreSQL sintética e isolada em `/andon_test`.

Não considerar disponível em notebook, muito menos produção, sem atualização por `main`, ativação controlada individual, validação positiva/negativa de perfis e rollback.
