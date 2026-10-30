# SEC-04/2N — Edição de diagnóstico histórico com login central e PIN

30/10/2026 — Continuação dos 11 ajustes e do roadmap #232.

## Mudanças
- Integrar exclusivamente `PATCH /api/andon-calls/:id/failure-details` ao modo central, protegido por `ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED=1`, OFF por padrão.
- Validar HTTPS, Origin, cookie e sessão central, workstation aprovada, `andon.read`, `history.read` e `diagnosis.edit`, escopo da máquina do banco, anti-CSRF; reaplicar verificações dentro da transação, após locks usuário → workstation → máquina.
- **Separação das permissões de manutenção e BI:** `diagnosis.edit` e `history.read` permitem corrigir somente texto, sem mudar classificação ou o tratamento histórico. Quando a classificação, a responsabilidade da parada ou a disposição analítica for alterada, exigir **também** `analytics.reclassify`, concedida independentemente na Administração. A verificação ocorre após lock da máquina usando o snapshot do banco, impedindo alteração indireta dos KPIs de MTTR/MTBF/downtime por um mantenedor sem autorização para reclassificar.
- Exigir PIN de mantenedor ativo, identificado por hash scrypt do servidor e revalidado após lock do técnico. Não confiar em nome/ID enviado pelo cliente, nem registrar PIN ou credenciais em auditoria.
- Permitir somente chamados reais **finalizados** e classificação específica válida, recusando chamados de teste e alterações de escopo alheio.
- Extrair e reutilizar o domínio legado para edição da classificação, responsabilidade, disposição analítica, descrição, evento de parada vinculado e `FailureDiagnosisAudit` detalhado. No fluxo central, registrar adicionalmente `AuditEvent` com o usuário autenticado, workstation, técnico, antes/depois e transação única. Falhas de gravação revertem tudo.
- Repetição sem alteração é idempotente e não duplica eventos de auditoria; legado mantém comportamento original.
- Sem schema migration, ativação de flags, merge ou deploy industrial.

## Validação
- `test:auth`: flag independente, rota exata, escopo de permissões, CSRF e módulo.
- `test:access:integration`: PostgreSQL isolado `/andon_test`, usuário restrito e workstation, PIN válido/inválido, correção de texto autorizada sem reclassificação, alteração de KPI bloqueada até concessão explícita de `analytics.reclassify`, ausência de sessão, CSRF, corpo adulterado, chamado de outra máquina, chamado teste, estado não-finalizado, atualização de evento de parada, reexecução sem duplicatas, rollback integral e revogação.
- CI completo de PostgreSQL, TypeScript, interface, HTTPS, Windows e regressão dos demais módulos.
- Homologação consolidada no notebook após fechar dependências. Banco industrial, Máquina 37 e Node-RED/GPIO não devem ser alterados.

## Dependências
PR #281 (saída individual) e #282 (inclusão de técnico) são independentes e continuam abertos; a ordem de merge deverá ser aprovada separadamente. Antes de ativar central na instalação real, reconciliar SEC-04, políticas de workstations e rotas de escrita remanescentes.
