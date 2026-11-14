# REFINE 20 — HIST-12 | CSV da página com contexto histórico e proteção de planilhas

**Base analisada:** main `b1605f5b4b22824a23144ba57ae4f83639d2a948` (PR #547), 14/11/2026.  
**Referências:** issue #479 (Histórico Global), #480 (backlog), HIST-11 (criticidade SQL).
**Escopo:** frontend read-only e testes de regressão. Nenhum endpoint, grant, banco, KPI, estação, instalação ou CLP alterado.

## Alterações
- CSV mantém o limite atual de **somente os até 25 chamados da página já autorizada**. Não equivale à exportação de todo o filtro.
- Além do conteúdo anterior, acrescenta **Última movimentação**, **Criticidade** e **Natureza do chamado**, nesta ordem e com cabeçalhos PT/EN/ZH pelo catálogo de tradução existente.
- Natureza é extraída do snapshot imutável (`callReasonSnapshot.nature`). Dados antigos sem snapshot permanecem **em branco**; não presumir corretiva nem transformar valor ausente em zero.
- Reforça neutralização de CSV formula injection quando prefixos perigosos (`= + - @`) vêm depois de espaços, BOM, caracteres bidirecionais e zero-width. Não remove o texto auditável: acrescenta apóstrofo literal ao início do campo, depois escapa as aspas.
- Mantém origem real/teste, OS, IDs, máquinas e equipe existentes; exportação preserva vírgulas/aspas, separador ponto e vírgula e UTF-8 BOM.

## Testes adicionados
- `tests/globalHistorySummaryCsv.test.ts`: campos e cabeçalhos extras alinhados; snapshots; dois técnicos; caso legado; neutralização de prefixos com caracteres invisíveis e CR.
- Mantém cobertura HIST-05/HIST-11 e renderização da página.

## Limites e gates
- **Não** cria exportação geral nem PDF, relatório em lote, acesso ampliado, efeito sobre KPIs ou auditoria de download no servidor.
- A auditoria **server-side do ato de exportar** continua pendente para etapa dedicada, que deverá conferir sessão/workstation/grants e filtrar em SQL na mesma requisição de exportação. Não descrever a exportação desta PR como auditada pelo backend.
- Antes de merge: revisão do diff, CI Node 22/Windows PowerShell 5.1, frontend build/typecheck, testes de Histórico Global, backend/PostgreSQL já previstos na pipeline, SSR; sem implantação.
- Notebook oficial deve ser atualizado **somente pelo operador**, após integração verificada e backup. Não tocar servidor industrial/HML/Node-RED/GPIO/CLP.
