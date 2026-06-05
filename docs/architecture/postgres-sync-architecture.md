# Arquitetura futura — Node.js API + PostgreSQL + kiosks Raspberry

## Objetivo

Preparar o Sistema ANDON Web Industrial para evoluir do modo frontend-only com LocalStorage para uma arquitetura local centralizada com API Node.js e PostgreSQL, sem alterar a experiência atual dos kiosks nem a regra de negócio existente.

## Arquitetura prevista

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

## Regras de integração

- Os Raspberrys/kiosks nunca devem acessar o PostgreSQL diretamente.
- O PostgreSQL deverá ser acessado apenas pela API Node.js local.
- O frontend deverá alternar futuramente entre modo `local` e modo `api`.
- O modo padrão permanece `local` nesta etapa.
- A API futura deve preservar a separação entre `machineStatus` e `andonStatus`.
- As telas atuais de dashboard, máquina, histórico e kiosk não são alteradas por esta preparação.

## Estrutura criada

- `src/config/dataMode.ts`: define o modo de dados (`local` ou `api`) e mantém `local` como padrão.
- `src/api/andonApiClient.ts`: reserva um cliente HTTP para a futura API Node.js local.
- `src/repositories/andonRepository.ts`: define o contrato de repositório do domínio ANDON.
- `src/repositories/localAndonRepository.ts`: adapta a lógica local atual e o LocalStorage para o contrato de repositório.
- `src/repositories/apiAndonRepository.ts`: reserva a implementação futura da API, ainda sem migração de regra de negócio.
- `server/`: reserva o espaço do backend futuro sem criar servidor funcional.

## Estado atual preservado

Nesta tarefa, o `AndonProvider` continua consumindo `src/services/andonService.ts` e persistindo em LocalStorage. A camada de repositório foi criada como preparação incremental, sem trocar a origem real dos dados e sem acoplar o frontend ao PostgreSQL.

## Próximos passos sugeridos

1. Definir contratos HTTP/WebSocket da API Node.js.
2. Criar schemas e migrações PostgreSQL no backend futuro.
3. Implementar persistência da API sem alterar os componentes React.
4. Introduzir uma seleção controlada entre `local` e `api` por ambiente.
5. Validar sincronização dos kiosks Raspberry em rede local dedicada.
