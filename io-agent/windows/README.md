# ANDON I/O Agent — Windows (experimental)

## Objetivo

Criar uma camada local e isolada entre o ANDON Web Industrial e as portas GPIO do mini-PC Inovattio.

O agente não acessa o banco diretamente. Ele consome a API do ANDON e controla o hardware local via PawnIO/PawnIOLib.

## Regra de prioridade — espelhar o som do ANDON

O frontend atual do ANDON seleciona para áudio somente chamados:
- não marcados como `isSystemTest`;
- com `status === "open"`;
- de máquina ativa;
- com som habilitado.

Entre os elegíveis, ordena por `openedAt` decrescente e escolhe apenas o mais recente.

Portanto o agente físico deve usar a mesma regra global:

```text
mais recente OPEN = único canal audível ativo
```

Exemplo:

```text
08:00 Elétrica OPEN       -> CH1 HIGH
08:05 Hot Melt OPEN       -> CH1 LOW, CH3 HIGH
08:10 Hot Melt ATENDIDO   -> CH3 LOW, CH1 HIGH
08:15 Elétrica ATENDIDO   -> CH1 LOW
```

Nunca deve haver dois canais físicos HIGH ao mesmo tempo.

Se dois chamados OPEN forem do mesmo subtipo, o canal permanece HIGH. Quando o mais recente for atendido, continua HIGH enquanto existir outro OPEN do mesmo subtipo.

## Máquina de estados recomendada

A cada ciclo de polling:

1. buscar `GET /api/andon-calls?status=open&limit=100`;
2. descartar `isSystemTest=true`;
3. ordenar por `openedAt DESC`;
4. escolher o primeiro chamado como `priorityCall`;
5. resolver `priorityCall.subtype -> channel`;
6. se o canal mudou:
   - colocar o canal anterior em LOW;
   - aguardar um pequeno dead-time configurável;
   - colocar somente o novo canal em HIGH;
7. se não houver chamado OPEN: colocar todos os canais em LOW;
8. se o chamado prioritário deixar de estar OPEN, recalcular e restaurar o próximo mais recente automaticamente.

Não usar uma saída independente por subtipo. A saída física é exclusiva e derivada do único `priorityCall`.

## Arquitetura

```text
ANDON API
    |
    v
Priority Resolver
latest OPEN by openedAt
    |
    v
ANDON I/O Agent
    |
    | sessão PawnIO persistente
    v
ITE IT8786F
    |
    v
somente 1 GPO HIGH
    |
    v
interfaces isoladas
    |
    v
Schneider Harmony CH1..CH8
```

## Hardware validado

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
10. ao trocar de canal, garantir LOW no anterior antes do HIGH no próximo;
11. ao encerrar/falhar de hardware, forçar todas as saídas conhecidas para LOW.

Não reentrar no Super I/O a cada mudança de chamado.

## Mapeamento lógico inicial da sirene

- CH1: Elétrica — subtype `electrical`
- CH2: Mecânica — subtype `mechanical`
- CH3: Hot Melt — subtype `hot_melt`
- demais canais: definir posteriormente

Até o mapeamento físico dos demais GPOs ser validado, somente CH1/GPO1 pode ser energizado em modo real.

Em `dryRun`, o resolvedor de prioridade pode simular CH1/CH2/CH3 mesmo sem hardware para validar preempção e retorno.

## Chamado prioritário sem GPO mapeado

Em modo real, se o chamado mais recente apontar para um canal ainda não mapeado, o agente deve:
- colocar todas as saídas conhecidas em LOW;
- registrar aviso claro;
- não manter tocando um chamado mais antigo de outro setor, porque isso representaria o setor errado.

## Segurança elétrica

O GPIO não alimenta a sirene.

A sirene deve possuir fonte própria 12/24 Vcc e os GPOs devem comandar interfaces isoladas. O contato isolado fecha o canal remoto da sirene contra o COM correspondente.

Nenhuma carga deve ser conectada diretamente ao GPO do mini-PC.
