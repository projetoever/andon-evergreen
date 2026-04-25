# Andon Web Industrial

Sistema ANDON industrial para chão de fábrica, executado em navegador
Chromium/Edge em modo kiosk numa VM Windows Server 2016.

## Fase atual

**Somente frontend.** Sem backend, sem banco de dados, sem autenticação,
sem Supabase, sem Firebase, sem cloud. Toda a persistência é feita em
LocalStorage do navegador.

## Stack

React + TypeScript + Vite + Tailwind v4 + shadcn/ui + TanStack Router.

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Conceito

- `MachineStatus` (running/stopped) e `AndonStatus` (none/open/in_progress/finished)
  são **independentes**. Um ANDON pode estar ativo mesmo com a máquina rodando.
- Cada máquina tem sua própria tela individual em `/machines/:machineId`.
- Camada de serviço (`src/services/`) isolada para futura troca de
  LocalStorage por API Node.js + SQLite + Node-RED.

## Sons

Coloque os arquivos em `src/assets/sounds/`:

- `eletrica.mp3`
- `mecanica.mp3`
- `hot-melt.mp3`
- `qualidade.mp3`
- `lideranca.mp3`

Se algum arquivo estiver ausente, o sistema continua funcionando — apenas
não toca o som correspondente. O botão "INICIAR PAINEL / ATIVAR SONS" é
necessário para liberar o autoplay no navegador.

## Persistência

Dados ficam em `localStorage` sob a chave `andonWebIndustrial.*`.
Use a tela **Configurações → Backup** para exportar/importar JSON ou CSV.
