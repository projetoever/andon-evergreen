# PENTE 6 — Identificação da Máquina: Cabeçalho Responsivo

Data: 25/11/2026. Baseline `main@f18dcf6cb089f597f2573a0979ecc15b85a3e647`.

## Diagnóstico

Captura fornecida: no detalhe da máquina, o grid definia `lg:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]`, comprimindo ID e nome numa coluna com apenas 8rem, principalmente em desktop; `machine.name` era texto pequeno de uma linha com `truncate`, ao passo que `machine.id` recebia destaque visual principal.

## Ajuste pontual

- Nome comercial/cadastrado (`machine.name`) ganha destaque como `h1` com fonte responsiva; fallback para `machine.id` quando o nome vier vazio.
- Permite duas linhas legíveis em nomes longos (`line-clamp-2`, `break-words`, `overflow-wrap:anywhere`); tooltip `title` e nome acessível completo.
- ID sempre visível como identificação secundária, inclusive IDs longos (`break-all`).
- No desktop, grid flexível (`xl:grid-cols-[minmax(0,1fr)_auto]`) separa identificação da área de comandos; até XL, as duas áreas são empilhadas, sem perder acesso.
- Status da máquina, atendimento e produção ocupam segunda linha independente, sem roubar largura do nome.
- Botões, callbacks, rotas e regras de acesso não foram alterados. Tela fixada mantém restrição ao botão Voltar/Hub de acordo com a regra existente.
- Não houve mudança de banco, API, BI, estatísticas, credenciais, tempos, grupos, atendimento, som ou regras industriais.

## Aceite no notebook

1. Máquina com nome curto; nome vazio (fallback para ID) e ID curto; nome entre 30 e 80 caracteres; nome de mais de 100 caracteres, com palavra sem espaços; nome com caracteres chineses.
2. Testar 1920x1080, 1366x768, 1024x768, 768x1024 e 390x844. Sem sobreposição com relógio, histórico, som, bloqueio ou status; nenhuma barra de rolagem horizontal.
3. Nome completo permanece acessível por title / leitor de tela; duas linhas visíveis no máximo.
4. Confirmar permissões de histórico, botão Voltar quando tela não fixada, bloqueio/desbloqueio, status e som; nenhuma operação mudou.
5. Executar `npm run typecheck`, `npm --prefix server run test:ui`, lint/build e demais gates do CI.

## Governança

Branch: `pente/06-identificacao-maquina-responsiva-20261125`. Merge na `main` expressamente autorizado pelo responsável nesta conversa para teste no notebook. Somente integrar após CI verde. Homologação visual real ainda depende do notebook; não enviar ao servidor industrial.
