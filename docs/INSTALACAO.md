# Instalação do Andon Web Industrial

Este documento descreve os caminhos de instalação e execução do Andon Web Industrial.

---

## Instalação em desenvolvimento

Pré-requisitos:

- Node.js;
- npm;
- Git.

Comandos:

git clone https://github.com/projetoever/andon-evergreen.git
cd andon-evergreen
npm install
npm run dev

Acesso:

http://localhost:5173

---

## Gerar build

npm run build

---

## Visualizar build local

npm run preview

Acesso padrão:

http://localhost:4173

---

## Execução em modo produção local

A versão de produto deverá ser executada preferencialmente via Docker Compose.

Fluxo previsto:

docker compose up -d --build

Acesso:

http://localhost:8080

Ou pela rede:

http://IP-DO-SERVIDOR:8080

---

## Modo kiosk

Microsoft Edge:

msedge --kiosk http://localhost:8080 --edge-kiosk-type=fullscreen

Google Chrome:

chrome --kiosk http://localhost:8080

---

## Instalação futura via instalador

A versão futura deverá possuir um instalador Windows:

AndonEvergreenSetup.exe

O instalador deverá:

- Criar a pasta C:\AndonEvergreen;
- Copiar arquivos do sistema;
- Criar configurações iniciais;
- Validar Docker;
- Subir containers;
- Criar atalhos;
- Abrir o painel Andon.

---

## Estrutura prevista

C:\AndonEvergreen
C:\AndonEvergreen\config
C:\AndonEvergreen\data
C:\AndonEvergreen\backups
C:\AndonEvergreen\logs
C:\AndonEvergreen\scripts
C:\AndonEvergreen\docker-compose.yml

---

## Backup e restore

A versão com PostgreSQL deverá possuir scripts próprios para backup e restauração:

- backup.bat;
- restore.bat.

Enquanto a versão local estiver disponível, backups podem ser feitos pela própria interface do sistema, quando aplicável.
