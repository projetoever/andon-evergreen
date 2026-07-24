# ANDON Web Industrial

> Gestão visual, resposta rápida e rastreabilidade para o chão de fábrica.

O **ANDON Web Industrial** é uma plataforma local para conectar operação, manutenção e liderança em torno do mesmo fluxo de atendimento. O sistema transforma ocorrências de máquina em chamados rastreáveis, acompanha a atuação técnica em tempo real e preserva o histórico necessário para análise, melhoria contínua e tomada de decisão.

A solução foi desenhada para ambientes industriais que precisam de implantação controlada, funcionamento na rede interna e domínio sobre seus próprios dados — sem depender de uma nuvem externa para a operação diária.

## Estado oficial

| Item | Estado |
|---|---|
| Produto | ANDON Web Industrial |
| Release atual | `1.0.0-pilot.2` |
| Canal | Piloto |
| Branch oficial | `main` |
| Baseline auditada | `b1c100edf5593d4ae0dba4f53d8607e94dd8d5c1` |
| Frontend produtivo | Modo API obrigatório |
| Backend | Fastify + Prisma |
| Banco de dados | PostgreSQL |
| Implantação do piloto | Windows, com banco em Docker |
| Operação normal | Local e independente de internet após a instalação |
| Próxima release | `1.0.0-pilot.3` — planejada |

Esta página descreve apenas funcionalidades comprovadas na `main`. Recursos futuros são identificados explicitamente como planejados.

## Por que o ANDON

O valor do sistema está em tornar o problema visível, organizar a resposta e transformar cada atendimento em informação útil.

- **Para a operação:** abertura simples de chamados, visão clara do estado das máquinas e acompanhamento do atendimento.
- **Para a manutenção:** fila organizada, registro de mantenedores, sessões técnicas, histórico do ativo e confirmação precisa da localização da falha.
- **Para a liderança:** tempos rastreáveis, visão das ocorrências, retornos de manutenção, histórico consolidado e base confiável para indicadores.
- **Para a empresa:** implantação local, dados sob controle, operação em rede, atualização administrada e arquitetura preparada para expansão.

## Funcionalidades entregues na `1.0.0-pilot.2`

### Gestão visual e operação

- painel geral de máquinas;
- tela individual por máquina;
- estados independentes de máquina e chamado;
- modos de produção programada e não programada;
- abertura de chamados por categoria, subtipo e criticidade;
- acompanhamento visual do ciclo completo;
- histórico operacional por máquina.

### Atendimento e manutenção

- início e acompanhamento do atendimento;
- seleção de múltiplos técnicos;
- sessões individuais de mantenedores;
- registro de tempos de espera, atendimento, pós-manutenção e duração total;
- conclusão técnica e validação pós-manutenção;
- retorno do chamado à manutenção;
- contagem de retornos;
- finalização e cancelamento auditáveis.

### Hierarquia técnica dos ativos

O modelo oficial organiza os ativos em três níveis:

```text
Máquina
└── Conjunto ou módulo
    └── Subconjunto ou equipamento
```

Conjuntos e subconjuntos possuem códigos, tipos, descrições e estado de ativação. O histórico utiliza referências e snapshots para preservar a informação registrada no momento do chamado.

### Confirmação da localização

A `pilot.2` adiciona uma etapa auditável de confirmação da localização técnica antes do encerramento:

1. a localização informada na abertura permanece preservada;
2. a manutenção confirma ou corrige conjunto e subconjunto;
3. uma alteração registra responsável, data, hora e justificativa;
4. chamados antigos continuam compatíveis por meio da localização original.

Essa separação evita que uma correção posterior apague o contexto original da ocorrência.

### Testes automáticos isolados

O health check pode criar um chamado técnico marcado como `isSystemTest = true`. Esse registro:

- não substitui o estado operacional real da máquina;
- não ocupa o chamado atual;
- não interfere no fluxo produtivo;
- permanece identificado no histórico como **Teste automático**;
- é excluído dos indicadores operacionais comuns.

## Arquitetura

```mermaid
flowchart TD
    K["Terminais e kiosk"] --> F["Frontend React/Vite"]
    F --> A["API Fastify"]
    A --> P["Prisma ORM"]
    P --> D["PostgreSQL"]
    I["Instalador e runtime Windows"] --> F
    I --> A
    I --> D
```

### Componentes principais

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Router | interface operacional, painel, cadastros, históricos e indicadores |
| API | Node.js, Fastify, TypeScript | regras de negócio, validações e contratos HTTP |
| Dados | PostgreSQL, Prisma | persistência centralizada, migrations e relacionamentos |
| Implantação | PowerShell, tarefas agendadas e Docker | instalação, inicialização, atualização, reparação e banco do piloto |
| Operação | Google Chrome em modo kiosk | exibição dedicada no servidor ou em terminal remoto |

Em builds de produção, o frontend opera obrigatoriamente pela API. O modo LocalStorage permanece disponível somente para desenvolvimento e não é utilizado como fonte produtiva.

## Fluxo do chamado

```mermaid
flowchart LR
    A["Chamado aberto"] --> B["Em atendimento"]
    B --> C["Manutenção concluída"]
    C --> D{"Operação valida?"}
    D -->|Sim| E["Finalizado"]
    D -->|Não| B
```

Durante o fluxo, o sistema registra contexto da máquina, localização do ativo, responsáveis, sessões, tempos e mudanças relevantes para auditoria.

## Instalação Windows

O método oficial utiliza o launcher:

```text
ABRIR_MENU_ANDON.bat
```

Diretório padrão do produto:

```text
C:\web-andon-industrial
```

Repositório local esperado:

```text
C:\web-andon-industrial\andon
```

O launcher:

