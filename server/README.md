# ANDON API local

Backend Node.js local do Sistema ANDON. Nesta etapa a API contém apenas rotas de saúde e a fundação PostgreSQL/Prisma; o frontend continua usando LocalStorage e não consome a API.

## Requisitos

- Node.js
- npm
- Docker com Docker Compose

## Configuração

Copie o arquivo de ambiente de exemplo:

```bash
cp .env.example .env
```

Variáveis principais:

```dotenv
PORT=3001
HOST=0.0.0.0
DATABASE_URL="postgresql://andon:andon_dev_password@localhost:5432/andon_db?schema=public"
```

## PostgreSQL com Docker

Na raiz do repositório, suba o PostgreSQL local:

```bash
docker compose up -d
```

O serviço usa:

- usuário: `andon`
- senha: `andon_dev_password`
- banco: `andon_db`
- porta local: `5432`
- volume persistente: `andon_postgres_data`

Para parar o container sem remover o volume:

```bash
docker compose down
```

## Instalação

Dentro de `server/`:

```bash
npm install
```

## Prisma

Gerar o Prisma Client:

```bash
npm run db:generate
```

Criar/aplicar a migration inicial:

```bash
npm run db:migrate
```

Executar o seed inicial:

```bash
npm run db:seed
```

Abrir o Prisma Studio:

```bash
npm run db:studio
```

Resetar o banco local e executar seed novamente:

```bash
npm run db:reset
```

## Seed inicial

O seed cria:

- máquinas: 17, 10, 12, 32, 9, 11, 37, 15 e 38;
- turnos: Manhã, Tarde, Noite e Comercial;
- classificações: Falha real da máquina, Falha operacional, Simulação manual, Ajuste e Teste.

## Desenvolvimento

Dentro de `server/`:

```bash
npm run dev
```

Rotas disponíveis:

- `GET http://localhost:3001/health` — saúde da API, não depende do banco;
- `GET http://localhost:3001/health/db` — testa conexão com PostgreSQL.

`GET /health` deve continuar retornando `status: "ok"` mesmo quando o PostgreSQL não estiver rodando. `GET /health/db` retorna `connected: true` quando o banco estiver disponível e `connected: false` quando estiver indisponível.

## Build

Dentro de `server/`:

```bash
npm run build
```
