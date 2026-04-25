
# Andon Web Industrial — Plano de Implementação (Frontend)

## 1. Resumo do produto

Sistema ANDON industrial para chão de fábrica, executado em navegador Chromium/Edge em modo kiosk numa VM Windows Server 2016. Permite que operadores abram, atendam e finalizem chamados de manutenção e produção em 13 máquinas, registrando tempos e histórico. Funciona 100% offline no navegador, sem login, sem backend, sem cloud. Toda a persistência é feita em LocalStorage. A arquitetura é desenhada para que, no futuro, a camada de dados local seja substituída por uma API Node.js + SQLite, alimentada também por Node-RED para status real das máquinas.

Princípio central: `MachineStatus` (running/stopped) e `AndonStatus` (none/open/in_progress/finished) são independentes. O ANDON pode estar ativo mesmo com a máquina rodando.

## 2. Arquitetura frontend recomendada

- **Stack**: React + TypeScript + Vite + Tailwind + shadcn/ui (já presentes no projeto).
- **Roteamento**: TanStack Router (já configurado no template), com rotas em `src/routes/`.
- **Estado global**: React Context + `useReducer` para o domínio ANDON (chamados, máquinas, eventos de parada). Sem Redux nesta fase.
- **Camada de dados (Repository pattern)**: interface `AndonRepository` com implementação `LocalStorageRepository`. No futuro, basta criar `ApiRepository` consumindo a API Node.js — nenhum componente muda.
- **Persistência**: LocalStorage com versionamento de schema (`schemaVersion`) para permitir migrações.
- **Tempo real**: relógio e cálculo de tempos correntes via `setInterval` em hook `useTicker(1000)`.
- **Áudio**: módulo `soundService` que carrega arquivos locais em `src/assets/sounds/`, com `unlockAudio()` chamado pelo botão "INICIAR PAINEL / ATIVAR SONS".
- **Tema**: design tokens no `src/styles.css` com paleta Evergreen (verde principal, branco, cinza, vermelho alerta, amarelo atenção, azul/cinza escuro para em atendimento). Fonte grande, alto contraste.
- **Modo kiosk**: layout 16:9 fluido, botões grandes (mín. 64px de altura), zero dependência de teclado.

## 3. Estrutura de pastas

```text
src/
  assets/
    sounds/
      eletrica.mp3
      mecanica.mp3
      hot-melt.mp3
      qualidade.mp3
      lideranca.mp3
  components/
    ui/                      (shadcn — já existe)
    layout/
      KioskShell.tsx
      TopBar.tsx
      Clock.tsx
    machine/
      MachineCard.tsx
      MachineStatusBadge.tsx
      AndonStatusBadge.tsx
      MachineSummary.tsx
    call/
      OpenCallDialog.tsx
      CallTypePicker.tsx
      TechnicianPicker.tsx
      CallTimers.tsx
      CallActionsBar.tsx
      ActiveCallRow.tsx
    history/
      HistoryTable.tsx
      HistoryFilters.tsx
      ExportCsvButton.tsx
    settings/
      SimulationPanel.tsx
      SoundSettingsPanel.tsx
      DataBackupPanel.tsx
      AlertSettingsPanel.tsx
    common/
      BigButton.tsx
      ConfirmDialog.tsx
      EmptyState.tsx
      UnlockAudioButton.tsx
  context/
    AndonProvider.tsx
    andonReducer.ts
    andonActions.ts
  hooks/
    useAndon.ts
    useTicker.ts
    useMachineCalls.ts
    useCurrentCall.ts
    useStopHistory.ts
    useSound.ts
  services/
    repository/
      AndonRepository.ts          (interface)
      LocalStorageRepository.ts   (implementação atual)
      repositoryFactory.ts        (escolhe implementação)
    sound/
      soundService.ts
      soundMap.ts
    time/
      timeUtils.ts                (diffMinutes, formatHHMMSS)
    csv/
      csvExporter.ts
  domain/
    types.ts
    constants.ts                  (MACHINES, CALL_TYPES, TECHNICIANS)
    rules.ts                      (cálculo de tempos, validações)
  routes/
    __root.tsx
    index.tsx                     (DashboardPage)
    machines.$machineId.tsx       (MachineDetailPage)
    active-calls.tsx              (ActiveCallsPage)
    history.tsx                   (HistoryPage)
    settings.tsx                  (SettingsPage)
  styles.css
```

## 4. Lista de páginas

