# Tarefa 1 — evidência da especificação

Data: 26/10/2026. Base: `main` em `64e0a82dde433e4c2d332cced968f2e621b78bab`.
Branch de trabalho: `docs/access-bi-spec-20261026`.

Entregável: [especificação de acessos, estações e motivos](../architecture/access-workstations-call-reasons-20261026.md).

## Escopo realizado

- `git fetch origin main` confirmou a base oficial; o trabalho documental está em branch própria.
- Leitura de `AGENTS.md`, schema Prisma, autenticação/autorização, rotas de estações/categorias/chamados, auditoria existente e cálculo/consulta dos indicadores.
- Conferência das dependências entre especialidade, habilitação técnica, unicidade de chamado ativo e intervalos físicos/causais.
- Consulta a fontes primárias OWASP, NIST e Vorne, listadas na especificação.
- Matriz de permissões, regras de login/kiosk, contratos, arquivamento, política analítica, migração e casos de aceite definidos para implementação.
- Revisão aritmética dos exemplos: setup de 30/480 min → disponibilidade 93,75%; setup de 30 min e falha independente de 20 min em 480 min → 89,58%, MTBF 430 min e MTTR 20 min; duas pessoas por 30 min → 60 pessoa-minuto, sem duplicação física.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm run build` no frontend | Aprovado; build de produção cliente/servidor concluído |
| `npm run build` em `server/` | Aprovado; TypeScript compilado |
| `npm run lint` | Reprovado na base atual: 2.551 erros e 19 avisos; 2.547 erros indicados como corrigíveis automaticamente. Não houve alteração de código nesta tarefa nem reformatação geral |
| Comparação com `origin/main` | Alteração restrita aos dois documentos desta tarefa; nenhum arquivo de aplicação/schema/instalador modificado |
| Referências locais e consistência documental | Arquivos referenciados conferidos; exemplos numéricos recalculados; diff verificado |

O lint não está aprovado. A contagem acima corresponde à base atual consultada e não deve ser substituída pela contagem de bases anteriores. Os builds não demonstram que as funcionalidades planejadas já existam ou funcionem.

## Não executado nesta tarefa

Não houve implementação, migration, acesso ao banco produtivo, seed/reset, mudança de configuração, teste de novos fluxos em API, teste de carga ou validação física em celular. A especificação não pode ser homologada como funcionalidade entregue. Testes funcionais e migrations pertencem às respectivas tarefas de implementação; a alteração atual é documental.

Nenhum merge, deploy ou atualização do piloto foi realizado por esta tarefa. A `main` ainda não contém estas funcionalidades. Antes da próxima tarefa, o solicitante ajustará o modelo conforme combinado.
