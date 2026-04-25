# AGENTS — Andon Web Industrial

## Regras principais

- **Não** criar backend nesta fase.
- **Não** usar banco de dados.
- **Não** usar Supabase, Firebase ou cloud.
- **Não** criar login/autenticação.
- Usar React + TypeScript + LocalStorage.
- Textos da interface em **português**.
- Código, variáveis, funções, tipos e componentes em **inglês**.
- Preservar separação entre `machineStatus` e `andonStatus`.
- Preservar tela individual por máquina (`/machines/:machineId`).
- Preparar para futura integração com Node.js API, SQLite e Node-RED.

## Convenções

- Componentes React: **PascalCase**
- Funções e variáveis: **camelCase**
- Constantes: **UPPER_SNAKE_CASE**
- Tipos/interfaces: **PascalCase**

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Estrutura

- `src/types/` — definições de domínio
- `src/constants/` — constantes (MACHINE_IDS, LOCAL_STORAGE_KEYS, alertas)
- `src/data/` — dados iniciais (máquinas, técnicos, tipos de chamado, sons)
- `src/services/` — camada de serviço (LocalStorage hoje, API amanhã)
- `src/utils/` — utilitários puros (datas, durações, status)
- `src/context/` — `AndonProvider` com o estado global
- `src/hooks/` — hooks reutilizáveis (useTicker, useDashboardSummary)
- `src/components/` — componentes por domínio (layout, machines, calls, history, settings, common)
- `src/pages/` — páginas
- `src/routes/` — rotas do TanStack Router

## Futuro

Para integrar com API Node.js, basta substituir as funções puras em
`src/services/andonService.ts` por chamadas HTTP, mantendo a mesma
assinatura. Os componentes consomem apenas o `AndonProvider`, que
encapsula a fonte de dados.