1. **DashboardPage** (`/`) — grid de cards das 13 máquinas, relógio, resumo (chamados abertos, em atendimento, máquinas paradas), botão "INICIAR PAINEL / ATIVAR SONS", links para Chamados Ativos, Histórico e Configurações. Clique no card → MachineDetailPage.
2. **MachineDetailPage** (`/machines/:machineId`) — apenas a máquina selecionada: status da máquina, status do ANDON, chamado atual com timers ao vivo, parada atual, histórico de paradas dessa máquina, botões abrir/atender/finalizar ANDON, botões simulação parar/voltar a rodar, botão VOLTAR AO PAINEL.
3. **ActiveCallsPage** (`/active-calls`) — lista de chamados `open` e `in_progress`, com ações atender e finalizar.
4. **HistoryPage** (`/history`) — tabela de chamados `finished` com filtros (tipo, categoria, máquina, intervalo de datas) e exportar CSV.
5. **SettingsPage** (`/settings`) — abas: Simulação, Sons, Backup de dados (exportar/importar JSON, limpar), Alertas (limites de tempo para destacar em vermelho).

## 5. Lista de componentes

- Layout: `KioskShell`, `TopBar`, `Clock`, `UnlockAudioButton`.
- Máquina: `MachineCard`, `MachineStatusBadge`, `AndonStatusBadge`, `MachineSummary`.
- Chamado: `OpenCallDialog`, `CallTypePicker`, `TechnicianPicker` (lista filtrada por subtipo), `CallTimers` (ao vivo), `CallActionsBar`, `ActiveCallRow`.
- Histórico: `HistoryTable`, `HistoryFilters`, `ExportCsvButton`.
- Configurações: `SimulationPanel`, `SoundSettingsPanel`, `DataBackupPanel`, `AlertSettingsPanel`.
- Comuns: `BigButton`, `ConfirmDialog`, `EmptyState`.

## 6. Lista de tipos TypeScript

```ts
type MachineStatus = "running" | "stopped";
type AndonStatus = "none" | "open" | "in_progress" | "finished";
type CallCategory = "maintenance" | "production";
type MaintenanceSubtype = "electrical" | "mechanical" | "hot_melt";
type ProductionSubtype = "quality" | "leadership";
type CallSubtype = MaintenanceSubtype | ProductionSubtype;

interface Machine {
  id: string;            // "17", "10", ...
  label: string;         // "Máquina 17"
  status: MachineStatus;
  currentCallId: string | null;
  currentStopId: string | null;
}

interface Technician {
  id: string;
  name: string;
  subtype: MaintenanceSubtype;
}

interface AndonCall {
  id: string;
  machineId: string;
  category: CallCategory;
  subtype: CallSubtype;
  status: AndonStatus;          // open | in_progress | finished
  technicianId: string | null;
  note: string | null;
  openedAt: string;             // ISO
  attendedAt: string | null;
  finishedAt: string | null;
  // Calculados ao finalizar:
  callWaitingMinutes: number | null;
  attendanceMinutes: number | null;
  totalCallMinutes: number | null;
  machineStoppedMinutes: number | null;
}

interface StopEvent {
  id: string;
  machineId: string;
  stoppedAt: string;
  resumedAt: string | null;
  durationMinutes: number | null;
  relatedCallId: string | null;
}

interface AndonState {
  schemaVersion: number;
  machines: Record<string, Machine>;
  calls: Record<string, AndonCall>;
  stops: Record<string, StopEvent>;
  settings: {
    soundsEnabled: boolean;
    waitingAlertMinutes: number;
    attendanceAlertMinutes: number;
  };
}
```

## 7. Lista de serviços

- **`AndonRepository`** (interface): `loadState()`, `saveState(state)`, `exportJson()`, `importJson(json)`, `clear()`.
- **`LocalStorageRepository`**: implementação atual; chave `andon.web.industrial.v1`.
- **`repositoryFactory`**: retorna a implementação ativa (hoje sempre LocalStorage). Futuro: lê variável de ambiente para escolher `ApiRepository`.
- **`soundService`**: `unlockAudio()`, `play(subtype)`, `stop(subtype)`, `setEnabled(bool)`. Mapa subtipo→arquivo em `soundMap.ts`.
- **`timeUtils`**: `diffMinutes(a, b)`, `nowIso()`, `formatHHMMSS(ms)`.
- **`csvExporter`**: gera CSV de `AndonCall[]` finalizados com cabeçalho em português.
- **`rules`**: `computeCallTimes(call, stops)`, `requiresTechnician(category)`, `techniciansFor(subtype)`.

## 8. Regras de estado e fluxo

