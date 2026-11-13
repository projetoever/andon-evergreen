# REFINE 18 — CFG-15D3B | Máquinas: criação × metadados × controle operacional

Data: 13/11/2026.

## Inconsistência comprovada
No painel Máquinas do Admin ANDON, o botão Nova e os campos de nome/OS podiam emitir chamadas de escrita quando os gates centrais estavam desabilitados. Além disso, editar o modo de produção era permitido na interface central, apesar de o endpoint central de atualização de metadados aceitar **exclusivamente** `name` e `requireWorkOrderAtOpen`; mudar estado/produção é operação industrial distinta.

## Implementação
- Leitura de `centralMachineCreateEnabled` e `centralMachineSettingsWriteEnabled` via `getSystemSettings()` já existente. No acesso central, a capacidade inicia indisponível, fica indisponível durante nova consulta, falha de rede e OFF. Retry explícito, preservando busca, filtros, seleção e leitura.
- `canCreateMachine`: protege Nova, ID, nome, OS inicial e Criar; `handleStartCreate` e `handleCreate` nunca enviam operação sem a capability true.
- `canEditMachineMetadata`: protege nome e exigência de OS em máquina existente, tanto nos controles quanto em `onBlur`/`onCheckedChange`.
- Seletor de modo de produção permanece visível, porém **somente leitura no acesso central**, com guard no callback; ativação também já estava bloqueada no modo central. Nenhuma autorização de máquina em produção é concedida pelo cadastro.
- Legado sem acesso central mantém comportamento anterior. Hierarquia de conjuntos/subconjuntos segue suas próprias guards (não incluída neste pacote).
- Flags são somente indicação de recurso; a API conserva sessão, workstation, anti-CSRF, ACL, locks e auditoria.
- Sem alterações em backend, migrações, instalação, banco real, PLC, sensores, GPIO ou Node-RED.
- Teste de regressão em `tests/centralSettingsCapabilityMatrix.test.ts`; mensagem PT/EN/ZH em `src/i18n/messages.ts`.

## Aceite
CI Windows PowerShell 5.1 e Linux/PostgreSQL/backend/frontend/SSR/browser desktop+mobile; merge somente após duas CIs verdes. Validação física em notebook por usuário com flags criação/edição independentes e escopos diferentes após atualizar `main`. Não alterar flags ou instalações como parte da PR.
