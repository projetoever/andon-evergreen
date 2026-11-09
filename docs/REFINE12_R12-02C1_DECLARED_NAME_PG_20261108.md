# REFINE 12 / R12-02C1 — Ensaio PostgreSQL para atendimento por nome declarado

Data: 08/11/2026 | Issue #345 | Base: R12-02B2 (#390), R12-02B1 (#388), R12-02A (#386), E034 (#385)

## Mudança
Teste de integração obrigatório `server/scripts/validate-central-declared-name-pg.mjs`, adicionado ao pipeline `test:access:integration`. Executa somente quando `ANDON_INTEGRATION_TEST=1`, conexão exata ao banco isolado PostgreSQL `/andon_test` e flags de acesso central/atendimento por nome inicialmente DESLIGADAS. Refusa iniciar em `andon_https_hml`, `andon_db` ou produção.

Cobertura:
- HTTP real de `PATCH /api/andon-calls/:id/attend-declared`: flag OFF nega; HTTP TLS/Origin, sessão, workstation, CSRF, payload allowlist; nomes duplicados/inexistentes; nenhum evento de domínio/auditoria nesses casos;
- dois clientes PostgreSQL independentes, duas contas humanas normais, duas workstations, máquinas distintas e MESMO técnico: somente uma transição válida, sem duas sessões ativas;
- auditoria durável `calls.attend.declared`, conta/estação/máquina/call, `identificationMethod=name`, `identityVerified=false`, nenhuma credencial/pseudocredencial no registro;
- falha simulada de escrita auditável dentro da transação reverte chamado, sessão e estado da máquina;
- sucesso via HTTP e rejeição de replay; revogação da sessão humana bloqueia nova escrita.

## Gate de segurança e testes
Ainda depende de CI real Windows, build, PG e browser. Ao fim, registrar run SHA exatos. Este teste não cobre todas as regressões possíveis; #345 permanece aberta até autorização de HML separada, nomenclatura PT/EN/ZH conferida, opções de nome para entrada durante acompanhamento e teste visual pelo usuário.

## Fronteiras
O usuário está executando o *pacote E034 #385* em HML pelo script PowerShell V2. Esta branch de validação #392 NÃO faz parte dessa versão e NÃO será instalada, mesclada ou ativada automaticamente. O próprio test runner recusa bancos que não sejam o teste sintético `/andon_test`. Não tocar ambiente industrial, banco `andon_db`, GPIO, PLC ou Node-RED.
