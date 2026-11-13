# REFINE 18 — HIST-07 | Filtro por horário na consulta global

Data: 13/11/2026. Isolado das mudanças de conta/ACL SEC-17B/SEC-18.

## Alterações
A tela `/history` já oferece filtros por máquina, status, categoria, motivo, período e classificação. Para o período `Data específica`, incluímos dois campos opcionais **Horário inicial** e **Horário final**, interpretados no fuso horário local do navegador da workstation.

- Nenhum horário: preserva a busca do dia inteiro.
- Somente horário inicial: daquele minuto até 00:00 seguinte.
- Somente horário final: da meia-noite até aquele minuto; 00:00 equivale ao dia inteiro.
- Início < fim: intervalo na data escolhida.
- Início > fim: turno noturno que termina na madrugada seguinte (ex.: 22:00 a 06:00).
- Mesma hora inicial e final preenchidas: formulário rejeita intervalo ambíguo, exibindo erro traduzido.
- Um período como últimos 7/30 dias não aplica silenciosamente horários ocultos do filtro de data específica.

## Segurança e integridade
Usa exclusivamente os parâmetros de intervalo ISO `openedFrom` e `openedBefore`, já validados pelo backend e combinados com o escopo autorizado no PostgreSQL **antes da contagem/paginação**; não cria nova API, query raw ou permissão.

Filtro aplicado somente ao clicar `Filtrar`. A validação acontece ANTES de alterar a consulta aplicada para evitar que data/hora inválida derrube o componente.

O painel de totais e o CSV da página respeitam as datas/horas autorizadas: a agregação usa os mesmos parâmetros sem paginação. Não envolve dados de fábrica, PLC, Node-RED nem flags.

## Aceite
- Testar 08:15–16:45 e turno noturno 22:00–06:00, mês/língua/fuso local.
- Validar horários inválidos e iguais.
- Revisar máquinas permitidas, histórico legado e totalização.
- CI Windows/Linux/PG/frontend/SSR, revisão manual no notebook oficial antes de liberar atualização.
