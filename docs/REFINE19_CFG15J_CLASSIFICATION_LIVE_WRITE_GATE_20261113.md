# REFINE19 CFG-15J — Revalidar capacidade de gravação da aba Classificações

## Diagnóstico (issue #477)
O painel de Classificações mantinha `centralWritable` carregado uma única vez no mount ou no botão de retry. O aviso superior das 11 abas já reconsultava o servidor ao receber foco ou alteração de configurações, mas os botões de salvar/ativar/inativar Classificações podiam permanecer editáveis após a revogação central.

## Correção
Consultar por GET `getSystemSettings` na montagem, ao receber `SYSTEM_SETTINGS_CHANGED_EVENT`, ao ganhar foco e no retry. Durante GET ou falha, `centralWritable=false` e ações de escrita não são oferecidas; mensagens de retry preservadas. Token de geração descarta respostas atrasadas e remove listeners no unmount. A verificação de permissão não altera catálogo carregado, seleção, busca, valores de draft nem disparos de save. O servidor continua aplicando ACL, sessão, origem HTTPS/CSRF, proteção da metodologia KPI e auditoria para classificações.

## Validação
Regressão CFG-15J em `tests/centralSettingsCapabilityMatrix.test.ts` + CI Windows PowerShell 5.1, Linux/PostgreSQL/SSR/frontend. No notebook: editar rascunho de classificação, sair/voltar foco e conferir preservação sem salvar automaticamente; ações bloqueadas em flag não liberada. Não ativar flags nem alterar classificação produtiva sem autorização. Sem migração/DB, KPI retroativo, máquinas reais, PLC/GPIO/Node-RED. O código não é homologação física.
