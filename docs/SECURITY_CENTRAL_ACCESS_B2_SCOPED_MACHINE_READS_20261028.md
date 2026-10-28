# SEC-03/B2 — Consultas de máquinas com filtro por usuário

Data: 28/10/2026
Situação: implementação isolada, sem ativação central em produção.

## Problema resolvido

Na fundação do acesso central, sessões com escopo restrito de máquinas eram
negadas para qualquer rota operacional. Isso impedia colaboradores de consultar
somente as máquinas atribuídas a eles. Liberar as consultas sem filtro no
banco seria um risco de exposição entre áreas.

## O que mudou

- `GET /api/machines`: para usuários centrais com escopo restrito, aplica
  `id IN (máquinas autorizadas)` na própria consulta PostgreSQL, combinado
  com a opção `includeInactive` e preservando a seleção dos eventos
  de produção referentes somente às máquinas permitidas.
- `GET /api/machines/:id`: a máquina fora do escopo recebe a mesma resposta
  404 de uma máquina inexistente. Nenhum dado é buscado antes dessa validação.
- A autorização já existente continua exigindo HTTPS, origem autorizada,
  sessão válida, workstation ativa e acesso ao módulo operacional.
- O principal de acesso é vinculado internamente à requisição após as
  verificações do servidor (WeakMap). Não existe campo de cliente com
  permissão de determinar o escopo.
- Contexto de usuário ausente no modo central falha fechado; acesso completo
  validado permanece sem filtro; integrações com identidade técnica seguem
  as regras próprias de serviço.
- Outras consultas com escopo restrito continuam negadas até terem filtros
  equivalentes, inclusive chamados, histórico, BI e Prioridades.
- Mutação sob login central segue bloqueada.

## Testes

- Somente as rotas GET listadas podem passar pelo novo caminho de escopo.
- Ausência de contexto validado retorna falha, inclusive com modo central.
- Usuário com máquinas selecionadas recebe exclusivamente esses IDs.
- Escopo vazio nunca amplia para todas as máquinas.
- Sessão que exige troca de senha não pode ser vinculada.
- Modo legado sem central habilitado mantém comportamento anterior.
- CI completo de autenticação, PostgreSQL, Node-RED e frontend sem alterações.

## Fora do escopo

- Não ativa `ANDON_CENTRAL_ACCESS_ENABLED` nem faz migrações.
- Não habilita permissões de escrita ou tratamento de OS.
- Não modifica usuários, credenciais, certificados ou configurações fabris.
- Não altera Node-RED, mini PC, GPIO, Máquina 37 ou servidor Evergreen.

## Próxima etapa

B2.2: filtros seguros para `/api/andon-calls`, histórico, Prioridades e BI,
incluindo agregações de indicadores; B3: escrita com regras de domínio,
identidade individual e auditoria. A ativação central no ambiente fabril
requer homologação industrial e plano de retorno.