1. verifica privilégios administrativos;
2. solicita elevação quando necessário;
3. valida o instalador oficial dentro do repositório;
4. sincroniza somente os scripts PowerShell com o instalador externo;
5. interrompe o processo se a sincronização falhar;
6. abre o menu operacional atualizado.

### Capacidades do menu

- instalação limpa com PostgreSQL local recomendado;
- atualização pela `main`, preservando banco e configurações;
- reparação da instalação;
- início e parada temporária do ANDON;
- verificação de saúde;
- recriação e controle das tarefas automáticas;
- configuração de IP, rede e PostgreSQL;
- desinstalação preservando o banco;
- desinstalação limpa.

> **Atenção:** instalação limpa, atualização, reparação, desinstalação e restauração são procedimentos diferentes. Faça backup antes de mudanças e não execute instalação limpa sobre um ambiente produtivo existente.

As opções de instalação, atualização e reparação precisam de internet. Depois de instalado, o ANDON opera localmente sem depender de acesso externo.

## Endereços e portas

Valores padrão da release:

| Serviço | Endereço local | Porta |
|---|---|---:|
| Frontend | `http://127.0.0.1:8080` | `8080` |
| API | `http://127.0.0.1:3001` | `3001` |
| PostgreSQL do piloto | `127.0.0.1` | `5432` |

Em clientes da rede:

```text
http://IP-DO-SERVIDOR:8080
```

As portas podem ser configuradas. O instalador mantém regras de firewall para frontend e API de acordo com os valores definidos no ambiente.

### Readiness e health check

```text
GET /health
GET /health/db
GET /api/machines?includeInactive=true
```

O teste completo verifica serviços, banco, leitura da API e um ciclo de escrita isolado da operação.

## Modo kiosk

O servidor pode abrir o Google Chrome em modo kiosk com perfil próprio e tarefas automáticas. Um terminal Windows remoto também pode acessar o frontend pela rede, desde que servidor, API, firewall e CORS estejam configurados corretamente.

O terminal remoto:

- não hospeda o banco;
- não utiliza LocalStorage como fonte produtiva;
- depende da disponibilidade do servidor e da rede interna.

O cliente Raspberry Pi ainda não possui evidência suficiente para ser declarado como entregue.

## Desenvolvimento

### Pré-requisitos

- Node.js e npm;
- PostgreSQL acessível ou Docker;
- Git;
- variáveis de ambiente configuradas para frontend e servidor.

### Frontend

```bash
npm install
npm run dev
npm run build
npm run lint
```

### Backend

```bash
cd server
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

O reset e o seed do banco são operações destrutivas ou de inicialização. Não os execute em ambiente produtivo sem procedimento aprovado e backup válido.

### Variáveis principais

Frontend:

```dotenv
VITE_ANDON_DATA_MODE=api
VITE_ANDON_API_BASE_URL=http://localhost:3001
```

Servidor:

```dotenv
PORT=3001
HOST=0.0.0.0
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/BANCO?schema=public"
CORS_ORIGINS="http://localhost:8080"
```

Credenciais produtivas não devem ser versionadas.

## Estrutura do repositório

```text
.
├── src/                    # frontend e domínio da interface
├── server/                 # API Fastify, Prisma e migrations
├── installer/              # instalação e administração Windows
├── install-tools/          # ferramentas auxiliares de instalação
├── scripts/                # runtime, kiosk e rotinas operacionais
├── docker-compose.yml      # PostgreSQL do ambiente Docker
├── release-manifest.json   # estado oficial da release
└── ABRIR_MENU_ANDON.bat    # launcher oficial
```

## Dados, backup e atualização

- PostgreSQL é a fonte produtiva de dados.
- Migrations devem ser aplicadas pelo fluxo controlado.
- Backup é obrigatório antes de implantação ou atualização.
- Atualizações usam `fetch`, checkout da `main` e `pull --ff-only`.
- A sincronização atualiza o instalador externo e as ferramentas operacionais.
- Desinstalar preservando o banco é diferente de executar uma limpeza total.

## Limites atuais

A `1.0.0-pilot.2` não declara como entregues:

- autenticação centralizada;
- gestão corporativa de usuários;
- perfis de instalação;
- instalador e watchdog próprios para Raspberry Pi;
- integração produtiva com Node-RED, MQTT, ESP32, sensores ou CLP;
- manutenção preditiva e análises industriais avançadas.

## Roadmap

### `1.0.0-pilot.3` — planejada

Evolução aprovada para implementação:

- perfis de instalação;
- seed modular;
- maior separação entre produto genérico e configuração de cada implantação;
- compatibilidade controlada com instalações existentes.

Os perfis ainda não estão implementados na `main`. Não existe um “Perfil Evergreen” oficial no instalador atual.

### Evoluções posteriores

- documentação e cliente dedicado para Raspberry Pi;
- integrações com Node-RED e MQTT;
- comunicação com ESP32, sensores e CLPs;
- autenticação centralizada e gestão de usuários;
- indicadores e análises industriais avançadas;
- manutenção preventiva e preditiva.

## Governança da release

A fonte de verdade segue esta ordem:

1. commit oficial da `main`;
2. código e migrations;
3. `release-manifest.json`;
4. evidência do ambiente instalado;
5. documentação controlada.

Quando uma instrução antiga contradiz a release atual, prevalecem o código, o manifesto e a evidência validada.

## Posicionamento do produto

O ANDON Web Industrial combina implantação local, interface voltada ao chão de fábrica e rastreabilidade do atendimento técnico. Sua arquitetura permite começar com o fluxo essencial de Andon e evoluir de forma controlada para uma plataforma industrial mais ampla, mantendo os dados, a operação e as decisões sob domínio da empresa.

---

**ANDON Web Industrial** — visibilidade para agir, histórico para melhorar.
