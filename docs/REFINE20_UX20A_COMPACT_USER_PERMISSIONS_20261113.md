# REFINE 20 UX-20A — Cadastro de usuários: editor avançado enxuto

Solicitação 13/11/2026: retirar o botão “Aplicar permissões sugeridas” e seu texto auxiliar. A seleção automática dos quatro módulos essenciais permanece independente; Avançado continua permitindo revogar ações uma a uma.

“Diagnóstico: editar” é uma permissão REAL de correção de diagnóstico de chamado **já finalizado**, não o PIN: a API exige history.read + diagnosis.edit e PIN do técnico; mudanças que reclassifiquem KPI exigem analytics.reclassify. Por esse motivo preserva-se o grant para segurança e renomeia-se visualmente para “Histórico: corrigir diagnóstico finalizado (PIN obrigatório)”. Testes devem assegurar que nenhum controle PIN/ACL foi retirado.

Sem alterações em banco, ACL, grants salvos, presets essenciais, status de máquina, autenticação, sessões, CLPs. Homologar nomenclatura e layout no notebook após CI/merge.
