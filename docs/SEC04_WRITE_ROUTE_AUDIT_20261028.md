# SEC-04 — Inventário verificável de operações de escrita (etapa 1)

Data: 28/10/2026. Roadmap #232, auditoria de autorização central.

## Resultado
A matriz de planejamento existente em `centralActionRegistry.ts` cobre as transições fundamentais de chamados, status/produção por máquina e edição de prioridades, mas **não** representa todas as operações de escrita registradas no servidor.

Esta etapa adiciona um inventário explícito das demais escritas em `centralWriteInventory.ts` e o teste `centralWriteInventory.test.ts`, que compara rotas efetivamente declaradas nos 15 módulos selecionados contra a matriz de planejamento e a lista de pendências. Uma nova rota nesses módulos falha no teste se não for registrada na matriz ou justificada como pendente. Remoções e duplicações também falham.

- Rotas de escrita declaradas nos módulos revisados: **55**.
- Já previstas na matriz de planejamento: **14**.
- Ainda não migradas e com motivo explícito: **41**.

## Limites de segurança
Este inventário é um detector de divergências e documento de revisão, **não autoriza qualquer chamada**. `enforceWorkstationAccess` continua negando todas as mutações de usuários centrais (`central_action_not_supported`). O modo legado e as identidades de serviços industriais não são alterados. As entradas da matriz original continuam sendo apenas planejamento, também sem liberação central.

O teste abrange os módulos explicitamente listados; não afirma cobrir todas as rotas administrativas nem registradores dinâmicos de outros arquivos. Expandir este escopo e definir autorização transacional por ação são etapas posteriores. As operações de autenticação e preferências não devem herdar permissões genéricas de catálogo/produção.

## Próxima etapa
SEC-04/2: rever cada grupo e implementar guards vinculados ao recurso real (máquina, chamado, técnico e escopo), propriedade, concorrência e trilha de auditoria; liberar um subconjunto por PR e testes positivos/negativos isolados. A autorização central de escrita permanecerá desativada enquanto houver dependências de produção.

Sem mudanças em banco real, máquina 37, certificados, Node-RED, GPIO, HTTPS, install scripts ou deploy.
