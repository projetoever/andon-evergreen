# Tarefa 2 — fundação de acessos e auditoria

Base funcional: `main` após PR #208 (`0e6fd1d`). Esta entrega adiciona serviços internos e persistência. A conexão às telas, cookies HTTP, provisionamento, delegação, exportação e ativação central pertencem à tarefa 3. Não há alteração visual para validar nesta etapa.

## Implementado

- Migration aditiva: usuários, permissões, escopo de máquinas, sessões persistidas e auditoria. Sem seed ou redefinição do Admin existente.
- Sessões com segredo aleatório, apenas hash no banco, vínculo à estação, finalidade limitada de troca de senha, expiração absoluta/inatividade e revogação por versão.
- Senha provisória consumida atomicamente sob lock; primeiro acesso não recebe autorização normal. Troca de senha revoga sessões antigas; reset de terceiros exige Admin autenticado recentemente, motivo e nova provisória.
- Autorização interna por ação, módulo e máquina. Ações desconhecidas são negadas; consultas agregadas exigem escopo completo até a implementação de filtros seguros nos adaptadores.
- Hash scrypt versionado com custo explícito e fila limitada; preservação de verificação de hash legado; política de frases de acesso e prova CSRF para o futuro adaptador HTTP.
- Auditoria de sucesso na mesma transação das mutações de segurança; snapshots de identidade, filtragem recursiva de campos secretos e trigger contra UPDATE/DELETE/TRUNCATE ordinários.
- Registro de login negado. As demais negativas e eventos das rotas atuais serão conectados ao adaptador central na tarefa 3; esta entrega não afirma cobertura global retroativa.

## Verificações

- Geração Prisma e build backend aprovados.
- Build frontend aprovado; nenhum componente ou estilo modificado.
- Testes de autenticação existentes: 9/9 aprovados.
- Testes unitários da fundação: 5/5 aprovados.
- Lint geral: mesmos 2.551 erros e 19 avisos da base; arquivos novos formatados individualmente.
- Integração PostgreSQL adicionada ao CI: concorrência no uso único da provisória, sessão em outro client/processo, escopo, conta/estação bloqueadas, expiração/inatividade, reset/revogação, rollback da mutação quando auditoria falha e proteção dos eventos. Resultado do CI será registrado após a execução.

O ambiente local não permite instalar PostgreSQL por apt (restrição de troca de UID do contêiner). A validação real de migrations e integração é executada pelo serviço PostgreSQL isolado do CI; nenhum banco da empresa foi acessado. As fixtures têm trava para banco `andon_test` e não executam seed de produção.

## Limites de ativação

Os serviços novos não são chamados pelas rotas produtivas atuais. Isso permite entregar a fundação sem interromper kiosks ou alterar credenciais em uso. A tarefa 3 deve conectar os serviços, política de rotas, transporte HTTPS/cookies/CSRF, limites de tentativas por conta/origem, vínculos técnicos e provisionamento antes de permitir ativação central. A auditoria atual de diagnóstico é preservada; auditoria completa de todas as rotas é trabalho do adaptador, não efeito automático desta migration.

Sessões de kiosk persistentes, delegação, arquivamento, categorias e indicadores permanecem nas tarefas correspondentes. O trigger não protege contra um administrador do banco capaz de desabilitá-lo; cópia externa protegida e separação de privilégios permanecem necessárias.

Antes de atualizar uma instalação com essa migration, seguir o procedimento oficial de backup, geração Prisma, migrations e build. A aprovação/merge desta tarefa será solicitada separadamente; não confundir publicação de branch/PR com atualização da `main` ou do piloto.
