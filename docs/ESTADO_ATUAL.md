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


---

# 4. Criar ESTADO_ATUAL.md

Cole este bloco inteiro:

```powershell
@'
# Estado Atual do Projeto Andon

Este documento registra o estado atual do projeto Andon Web Industrial e serve como referência para desenvolvimento, apresentação e continuidade técnica.

---

## Visão geral

O Andon Web Industrial é uma aplicação para chão de fábrica voltada ao monitoramento de máquinas, abertura de chamados Andon, acompanhamento de manutenção, histórico de eventos e evolução para indicadores industriais.

O projeto começou como frontend local para validação rápida da operação, mas está sendo evoluído para uma plataforma completa com API, banco PostgreSQL, Docker Compose e instalador Windows.

---

## Estado funcional atual

O sistema possui como base:

- Painel geral de máquinas;
- Tela individual por máquina;
- Abertura de chamado Andon;
- Status de máquina;
- Status do chamado;
- Atendimento de manutenção;
- Criticidade do chamado;
- Histórico de eventos;
- Produção programada e não programada;
- Acompanhamento pós-manutenção;
- Retorno para manutenção;
- Seleção de múltiplos técnicos;
- Relatórios e indicadores em evolução;
- Suporte ao uso em modo kiosk.

---

## Decisões consolidadas

As principais decisões técnicas e de produto são:

- PostgreSQL será o banco principal da evolução do sistema;
- A aplicação deverá operar localmente na rede da empresa;
- O frontend será mantido como aplicação web;
- A API será responsável pelas regras de negócio e persistência;
- Docker Compose será usado para empacotamento dos serviços;
- O instalador Windows será criado por cima da estrutura Docker;
- O sistema deve ser adaptável para diferentes empresas, linhas e máquinas;
- A integração industrial futura deverá considerar Node-RED, MQTT, ESP32, Raspberry Pi e CLP.

---

## O que ainda está em evolução

- Consolidação do backend Node.js;
- Modelagem definitiva do banco PostgreSQL;
- Migração definitiva da persistência local para API;
- Docker Compose completo;
- Scripts de instalação;
- Backup e restore automatizados;
- Instalador Windows;
- Tela administrativa para configuração por cliente;
- Usuários e permissões;
- Integração industrial.

---

## Direção do produto

O objetivo é transformar o Andon em uma plataforma industrial instalável, capaz de ser entregue para empresas do porte da Evergreen e adaptada para diferentes ambientes fabris.

A entrega final deve incluir:

- Frontend web;
- Backend/API;
- PostgreSQL;
- Docker Compose;
- Scripts de instalação;
- Backup e restore;
- Modo kiosk;
- Painel administrativo;
- Documentação técnica;
- Instalador Windows;
- Integrações industriais futuras.
