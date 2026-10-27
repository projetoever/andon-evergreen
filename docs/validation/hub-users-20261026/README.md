# Etapa 3A — usuários e acessos

Interface de produção validada em HTTPS com API isolada e estado persistente durante o teste. O roteiro cobre listagem, pesquisa, cadastro, escopo e permissões explícitas, senha provisória exibida uma vez, edição, inativação, primeiro acesso, troca obrigatória, PT/EN/ZH e ausência de overflow horizontal.

- Desktop: [listagem 1366×768](./1366-list.png) e [cadastro 1366×768](./1366-create.png)
- Mobile: [listagem 390×844](./390-list.png) e [cadastro 390×844](./390-create.png)
- Resultado estruturado: [browser-results.json](./browser-results.json)

Os endpoints `/api/access/*` falham de forma segura sem TLS e sem `ANDON_ACCESS_ORIGIN` HTTPS exata. A ativação futura exige certificado confiável no frontend e na API; este PR não ativa a autenticação nas rotas operacionais atuais.

O CI executa o fluxo real em PostgreSQL 16 isolado com HTTPS: provisionamento, autorização administrativa, escopo, primeiro acesso, expiração, conflito otimista, reset, revogação, CSRF, bloqueio da workstation, auditoria e limite de tentativas. Nenhum banco da empresa foi acessado.
