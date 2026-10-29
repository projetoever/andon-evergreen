# SEC-04/2A.8 — Paridade administrativa de workstations (rota legada e gestão central)

Data de referência: 28/10/2026. Planejamento: #232.

## Falhas identificadas

Em `PATCH /api/workstations/:id`, protegida por sessão Admin legada, havia três diferenças relevantes em relação a `PATCH /api/access/workstations/:id`:

1. Reativar `active=true` podia apagar `pendingApproval` sem decisão na fila de admissão, e não checava uma decisão anterior `rejected`.
2. Desativar uma estação não revogava explicitamente as sessões centrais `AccessSession` vinculadas.
3. A alteração não criava evento em `AuditEvent`, dificultando atribuir decisões a um caminho administrativo (legado/central) e inspecionar antes/depois.

## Correções

- Verificação adicional explícita da sessão Admin legada no handler (além do hook global).
- Após `lockWorkstationFlow(tx, workstationId)` e consulta do estado atualizado, impedir alterações de estação aguardando aprovação e impedir reativação de admissão rejeitada. O campo `pendingApproval` deixa de ser zerado indiretamente pela ativação legada: somente a decisão de admissão central altera esse estado.
- Persistir `active=false`, revogar sessões centrais ainda ativas da workstation e registrar evento `workstation.access.updated` com `actorType=legacy_admin`, `actorLogin=admin`, IP/estação de origem, identificador de requisição e snapshots de estado **na mesma transação**. O bearer token não entra na auditoria.
- Preservar a proibição de desativação com tela bloqueada ou técnico em atendimento e a proteção da própria estação administrativa.

## Testes

- `src/access/legacyWorkstationParity.test.ts`: contrato de que a checagem de aprovação e de técnico precede a mutação, e a revogação/auditoria fazem parte da mesma transação.
- `scripts/validate-legacy-workstation-update.mjs`: usa Fastify + PostgreSQL **isolado `andon_test`**, com autenticação Admin legada e workstations sintéticas. Exercita: falha de autenticação, pendência de admissão, rejeição anterior, alteração permitida, revogação de sessão na desativação, não ressurreição de sessão na reativação e eventos auditáveis sem segredos.
- Regressões anteriores de ciclo de chamados, sessão exclusiva, aprovação e workstations continuam no CI.

## Limites e homologação

- Esta entrega só alinha os caminhos administrativos legados. NÃO habilita nenhuma escrita de usuário central nos endpoints operacionais.
- O token da sessão Admin legada identifica a conta genérica `admin`, não individualiza pessoas. Consolidar identidades pessoais ainda é dependência para auditoria individualizada.
- Não altera regras de PIN, técnico, workstation de origem, históricos de chamados, BI, Node-RED, GPIO, Máquina 37 ou certificados; sem migration, atualização de serviço produtivo ou deploy.
- A revisão completa de endpoints de escrita e a integração do callback de domínio de atendimento (SEC-04/2A.9) permanecem pendentes.
