# UX-08 — Identidade do cliente no Hub e nos PDFs do BI (29/10/2026)

## Resumo
Produto continua identificado como **ANDON WEB INDUSTRIAL**. O nome do cliente e a unidade/planta são campos configuráveis, separados da identidade do software e persistidos no PostgreSQL. O piloto existente recebe, de forma aditiva, os valores iniciais **Evergreen** e unidade vazia.

## Implementação
- Migration `20261029150000_hub_client_identity`: dois campos `VARCHAR(100)` com defaults em `system_settings`; não toca dados de chamados nem tabelas operacionais.
- `GET /api/system-settings` retorna `clientName` e `clientUnit`. `PATCH /api/system-settings` já exige **Admin legado** pelo hook de autorização; valida nome com 2–100 caracteres, unidade opcional até 100, sem caracteres de controle e com trim. Nenhuma permissão operacional é alterada.
- Administração do Hub → Visão geral: card **Empresa e unidade**, carregamento independente, botão recarregar, campos editáveis, bloqueio durante gravação, validação, aviso de alterações pendentes e mensagens de sucesso/erro. Outras seções do Hub permanecem inalteradas.
- Entrada do Hub mostra nome configurado da empresa e unidade, deixando a marca **ANDON WEB INDUSTRIAL** neutra. Em indisponibilidade de leitura, mostra a identidade padrão do piloto sem bloquear navegação.
- Em **Exportar PDF** do ANDON BI, a identidade é lida **na geração do relatório**, junto com as fontes dos KPIs, e incluída no cabeçalho das três páginas do A4. Escapa HTML e mantém cálculos/metodologias invariantes. Falha na leitura da identidade impede exportar um relatório identificado incorretamente.
- PT/EN/ZH tradicional, desktop e mobile.

## Testes
- Teste de compatibilidade Prisma/schema e migration aditiva.
- Segurança de `PATCH /api/system-settings`, validação e UI de Admin.
- HTML do PDF com cliente/unidade contendo `<script>` e `&`, mantendo três páginas sem injeção.
- Playwright com alteração de unidade na Administração, salvamento, atualização e responsividade.
- CI padrão: Prisma migrations, backend, testes UI, exportação PDF, PostgreSQL isolado, HTTPS e instalador Windows.

## Homologação e limites
Não habilita a gestão central de escrita, não elimina senhas legadas e não prova o funcionamento no notebook/servidor industrial antes do deploy autorizado. Nenhuma alteração ao nó Node-RED/GPIO, certificados, M37, dados reais ou KPIs. Não migrar banco de produção até backup, aprovação e plano de rollback da entrega global.

## Próximas pendências
UX-09 presença real heartbeat/user/IP, SEC-04 autorização central de todas as mutações, validação do MTTR/MTBF real, auditoria do problema de workstation e teste integrado notebook/servidor após o fechamento do pacote.
