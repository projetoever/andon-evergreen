# ANDON API

Backend Node.js básico para a futura API local do ANDON Web Industrial.

Nesta etapa o servidor expõe apenas a rota de saúde e ainda não conecta PostgreSQL, não cria schema de banco e não altera a lógica do frontend.

## Requisitos

- Node.js 22+
- npm

## Configuração

Copie o arquivo de exemplo de ambiente, se quiser ajustar porta, host ou CORS:

```bash
cp .env.example .env
```

Variáveis disponíveis:

- `PORT`: porta HTTP do servidor. Padrão: `3001`.
- `HOST`: host de escuta. Padrão: `0.0.0.0` para permitir acesso na rede local.
- `CORS_ORIGIN`: origem permitida pelo CORS. Padrão: `*`.

## Instalação

```bash
npm install
```

## Scripts

```bash
npm run dev
npm run build
npm run start
```

- `npm run dev`: executa o servidor TypeScript em modo watch.
- `npm run build`: compila o backend para `dist/`.
- `npm run start`: executa o servidor compilado.

## Health check

Com o servidor em execução, acesse:

```bash
curl http://localhost:3001/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "service": "andon-api",
  "timestamp": "2026-06-05T00:00:00.000Z"
}
```
