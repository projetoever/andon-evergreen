# REFINE 19 — CFG-15B | Capacidade dinâmica nas 11 abas Config ANDON

Data: 13/11/2026. Continuação da matriz CFG-15A; correção de feedback, não de permissões.

## Problema
`CentralSettingsCapabilityNotice` lia `getSystemSettings()` somente na abertura do painel. Depois de mudar uma configuração em outra aba, receber mudança global de settings no Hub ou voltar ao navegador, a indicação "Recurso habilitado/desabilitado" podia ficar obsoleta. Falhas de consulta não tinham ação direta de retry.

## Implementação
- Revalidar disponibilidade reportada **pela API** ao trocar de aba, após `SYSTEM_SETTINGS_CHANGED_EVENT` e ao recuperar foco.
- Não confiar em detalhe de eventos do navegador para efetuar uma promoção de capacidade; refetch sempre.
- Descartar respostas de requisições antigas após mudança de aba, fechamento ou nova solicitação.
- Exibir `Tentar novamente` quando o GET falhar, sem presumir acesso.
- Não alterar o comportamento dos 11 formulários; cada ação de gravação continua protegida pelos gates de servidor existentes.

## Aceite
Todas as 11 abas continuam listadas, e as mudanças de capacidades reportadas pela API aparecem sem fechar e reabrir o painel. GET 403/5xx não indica possibilidade de salvar. A ação de retry reconsulta. Não ativar flags ou alterar ACL, banco, workstation, equipamento, GPIO ou Node-RED.

CI Windows/Linux/PG, revisão UI e notebook oficial antes de considerar homologado.
