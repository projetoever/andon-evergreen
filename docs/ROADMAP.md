# Roadmap do Produto Andon

Este documento define a evolução planejada do Andon Web Industrial como produto instalável.

---

## v1.15 - Base funcional do Andon

Objetivo: consolidar a aplicação visual e funcional.

Itens:

- Painel geral de máquinas;
- Tela individual por máquina;
- Chamados Andon;
- Criticidade;
- Atendimento de manutenção;
- Histórico;
- Produção programada e não programada;
- Acompanhamento pós-manutenção;
- Retorno para manutenção;
- Múltiplos técnicos;
- Preparação para relatórios;
- Operação em navegador.

---

## v1.16 - API Node.js + PostgreSQL

Objetivo: substituir persistência local por persistência centralizada.

Itens:

- Criar backend Node.js;
- Criar estrutura Prisma;
- Criar banco PostgreSQL;
- Criar tabelas principais;
- Criar rotas de máquinas;
- Criar rotas de chamados;
- Criar rotas de histórico;
- Criar rotas de relatórios;
- Conectar frontend ao modo API.

---

## v1.17 - Docker Compose completo

Objetivo: empacotar o sistema completo.

Itens:

- Container do frontend;
- Container da API;
- Container PostgreSQL;
- Volumes persistentes;
- Arquivo .env;
- Healthcheck;
- Rede interna Docker;
- Comando único de subida.

---

## v1.18 - Scripts de operação

Objetivo: facilitar instalação e manutenção.

Itens:

- install.bat;
- start.bat;
- stop.bat;
- update.bat;
- backup.bat;
- restore.bat;
- open-kiosk.bat;
- documentação de instalação;
- documentação de backup.

---

## v1.19 - Instalador Windows

Objetivo: transformar o pacote técnico em produto instalável.

Itens:

- Setup.exe;
- Criação de pastas;
- Cópia de arquivos;
- Criação de atalhos;
- Validação do Docker;
- Inicialização dos serviços;
- Abertura do painel;
- Configuração inicial.

---

## v2.0 - Integração industrial

Objetivo: conectar o Andon ao chão de fábrica de forma automatizada.

Itens:

- Node-RED;
- MQTT;
- ESP32;
- Raspberry Pi;
- Integração com CLP;
- Sinais automáticos de máquina;
- Status automático;
- Alarmes;
- Dashboards industriais;
- Indicadores avançados.

---

## Visão futura

O Andon deverá evoluir para uma plataforma industrial completa, adaptável por cliente, com módulos de operação, manutenção, produção, liderança, indicadores e integração com dispositivos industriais.
