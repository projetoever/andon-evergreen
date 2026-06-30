# Andon Web Industrial

Sistema ANDON industrial para chão de fábrica, desenvolvido para monitoramento visual de máquinas, abertura de chamados, acompanhamento de manutenção, histórico operacional e evolução para integração com banco de dados, API local e automação industrial.

O projeto nasceu como uma aplicação frontend local para validação rápida do fluxo operacional, mas está sendo evoluído para uma plataforma industrial completa, instalável em ambiente local da empresa, com arquitetura preparada para PostgreSQL, API Node.js, Docker Compose, modo kiosk e futuras integrações com Node-RED, MQTT, ESP32, Raspberry Pi e CLP.

---

## Objetivo do projeto

O objetivo do Andon Web Industrial é fornecer uma solução simples, visual e eficiente para o chão de fábrica, permitindo que produção, liderança e manutenção tenham visão clara do status das máquinas, chamados abertos, tempos de atendimento e histórico de ocorrências.

A plataforma busca reduzir o tempo de resposta da manutenção, melhorar a comunicação entre áreas, registrar dados operacionais e criar uma base para indicadores industriais.

---

## Estado atual do projeto

A versão atual consolida a base funcional do painel Andon, incluindo:

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

A arquitetura do projeto está sendo organizada em camadas:

```txt
Frontend React/Vite
        ↓
API Node.js
        ↓
PostgreSQL
        ↓
Docker Compose / Instalador Local
