# UX-05 — Estados distintos de carregamento, vazio e falha no Hub

Data: 28/10/2026. Plano #232, item original 9 (primeira entrega).

## Comportamento
- A página de entrada do Hub usa `ModuleAccessProvider.checking` para sinalizar verificação inicial e transições entre rotas. Enquanto a identidade/permissões estão sendo consultadas, apresenta três cards skeleton leves e acessíveis.
- Não mostra módulos antigos nem mensagem de "nenhum módulo" enquanto a confirmação de acesso da nova rota está pendente.
- Com resposta bem-sucedida, exibe os módulos autorizados ou a mensagem realmente vazia quando não houver nenhum.
- Se a consulta à API falhar, mostra a causa e o botão **Verificar novamente**; o skeleton não encobre erro verdadeiro.
- Compatível com prefers-reduced-motion (`motion-reduce:animate-none`), desktop e mobile, e traduções PT/EN/ZH tradicional.
- Atualizações periódicas de sessão não provocam o skeleton novamente se o caminho não mudou, evitando piscar a tela a cada 30 segundos.
- Não altera middleware, APIs, tokens, máquinas, consulta de indicadores ou autorização. Sem deploy e sem ativar a gestão central no servidor industrial.

## Testes
`tests/browser/hubAdminNavigation.mjs`: atrasar propositalmente a resposta da API de módulos e confirmar que durante esse intervalo o usuário recebe o estado de carregamento, nunca uma falsa tela sem módulos. As verificações anteriores de autenticação e entrada administrativa continuam.
