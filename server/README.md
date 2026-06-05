# Backend ANDON futuro

Esta pasta reserva a estrutura para uma futura API Node.js local do Sistema ANDON.

## Escopo desta etapa

- Não há backend funcional nesta tarefa.
- Não há conexão com PostgreSQL.
- Não há autenticação, cloud, Supabase ou Firebase.
- O frontend continua usando o modo local com LocalStorage.

## Direção futura

A arquitetura prevista é:

```text
Kiosks Raspberry / Chromium
↓
Frontend ANDON Web
↓ HTTP ou WebSocket
API Node.js local
↓
PostgreSQL
↓
Node-RED / máquinas / relatórios / ordens de serviço
```

Os kiosks Raspberry não devem acessar o PostgreSQL diretamente. Quando o backend for implementado, somente a API Node.js local deverá ler e gravar no banco.
