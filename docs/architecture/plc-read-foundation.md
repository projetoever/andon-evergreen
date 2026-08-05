# Fundação de integração PLC somente leitura

## Estado desta entrega

Esta entrega adiciona uma fundação opcional e isolada para futuras integrações industriais no ANDON Web Industrial.

Ela não representa comunicação produtiva com um CLP real. O runtime permanece desabilitado por padrão e utiliza somente um adaptador simulado quando explicitamente habilitado.

## Objetivos

- preparar uma arquitetura multimarcas;
- manter a API operacional sem CLP;
- isolar falhas entre máquinas e conexões;
- tratar timeout, health check, reconexão e shutdown;
- permitir desenvolvimento e testes sem hardware industrial;
- garantir que a primeira fase seja estritamente somente leitura.

## Fora do escopo

Nesta etapa não existem:

- biblioteca Mitsubishi;
- MC Protocol ou SLMP real;
- EtherNet/IP, OPC UA ou S7 real;
- escrita no CLP;
- acionamento de corneta ou saída física;
- abertura automática de chamado;
- alteração do estado da máquina pelo PLC;
- tabelas Prisma;
- painel administrativo;
- alteração do instalador.

## Arquitetura

```text
Fastify API
└── PlcRuntime
    └── PlcConnectionManager
        ├── PlcConnectionSupervisor — Máquina A
        │   └── PlcAdapter
        ├── PlcConnectionSupervisor — Máquina B
        │   └── PlcAdapter
        └── PlcConnectionSupervisor — Máquina N
            └── PlcAdapter
```

Cada conexão é supervisionada de forma independente. Uma falha, timeout ou indisponibilidade em uma máquina não deve interromper as demais nem derrubar a API.

A interface `PlcAdapter` não possui métodos de escrita. Os adaptadores futuros deverão implementar o mesmo contrato de leitura:

```text
PlcAdapter
├── MockPlcAdapter
├── MitsubishiMcSlmpAdapter     planejado
├── RockwellEtherNetIpAdapter   planejado
├── SiemensOpcUaAdapter         planejado
└── SiemensS7Adapter            planejado
```

## Hardware piloto identificado

O primeiro equipamento levantado na Evergreen é um Mitsubishi MELSEC iQ-R com CPU R08CPU e Ethernet integrada. O futuro adaptador Mitsubishi deverá avaliar MC Protocol/SLMP conforme a configuração real da CPU, portas abertas e mapa de dispositivos autorizado.

A identificação do hardware não habilita comunicação automaticamente. Ainda serão necessários:

- endereço IP da CPU;
- porta e modo de comunicação configurados no GX Works3;
- network number e station number, quando aplicáveis;
- mapa de dispositivos liberados para leitura;
- validação de rede entre servidor ANDON e VLAN industrial;
- teste controlado sem alteração da lógica existente.

## Configuração atual

```dotenv
PLC_INTEGRATION_ENABLED=false
PLC_ADAPTER=mock
PLC_MOCK_MACHINE_IDS=1,2
PLC_CONNECT_TIMEOUT_MS=3000
PLC_REQUEST_TIMEOUT_MS=2000
PLC_HEALTH_INTERVAL_MS=5000
PLC_RECONNECT_DELAY_MS=2000
PLC_MAX_RECONNECT_DELAY_MS=30000
```

Com `PLC_INTEGRATION_ENABLED=false`, nenhuma conexão é criada e a operação atual do ANDON permanece inalterada.

Se um adaptador ainda não instalado for informado, o runtime registra um aviso e mantém a API disponível sem tentar comunicação industrial.

## Diagnóstico

O endpoint abaixo apresenta somente diagnóstico operacional, sem expor endereços de rede ou credenciais:

```text
GET /health/plc
```

Estados possíveis do runtime:

- `disabled` — integração desligada;
- `not_configured` — habilitada, mas sem adaptador/conexões disponíveis;
- `ready` — todas as conexões configuradas estão conectadas;
- `degraded` — uma ou mais conexões não estão conectadas.

Estados possíveis por conexão:

- `disabled`;
- `idle`;
- `connecting`;
- `connected`;
- `reconnecting`;
- `disconnected`;
- `error`;
- `stopping`.

## Próximas entregas

1. validar esta fundação com build e testes automatizados;
2. definir persistência aditiva de configuração por máquina;
3. criar painel administrativo de comunicação PLC dentro do cadastro de máquinas;
4. selecionar e homologar uma biblioteca MC/SLMP;
5. implementar Mitsubishi somente leitura;
6. testar conectividade com a R08CPU em ambiente controlado;
7. mapear sinais normalizados de máquina;
8. somente depois avaliar eventos automáticos e comandos de saída.
