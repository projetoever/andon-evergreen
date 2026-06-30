# Arquitetura do Andon Web Industrial

Este documento descreve a arquitetura planejada e em evolução do Andon Web Industrial.

---

## Visão arquitetural

A arquitetura do produto é baseada em uma solução local, instalada em ambiente interno da empresa.

Fluxo principal:

Usuário / Operador / Manutenção
Frontend Web
API Node.js
PostgreSQL

Fluxo futuro com integração industrial:

Máquina / Sensor / CLP / ESP32
MQTT / Node-RED
API Andon
PostgreSQL
Painel Web

---

## Camadas do sistema

### 1. Frontend

Responsável pela interface visual do sistema.

Tecnologias:

- React;
- TypeScript;
- Vite;
- Tailwind CSS;
- shadcn/ui;
- TanStack Router.

Funções:

- Exibir painel de máquinas;
- Exibir tela individual por máquina;
- Permitir abertura de chamados;
- Exibir atendimento de manutenção;
- Exibir histórico;
- Exibir relatórios;
- Operar em modo kiosk.

### 2. Backend/API

Responsável pela regra de negócio e comunicação com o banco.

Tecnologias previstas:

- Node.js;
- TypeScript;
- Fastify ou Express;
- Prisma;
- Zod;
- PostgreSQL.

Funções:

- Gerenciar máquinas;
- Gerenciar chamados;
- Registrar eventos;
- Controlar atendimento;
- Controlar produção programada;
- Gerar relatórios;
- Centralizar regras;
- Servir dados ao frontend;
- Preparar integrações externas.

### 3. Banco de dados

Banco principal previsto:

- PostgreSQL.

Entidades principais:

- Machines;
- AndonCalls;
- AttendanceEvents;
- Technicians;
- ProductionModes;
- ProductionHistory;
- Shifts;
- Users;
- AuditLogs;
- SystemSettings.

### 4. Docker Compose

O Docker Compose será usado para empacotar os serviços principais:

- Frontend;
- API;
- PostgreSQL;
- Node-RED opcional;
- MQTT opcional.

Objetivos:

- Padronizar instalação;
- Reduzir configuração manual;
- Facilitar atualização;
- Facilitar backup;
- Permitir replicação para outros ambientes.

### 5. Instalador Windows

O instalador Windows será uma camada de entrega para simplificar a instalação.

Funções previstas:

- Criar pasta local do sistema;
- Copiar arquivos;
- Validar Docker;
- Criar arquivo de configuração;
- Subir containers;
- Criar atalhos;
- Configurar inicialização;
- Abrir painel Andon.

---

## Portas sugeridas

- 8080 - Frontend Web;
- 3001 - API Node.js;
- 5432 - PostgreSQL;
- 1880 - Node-RED futuro;
- 1883 - MQTT futuro.

---

## Modelo de implantação

### Servidor local

Instalado em VM, servidor físico, mini PC ou máquina dedicada.

Responsável por:

- API;
- Banco;
- Frontend;
- Backup;
- Integrações.

### Terminais de operação

Acessam o servidor via navegador ou aplicativo kiosk.

Exemplo:

http://IP-DO-SERVIDOR:8080

---

## Princípio da arquitetura

O Andon deve ser:

- Local;
- Robusto;
- Simples de instalar;
- Adaptável por cliente;
- Preparado para integração industrial;
- Independente de cloud obrigatória;
- Escalável para múltiplas máquinas, linhas e setores.
