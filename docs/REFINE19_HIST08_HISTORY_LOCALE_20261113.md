# REFINE 19 — HIST-08 | Localização dos horários no Histórico Global

Data: 13/11/2026.

## Diagnóstico
O Histórico Global já possuía dados autorizados, filtros por horário e painel completo com totais e CSV, mas seus quatro componentes visuais ainda fixavam `pt-BR` na formatação:
- Lista e resumo selecionado da tela `GlobalCallHistoryPage`;
- Detalhamento (timeline e durações);
- Painel de indicadores numéricos;
- Exportação CSV da página visível.

Assim, trocar a interface PT/EN/ZH não alterava as representações locais desses dados.

## Implementação
Todos os componentes passam a usar `getInterfaceLocale()` já consolidado em `src/i18n/language.ts` (pt-BR, en-US, zh-TW). Não modifica instantes UTC, ordenação do histórico, filtros de horário, consultas de banco ou formato de protocolo API.

## Aceite
Trocar idioma com Histórico Global aberto: datas de abertura/finalização/timeline e números de totais devem refletir o idioma escolhido; CSV exportado deve usar o mesmo idioma da interface; horário continua no timezone local do terminal. Em caso de data inválida, UI segura informa indisponibilidade. Não alterar chamadas, KPI, schema, arquivos do servidor ou permissões. Executar CI Windows/Linux/PG e homologação desktop/mobile no notebook.
