# REFINE 19 — CFG-15D | Capacidades de Turnos e filtro por jornada

Data: 13/11/2026. Issue #477. Continuidade da CFG-15B e CFG-15C.

## Diagnóstico
A aba Turnos carregava turnos, preferência de filtro e duas flags de PATCH apenas na montagem. O aviso superior já atualiza capacidades após foco/eventos, mas o editor podia manter estado de escrita obsoleto.

## Implementação
Separar as consultas de dados de turno e filtro da consulta de capacidades. No acesso central, revalidar centralShiftUpdateEnabled e centralOperationalSettingsWriteEnabled no mount, evento SYSTEM_SETTINGS_CHANGED_EVENT e foco da janela. Durante a consulta, em erro ou resposta antiga: bloquear edição das duas funções sem perder drafts locais não salvos. Eventos do navegador não transmitem grants.

## Segurança / aceite
Mantidos todos os gates independentes de PATCH da API. Sem novas flags, sem criar turno no acesso central, sem alterações DB/API/ACL/PLC. Teste CFG-15D confirma revalidação, cancelamento de respostas antigas, cleanup dos listeners e preservação de rascunhos. CI Windows/PG/UI/SSR e homologação apenas no notebook oficial, quando disponível.
