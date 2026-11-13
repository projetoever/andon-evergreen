# REFINE 19 — CFG-15G | Máquina: capacidades e OS obtidas do servidor

Data: 13/11/2026. Issue #477, sequência da matriz de 11 abas.

## Causa
`MachineAdminPanel` atualizava `requireWorkOrderAtOpen` a partir de `CustomEvent.detail` originado no navegador, embora os gates de criar/editar máquina fossem consultados só em mount/retry. Uma mensagem local não é comprovação do estado da API; após mudanças externas o painel podia exibir política antiga.

## Correção
Eventos `SYSTEM_SETTINGS_CHANGED_EVENT` e `focus` invalidam a consulta anterior e provocam novo GET `getSystemSettings`. O hook já inclui flag `active` para descartar respostas tardias e `setCentralCapabilities(null)` para falhar fechado enquanto consulta pendente. Só a resposta verificada atualiza `requireWorkOrderAtOpen`, `centralMachineCreateEnabled` e `centralMachineSettingsWriteEnabled`. Dados digitados no cadastro e a seleção da máquina permanecem intactos. Removida confiança em `CustomEvent.detail`.

## Segurança/aceite
Sem nova capacidade de criação ou edição, sem alteração de banco/ACL/API/produção física, sem alterar o modal de programação protegida da PR #528. Teste de regressão CFG-15G e CI completa Windows/Linux/PostgreSQL. Notebook oficial sob responsabilidade do operador antes de aceitação.
