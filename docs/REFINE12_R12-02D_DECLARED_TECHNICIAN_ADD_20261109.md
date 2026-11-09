# REFINE 12 / R12-02D — Nome declarado para inclusão de mantenedor em atendimento e acompanhamento

Data: 09/11/2026 | Issue #345 | Base: PR #392 (C1) → #390 (UI início) → #388 (HTTP início) → #386 (verificação) → #385 (E034).

## Entrega
- Endpoint **independente** `POST /api/andon-calls/:id/technicians-declared` em modo de acesso central HTTPS, flag `ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED=1` **DESLIGADA por padrão** e **dependente** de `ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED=1`. Nenhuma destas flags está ativa no instalador/HML E034.
- Prehandler exige HTTPS, Origin, login Hub pessoal humano normal, workstation aprovada e ativa, `andon.read`, `calls.technicians.manage` e CSRF. O corpo aceita **somente** `{ "technicianNames": ["Nome do cadastro"] }`. Rejeita `technicianId`, `identityVerified`, `credentials` e qualquer campo extra.
- Servidor resolve nomes únicos no catálogo central, valida ativos/área, bloqueia duplicidade e outras sessões (inclusive legado sem ID), ordena locks PostgreSQL por usuário → workstation → máquina → técnico(s), revalida sessão/permissões/escopo e limita o chamado a seis técnicos simultâneos.
- Entrada registrada na mesma transação PostgreSQL que o evento `calls.technicians.add.declared`, com `identificationMethod:"name"`, `identityVerified:false`, operador/estação/sessão reais, fase `maintenance` ou `follow_up`. É uma **declaração do operador**, nunca autenticação do mantenedor. PIN/RFID e encerramento individual seguem nas rotas verificadas existentes.
- `GET /api/system-settings` retorna somente a capacidade *read-only* `centralDeclaredNameTechnicianAddEnabled`; modal de inclusão lista nomes apenas se capacidade explícita e opção de atendimento por nome também habilitadas. O frontend envia somente nomes à nova rota; misturar credenciais PIN/RFID e nomes declarados em uma requisição central é rejeitado.
- Mensagens da aba de configurações em PT/EN/ZH-TW diferencia se a inclusão de mantenedor por nome está ou não autorizada.

## Testes
- `tests/centralAttendanceMode.test.ts`: UI, CSRF, flag e separação de rotas.
- `server/scripts/validate-central-declared-technician-add-pg.mjs`: exige explicitamente `ANDON_INTEGRATION_TEST=1`, URL contendo **somente** banco `/andon_test` e flags central OFF na inicialização. Exercita API HTTP fake TLS/Origin, sessão, CSRF, seleção escopada, payload inválido, nomes duplicados/desconhecidos; corrida de dois clientes PostgreSQL e workstations pelo mesmo técnico; isolamento, auditoria, falha da auditoria com rollback, entrada em acompanhamento, replay, revogação e flag OFF. Está associado ao pipeline `test:access:integration`.

## Segurança e aceite
**NÃO ATIVAR EM HML NEM FÁBRICA nesta PR.** O notebook do usuário já atingiu E034: log Windows confirma `HML E034 PRONTA PARA TESTES` SHA `92debbe57d96f452cc2d72082e3fd6787294b246`, backup/restore e paridade BI aprovados. Essa atualização é separada de R12-02D.

Esta PR é DRAFT, não autoriza merge/deploy. Revisar CI, PostgreSQL e fluxos de cancelamento/encerramento antes de liberar nova versão de homologação. Issue #345 ainda exige aceite visual real, revisão PT/EN/ZH e decisão sobre a própria saída do técnico por nome (hoje PIN/RFID).
