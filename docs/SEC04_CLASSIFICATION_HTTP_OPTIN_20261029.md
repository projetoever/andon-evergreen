# SEC-04/2C — classificação com mutação central HTTP controlada

Data: 29/10/2026. Roadmap #232, integra protótipo transacional #266 validado em PostgreSQL no #267.

## O que fica implementado
- Apenas `POST /api/failure-classifications` e `PATCH /api/failure-classifications/:id` podem usar a sessão central, **somente** se `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED=1` estiverem explicitamente definidos.
- Requer HTTPS, Origin exata, estação registrada/ativa, cookie HttpOnly central, token anti-CSRF, `andon.read`, `catalog.classifications.manage` e escopo global de máquinas.
- Um marcador por objeto de requisição liga o guard central ao guard de Admin e ao handler. Falta de qualquer hook não permite acesso. A transação revalida a sessão e as permissões sob locks, escreve domínio e auditoria no mesmo commit.
- Retorna 403 para todas as demais escritas centrais, inclusive chamados, ajustes globais e edição de Prioridades. No modo legado, mantém os fluxos anteriores.
- CI exercita o endpoint registrado com PostgreSQL `/andon_test`, casos sem sessão/CSRF, guarda desligada e criação/edição com auditoria. Exercita o adaptador com duas conexões e rollback de auditoria.

## Restrições para implantação
A chave `ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED` não deve ser ativada em fábrica enquanto a equipe não homologar a interface central de escrita, o fallback administrativo e os outros 9 itens. A migração de senhas legadas e as demais operações de escrita permanecem fora deste PR.

Nenhum deploy ou alteração industrial. Esta etapa é um **subconjunto fechado** de escrita operacional: não representa conclusão da autenticação central para ANDON inteiro.
