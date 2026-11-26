# API do ANDON Web Industrial — guia técnico do repositório

**Atualização documental:** DOC 1 / 25-11-2026. **Status:** servidor implementado em Fastify/TypeScript, com persistência PostgreSQL e Prisma. A documentação legada que dizia “somente health” e “frontend em LocalStorage” não representa mais o código corrente. Consulte [Arquitetura](../docs/ARQUITETURA.md) e [Estado Atual](../docs/ESTADO_ATUAL.md).

## Escopo

A API centraliza máquinas, chamados, técnicos, grupos e catálogos, atendimento e histórico, prioridades, configuração, autenticação/permissões, workstations, analytics e auditoria. Seu ponto de entrada é `src/server.ts`; rotas em `src/routes/`, segurança em `src/access/`, consultas de BI em `src/analytics/`, esquema e migrações em `prisma/`.

**Modelo de segurança:** nenhuma permissão é concedida porque um botão aparece. Sessão, estação, escopo, recurso, CSRF e regras de transação são verificados pelos respectivos handlers. `src/access/centralActionRegistry.ts` documenta contratos de rota, mas declara expressamente que **não substitui a autorização em tempo de execução**.

## Pré-requisitos para desenvolvimento

- Node.js e npm compatíveis com o projeto; `release-manifest.json` fixa Node `22.23.2` para o runtime Windows do piloto.
- Uma instância **de desenvolvimento isolada** de PostgreSQL. A raiz contém `docker-compose.yml` com imagem `postgres:16-alpine`; isso não define a versão ou banco industrial.
- Arquivo `.env` local baseado em `.env.example`, sem commit de segredos, certificados, tokens, bancos ou senhas reais.

**Atenção:** `docker-compose.yml` e os exemplos históricos do repositório incluem credenciais demonstrativas. Nunca reutilizar esses valores em rede corporativa/fábrica, expor 5432 a redes não autorizadas ou colocar strings reais em documentação. Não rodar seeds/reset na base de produção.

## Comandos para a API em laboratório

Na pasta `server`:
```sh
npm ci
npm run db:generate
npm run build
npm run dev
```

Para o banco **isolado**, usar o procedimento da equipe de desenvolvimento e as credenciais de laboratório correspondentes. Alguns scripts do package incluem migrations, seeds e reset; executar esses comandos apenas quando a finalidade e a base forem conferidas. A aplicação do instalador oficial não deve ser substituída por `db:reset`, `seed` ou SQL manual no ambiente fabril.

## Saúde e testes

- `GET /health`: saúde do processo.
- `GET /health/db`: conectividade com PostgreSQL.
- O acesso a máquinas, chamados e analytics é protegido; um 401/403 sem autenticação válida pode ser comportamento **correto**, não falha do serviço.
- Grupos principais do `server/package.json`: `npm run test:auth`, `npm run test:analytics`, `npm run test:dashboard`, `npm run test:impact`, `npm run test:ui`. A CI do GitHub executa os gates definidos no workflow e inclui regressões Windows.

Um teste automatizado aprovado não confirma instalação física, compatibilidade com o browser do operador ou disponibilidade da rede industrial. Registrar SHA da API, frontend, banco isolado e os resultados de HML no [DOC 1](../docs/DOC1_HOMOLOGACAO_GUIADA_20261125.md).

## Guias

- [Arquitetura e fluxos](../docs/ARQUITETURA.md)
- [Autorização, módulos e principais famílias de rotas](../docs/DOC1_AUTORIZACAO_MODULOS_20261125.md)
- [Metodologia e integridade do BI](../docs/BI_METODOLOGIA_E_QUALIDADE.md)
- [Instalação e atualização controladas](../docs/INSTALACAO.md)
- [Matriz funcional do marco](../docs/DOC1_MATRIZ_FUNCIONAL_20261125.md)
