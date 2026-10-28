# B2.4C/4c — Detalhes de qualidade dos dados, acesso mínimo e auditoria

Data: 28/10/2026. Continuação de #240.

## Alcance
`GET/HEAD /api/analytics/data-quality-details` disponibiliza investigações administrativas em cinco categorias: chamados abertos há mais de 24h, eventos físicos abertos, sessões técnicas abertas, chamados concluídos sem classificação e eventos sem chamado.

Cada resposta pode conter OS, diagnóstico livre, observações e nomes de técnicos; portanto, o usuário central exige **ambas as permissões `bi.read` e `history.read`** e uma workstation autorizada. Essa exigência existe no middleware, não somente na interface.

## Segurança por máquina
- Para cada categoria, **count e findMany usam o mesmo filtro SQL de máquina**, antes de `skip/take` e ordenação.
- Um machineId explícito fora da lista autorizada é recusado com 404 **antes da consulta de catálogo e dados**.
- Eventos físicos da máquina autorizada que apontam para chamado de outra máquina são avaliados somente pelo registro do próprio evento; seu callId estrangeiro é ocultado.
- Filtro por setor exige que a máquina do chamado vinculado também esteja autorizada; eventos não vinculados não recebem setor inventado.
- Sessões técnicas exigem autorização tanto da máquina da sessão quanto da máquina do chamado relacionado.
- Escopo vazio não concede acesso global. Acesso de escopo global e modo legado mantêm a lógica anterior.
- `POST` permanece fora das leituras autorizadas. Sem qualquer alteração operacional ou reclassificação automática.

## Testes
`scopedBiDataQuality.test.ts` cobre 404 antes de catálogo, cinco categorias, SQL em counts e linhas, paginação, vínculo cruzado, histórico com ID oculto, escopo vazio, global, legado e ausência de binding central. `workstationAccess.test.ts` valida a exigência cumulativa de bi.read+history.read e método HEAD.

## Limites e implantação
O PR não muda cálculos do BI, ações em chamados, banco, Node-RED, GPIO, mini PC, HTTPS, certificados ou Workstations. A gestão central permanece **desativada na Evergreen**. Sua ativação exige terminar a matriz de permissões de escrita, cadastro de usuários, gestão de dispositivos, integração industrial e homologação.
