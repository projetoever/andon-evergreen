# Andon Web Industrial

Sistema ANDON industrial para chão de fábrica, desenvolvido para monitoramento visual de máquinas, abertura de chamados, acompanhamento de manutenção, histórico operacional e evolução para integração com banco de dados, API local e automação industrial.

O projeto nasceu como uma aplicação frontend local para validação rápida do fluxo operacional, mas está sendo evoluído para uma plataforma industrial completa, instalável em ambiente local da empresa, com arquitetura preparada para PostgreSQL, API Node.js, Docker Compose, modo kiosk e futuras integrações com Node-RED, MQTT, ESP32, Raspberry Pi e CLP.

---

## Objetivo do projeto

O objetivo do Andon Web Industrial é fornecer uma solução simples, visual e eficiente para o chão de fábrica, permitindo que produção, liderança e manutenção tenham visão clara do status das máquinas, chamados abertos, tempos de atendimento e histórico de ocorrências.

A plataforma busca reduzir o tempo de resposta da manutenção, melhorar a comunicação entre áreas, registrar dados operacionais e criar uma base para indicadores industriais.

---

## Estado atual do projeto

A versão atual consolida a base funcional do painel Andon e a arquitetura está sendo preparada para operação completa com API, PostgreSQL, Docker Compose e instalador Windows.

Funcionalidades já consideradas no escopo atual:

- Painel geral de máquinas;
- Tela individual por máquina;
- Status independente da máquina e do chamado Andon;
- Abertura de chamados;
- Atendimento de manutenção;
- Criticidade do chamado;
- Produção programada e não programada;
- Acompanhamento pós-manutenção;
- Histórico de eventos;
- Relatórios e indicadores em evolução;
- Preparação para persistência via API;
- Preparação para PostgreSQL;
- Operação em navegador Chromium/Edge em modo kiosk;
- Base para empacotamento via Docker Compose;
- Planejamento de instalador Windows.

---

## Arquitetura atual e evolução

A arquitetura do produto está sendo organizada em camadas:

Frontend React/Vite
API Node.js
PostgreSQL
Docker Compose / Instalador Local

A versão inicial do frontend utilizava LocalStorage para validação rápida. A evolução atual do produto considera a persistência centralizada em banco de dados PostgreSQL, com comunicação por API Node.js.

---

## Stack principal

- React;
- TypeScript;
- Vite;
- Tailwind CSS;
- shadcn/ui;
- TanStack Router;
- Node.js;
- PostgreSQL;
- Prisma;
- Docker Compose;
- Futuro suporte a Node-RED, MQTT, ESP32, Raspberry Pi e CLP.

---

## Conceitos principais

- MachineStatus representa o estado da máquina: rodando ou parada;
- AndonStatus representa o estado do chamado: sem chamado, aberto, em atendimento ou finalizado;
- O status da máquina e o status do chamado são independentes;
- Um chamado Andon pode estar ativo mesmo com a máquina em funcionamento;
- Cada máquina possui sua própria tela individual;
- A tela da máquina concentra operação, manutenção, histórico e indicadores;
- A arquitetura foi preparada para evoluir de persistência local para API e banco de dados.

---

## Funcionalidades principais

- Painel visual de máquinas;
- Tela detalhada por máquina;
- Chamados Andon por área;
- Criticidade baixa, média e alta;
- Atendimento de manutenção;
- Seleção de múltiplos técnicos;
- Acompanhamento pós-manutenção;
- Botão para voltar à manutenção;
- Contagem de retornos de manutenção;
- Produção programada e não programada;
- Histórico de chamados;
- Registro de tempos;
- Relatórios por máquina;
- Preparação para indicadores de eficiência;
- Preparação para integração industrial.

---

## Modo kiosk

O sistema foi pensado para uso em ambiente fabril, podendo ser executado em Chromium ou Microsoft Edge em modo kiosk.

Exemplo com Microsoft Edge:

msedge --kiosk http://localhost:8080 --edge-kiosk-type=fullscreen

Ou em outro terminal da rede:

http://IP-DO-SERVIDOR:8080

---

## Modo de dados do frontend

O frontend mantém suporte ao modo local, mas está preparado para operar com API.

Exemplo de configuração para API:

VITE_ANDON_DATA_MODE=api
VITE_ANDON_API_BASE_URL=http://localhost:3001

Variáveis:

- VITE_ANDON_DATA_MODE=api ativa o modo API;
- VITE_ANDON_API_BASE_URL define o endereço da API;
- Se não configurado, o frontend pode operar em modo local conforme configuração da versão.

---

## Comandos principais

Instalar dependências:

npm install

Rodar em desenvolvimento:

npm run dev

Gerar build:

npm run build

Visualizar build:

npm run preview

Executar lint:

npm run lint

Formatar código:

npm run format

---

## Documentação

A documentação principal está organizada em:

- docs/ESTADO_ATUAL.md
- docs/ARQUITETURA.md
- docs/ROADMAP.md
- docs/INSTALACAO.md

---

## Roadmap resumido

- v1.15 - Base funcional do Andon;
- v1.16 - Consolidação API Node.js + PostgreSQL;
- v1.17 - Docker Compose completo;
- v1.18 - Scripts de instalação, backup e atualização;
- v1.19 - Instalador Windows;
- v2.0 - Integração industrial com Node-RED, MQTT, sensores, ESP32 e CLP.

---

## Visão de produto

O Andon Web Industrial está sendo estruturado para se tornar uma solução local instalável para empresas industriais, com operação em rede interna, banco de dados local, API própria, backup, atualização controlada, modo kiosk e possibilidade de expansão para integrações industriais.

A proposta é transformar o sistema em uma plataforma replicável, adaptável por cliente e preparada para ambientes fabris de médio e grande porte.
