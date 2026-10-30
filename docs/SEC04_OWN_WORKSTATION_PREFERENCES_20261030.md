# SEC-04/2O — Preferências da própria workstation no modo central

Data: 30/10/2026. Continuação dos 11 ajustes. Não altera produção.

## Problema
A proteção central rejeita operações pessoais `PATCH /api/workstations/:id/screen-lock` e `PUT /api/workstations/:id/machine-sound/:machineId`, prejudicando o kiosk e suas preferências de tela e som. O comando `GET /api/workstations/:id/runtime-preferences` também precisa bloquear leitura da workstation alheia.

## Solução estritamente limitada
- Flag `ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED=1`, desligada por padrão; somente em conjunto com `ANDON_CENTRAL_ACCESS_ENABLED=1`.
- HTTPS, Origin exata, cookie central, anti-CSRF para ambas as escritas, workstation aprovada, módulo operacional permitido e `andon.read`. **A estação do URL deve coincidir com o ID vinculado à sessão autenticada**. O mesmo requisito vale no adaptador transacional.
- Fixar tela somente em máquina ativa do escopo autorizado, ou limpar a própria fixação com `machineId:null`; preferência de som somente por máquina do escopo ativo. Não conceder `workstations.manage` nem acesso a estações alheias.
- Locks em ordem usuário → própria estação → máquina (quando aplicável), revalidação da sessão e escopo após locks. Gravação e auditoria com ID do usuário, estação, máquina e valor anterior/novo na mesma transação. Reenvio sem mudança não duplica auditoria.
- Leitura de runtime preferences autenticada somente da própria estação. Nenhuma alteração às rotas legadas de gestão/admin ou ao mute global, que permanece separado.
- O cliente adiciona CSRF exclusivamente às duas mutações aprovadas.
- As duas rotas de escrita deixam o inventário de **não classificadas** (24→22), passando ao catálogo de planejamento com escopo explícito de workstation; o catálogo NÃO concede autorização.
- Não altera banco/schemas, flags da instalação, watchdog, GPIO/Node-RED ou Máquina 37.

## Teste obrigatório
`test:auth` cobre flag OFF, rota exata, estação alheia, módulo, escopo e CSRF. `test:access:integration` cobre PostgreSQL isolado `/andon_test` para estação alheia, máquina fora de escopo, cookie/CSRF, alterações válidas, leitura, idempotência, rollback de auditoria, revogação e flag OFF. Regressão completa Windows/HTTPS, backend/PG/frontend, compatibilidade de múltiplos técnicos.

## Entrega
Não fazer deploy nem habilitar em produção até homologação consolidada no notebook e aprovação específica. Funções globais de som/configuração e gestão de workstation precisam de políticas independentes; não confundir escolhas locais do terminal com autoridade administrativa.
