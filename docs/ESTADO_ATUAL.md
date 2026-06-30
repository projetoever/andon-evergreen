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
