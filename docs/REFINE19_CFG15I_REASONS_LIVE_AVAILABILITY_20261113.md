# REFINE19 — CFG-15I | Motivos/subcategorias: sinalização e disponibilidade viva

Data: 13/11/2026. Issues #477/#480. A API de motivos e a abertura hierárquica são flags independentes e continuam OFF por padrão.

## Diagnóstico
A aba Motivos e subcategorias consultava `centralCallReasonsCatalogEnabled` apenas no carregamento inicial. Mudança de capacidade enquanto aberta deixava botões editáveis e erro 403 escondido até reabrir o modal. Uma falha de GET não devia ser tratada como autorização.

## Correção
Revalidar apenas a capacidade por GET real em SYSTEM_SETTINGS_CHANGED_EVENT/foco, com controle de geração e limpeza de listeners. Enquanto pendente ou com erro, bloquear operações de gravação. Mudanças de capacidade não alteram rascunho, seleção nem política de KPI. Se a API passar de indisponível para disponível pela primeira vez, recarregar catálogo protegido antes de permitir escrita. Exibir feedback de erro e retry no catálogo e na verificação de capacidade. Preservar grants delegados conservadores e autorização especial para KPI no backend.

## Segurança
Nenhum flag, endpoint, migração, role, KPI, snapshot histórico, máquina, CLP ou Node-RED foi alterado. O banco/ACL continua decidindo o 200/403/409; este ajuste é UI fail-closed, não migração de funcionalidades. Regressão CFG-15I em tests/callReasonsDelegationUi.test.ts, CI Windows5.1/Linux+PG/UI e homologação posterior no notebook. O recurso continuará indisponível quando a flag do servidor não estiver autorizada.
