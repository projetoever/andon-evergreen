# ANDON I/O Agent — Windows (experimental)

## Objetivo

Criar uma camada local e isolada entre o ANDON Web Industrial e as portas GPIO do mini-PC Inovattio.

O agente não acessa o banco diretamente. O consumo inicial usa a API já existente do ANDON e o hardware local é acessado via PawnIO/PawnIOLib.

## Arquitetura

```text
ANDON API (rede local)
        |
        | HTTP
        v
ANDON I/O Agent (mini-PC Windows)
        |
        | sessão persistente PawnIO
        v
ITE IT8786F
        |
        v
GPO -> interface isolada -> entrada remota da sirene
```

## Hardware validado até agora

Equipamento investigado: mini-PC industrial Inovattio com Super I/O ITE IT8786F.

Mapeamento confirmado experimentalmente para o GPO1:

- Chip ID: `0x8786`
- GPIO LDN: `0x07`
- GPIO base: `0x0A00`
- GPO1 físico: grupo 4 / GP41
- porta de dados: `0x0A03`
- máscara: `0x02`
- LOW observado: byte `0xB8`, saída ~0 V
- HIGH observado: byte `0xBA`, saída ~4,9 V

GPO2..GPO7 ainda não estão mapeados e não devem ser presumidos.

## Estratégia de runtime

O runtime definitivo deve manter uma única sessão PawnIO aberta durante a execução do agente:

1. adquirir `Global\Access_ISABUS.HTP.Method`;
2. abrir PawnIO e carregar `LpcIO.bin`;
3. entrar no Super I/O;
4. validar IT8786F e GPIO base;
5. localizar/autorização do BAR uma única vez;
6. reselecionar LDN 07 e validar novamente;
7. sair do modo de configuração;
8. manter o handle PawnIO aberto;
9. realizar somente read-modify-write nos bits mapeados;
10. ao encerrar/falhar, forçar todas as saídas conhecidas para LOW.

Não reentrar no Super I/O a cada pulso.

## Integração inicial com ANDON

O MVP poderá usar a rota existente:

```text
GET /api/andon-calls?status=open&limit=100
```

O agente deve ignorar chamados `isSystemTest=true` e deduplicar por `call.id`.

Mapeamento inicial desejado para a sirene Schneider Harmony:

- CH1: Elétrica — subtype `electrical`
- CH2: Mecânica — subtype `mechanical`
- CH3: Hot Melt — subtype `hot_melt`
- demais canais: definir posteriormente

Até o mapeamento físico dos demais GPOs ser validado, somente CH1/GPO1 pode ser habilitado.

## Comportamento inicial recomendado

Modo operacional do MVP:

- enquanto existir pelo menos um chamado real com status `open` para o setor, a saída correspondente permanece HIGH;
- quando o chamado é atendido, o ANDON muda seu status para `in_progress`; quando não restar nenhum chamado `open` daquele setor, a saída volta para LOW;
- múltiplos chamados `open` do mesmo setor mantêm a saída HIGH até o último ser atendido;
- registros `isSystemTest=true` são ignorados;
- uma falha transitória da API não deve ser interpretada como atendimento: o agente mantém o último estado conhecido;
- encerramento do agente tenta colocar todas as saídas conhecidas em LOW;
- teste manual de hardware continua temporizado.

Este comportamento acompanha o tempo de espera do ANDON: sirene ativa durante a espera por atendimento e silenciada no início do atendimento.

## Segurança elétrica

O GPIO não alimenta a sirene.

A sirene deve possuir fonte própria 12/24 Vcc e os GPOs devem comandar interfaces isoladas (relé/optoacoplador/transistor adequado). O contato isolado fecha o canal remoto da sirene contra o COM correspondente.

Nenhuma carga deve ser conectada diretamente ao GPO do mini-PC.