- Estado único em `AndonProvider` via `useReducer`. Toda mutação passa por uma action e dispara `repository.saveState(state)`.
- **Abrir ANDON**: cria `AndonCall { status: "open", openedAt: now }`, vincula `machine.currentCallId`, toca som do subtipo (loop curto até atender). Não altera `MachineStatus` automaticamente.
- **Atender**: muda para `in_progress`, define `attendedAt`, para o som.
- **Finalizar**: para Manutenção exige `technicianId`; para Produção é opcional. Define `finishedAt`, calcula `callWaitingMinutes`, `attendanceMinutes`, `totalCallMinutes`. `machineStoppedMinutes` = soma das durações de `StopEvent` da máquina cujo intervalo intersecta `[openedAt, finishedAt]`. Limpa `machine.currentCallId`.
- **Mudança de MachineStatus** (manual nesta fase, futuro Node-RED):
  - running → stopped: cria `StopEvent { stoppedAt: now }`, vincula `machine.currentStopId`, associa ao chamado ativo se houver.
  - stopped → running: fecha `StopEvent` com `resumedAt`, calcula `durationMinutes`, exibe como "última parada".
- Timers ao vivo derivados de `useTicker(1000)` + `openedAt/attendedAt/stoppedAt`. Nada de salvar tempos a cada segundo.
- Alertas visuais: card pisca/destaca em vermelho quando `waitingAlertMinutes` ou `attendanceAlertMinutes` são ultrapassados (configurável).
- `TechnicianPicker` filtra automaticamente por `subtype` selecionado.

## 9. Regras de LocalStorage

- Chave única: `andon.web.industrial.v1` contendo `AndonState` serializado.
- `schemaVersion: 1` no estado; migrações futuras em `migrations/` aplicadas no `loadState()`.
- Save é debounced (~250ms) para evitar I/O excessivo.
- Tratamento robusto: se o JSON estiver corrompido, o app inicia com estado padrão (máquinas iniciais 17, 10, 12, 32, 9, 11, 37, 15, 38, 36, 22, 21, 31, todas `running`/`none`) e mostra aviso na tela.
- `DataBackupPanel` permite exportar JSON (download), importar JSON (upload) e limpar (com confirmação dupla).
- Nenhum dado sensível é armazenado.

## 10. Pontos de atenção (sem backend / sem cloud / sem auth)

- **Não** instalar Supabase, Firebase, Lovable Cloud, nem qualquer SDK de auth.
- **Não** criar rotas de API, server functions, loaders com `createServerFn`, nem endpoints `/api/*`.
- **Não** adicionar telas de login, registro ou perfil.
- Toda lógica roda no cliente. Os componentes consomem apenas `AndonRepository`, nunca `fetch` direto. Quando a API existir, basta trocar a implementação do repositório.
- Sons devem ser arquivos locais em `src/assets/sounds/` (importados como URL), nunca CDN.
- Build deve funcionar offline; nenhuma fonte externa obrigatória (usar fontes do sistema ou self-hosted).
- A camada `services/repository` é o único ponto que fala com armazenamento — nenhum componente acessa `localStorage` diretamente.

## 11. Dúvidas e riscos antes de gerar a interface

1. **Som em loop**: o som do chamado deve repetir até alguém atender, ou tocar uma única vez? Em kiosk de fábrica costuma ser loop com intervalo (ex: a cada 10s). Confirmar.
2. **Parada automática ao abrir ANDON**: a especificação diz que ANDON e MachineStatus são independentes, mas em muitas fábricas abrir ANDON de Manutenção marca a máquina como parada automaticamente. Manter 100% manual nesta fase?
3. **Múltiplos chamados simultâneos por máquina**: permitido um único chamado ativo por máquina por vez, ou pode haver mais de um (ex: Elétrica + Qualidade ao mesmo tempo)? Proposta: **um por máquina** para simplificar.
4. **Manutentor obrigatório em Produção**: confirmado que é opcional. Algum campo de "responsável" em chamados de Produção (ex: nome do líder) seria útil?
5. **Limites de alerta padrão**: sugerir 5 min para aguardando atendimento e 15 min para em atendimento? Configurável depois.
6. **Limpeza de histórico**: deve haver limite (ex: últimos 90 dias) ou guardar tudo em LocalStorage até o operador limpar manualmente? LocalStorage tem limite ~5MB.
7. **Arquivos de som**: ainda não existem em `src/assets/sounds/`. Você fornecerá os MP3 ou geramos placeholders sintetizados (beeps distintos por tipo) até receber os definitivos?
8. **Identidade Evergreen**: existe um guia de marca / tonalidades exatas de verde? Caso contrário, proponho `#2E7D32` (verde primário), `#FBC02D` (amarelo atenção), `#C62828` (vermelho alerta), `#37474F` (azul/cinza em atendimento).
9. **Resolução do kiosk**: 1920×1080 como alvo principal? Precisa também funcionar em 1366×768?
10. **Idioma dos rótulos do CSV exportado**: cabeçalho em português conforme a UI, certo?

Aguardando sua aprovação (ou ajustes) para iniciar a implementação. Após aprovado, criarei a estrutura, telas, contexto, repositório LocalStorage e componentes shadcn já estilizados na paleta Evergreen.
