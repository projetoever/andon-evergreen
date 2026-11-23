# PENTE 3 — Histórico Global | Roteiro de homologação e entrega (23/11/2026)

Projeto: **ANDON Web Industrial — Ever Green**  
Issue: https://github.com/projetoever/andon-evergreen/issues/621  
Baseline anterior: `main@c9f5b745d019fccef26c7495354c6fb81808198e`  
**Status deste documento:** testes de código e preparação de homologação; a integração, instalação e aceite físico só podem ser registrados após evidência do SHA exato.

## 1. Entrega cumulativa e PRs
- Lote A: #622 — navegação de módulos autorizados, identidade explícita de /history e ausência de logout indevido. CI #1378 SUCCESS no SHA `9267255b847a281b0a6110b65aa17df7cf4e6ada`.
- Lote B: #623 — filtros recolhíveis, lista com criticidade, origem, OS, técnicos e IDs. CI #1379 SUCCESS no SHA `32a0af133309a4eb24581c6b29ac247fceee6ba7`.
- Lote C: #624 — distinção de filtros em rascunho versus aplicados e preservação da classificação.
- Lote D: #625 — limites temporais dos `impactIntervals` exibidos com timestamps reais no detalhe.
- Lote E: #626 — ajuda contextual sobre filtros, registros reais/testes, tempos e CSV local versus auditado.
- Lote F: PR de consolidação e CI integral. Candidata cumulativa deve ser confrontada com `main` e testada em SHA definitivo, não homologada automaticamente por CI.

**Não mesclar PRs empilhadas e depois mesclar novamente uma PR cumulativa**, evitando duplicações e histórico enganoso. As PRs intermediárias representam checkpoints de revisão. Após CI e autorização de integração, integrar apenas a candidata reconciliada, confirmar o SHA resultante em `main` e registrar os checkpoints substituídos.

## 2. Invariantes de segurança P0
- Exclusivamente central com flag `ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED=1`, principal humano com propósito normal, workstation ativa e aprovada e permissões `andon.read`, `history.read`, `history.global.read`.
- Backend revalida identidade e escopo; rotas `history/search`, `history/detail/:id`, `history/summary`, `history/export` devem aplicar o escopo SQL da sessão; parâmetro `machineId` ou URL nunca amplia permissões.
- Testes negativos: ausência de sessão, permissão revogada, sessão expirada, workstation pendente/bloqueada, escopo selecionado e link malicioso para máquina ou ID fora do escopo. Rejeitar resposta 200 com dados fora do escopo.
- Validar HTTPS, Origin, proteção CSRF nas rotas aplicáveis e política de erros; não imprimir tokens, endereço de rede industrial, IP ou metadados brutos de auditoria.
- Histórico exclusivamente de consulta: não gravar, corrigir retroativamente, reclassificar, recalcular BI ou alterar eventos consolidados.
- Ambiente de testes de escrita exclusivamente isolado e autorizado. Não tocar servidor de fábrica, máquinas, CLPs, Node-RED, certificados, firewall, banco industrial.

## 3. Aceite funcional por cenário (registar OK/REPROVADO e evidência)
| ID | Cenário | Resultado |
| --- | --- | --- |
| HML-01 | Login central autorizado, História Global aparece e permite consulta | PENDENTE |
| HML-02 | Usuário sem `history.global.read` não recebe link nem dados | PENDENTE |
| HML-03 | Workstation pendente/bloqueada e sessão revogada negadas no backend | PENDENTE |
| HML-04 | Escopo selecionado: máquina não permitida não aparece em lista, agregado, CSV nem detalhe | PENDENTE |
| HML-05 | Navegação por ícones ANDON, BI, Prioridades, Hub conforme grants | PENDENTE |
| HML-06 | /history não gera ícone próprio redundante nem logout operacional indevido | PENDENTE |
| HML-07 | Desktop: lista à esquerda, detalhe à direita; item selecionado evidente | PENDENTE |
| HML-08 | Mobile 360, 390, 412 px: lista → detalhe → voltar, sem corte/rolagem anormal | PENDENTE |
| HML-09 | Filtros recolher/expandir, mouse, Enter, espaço, foco e toque | PENDENTE |
| HML-10 | Filtro não aplicado é sinalizado; Filtrar/Limpar respeitam contexto da máquina | PENDENTE |
| HML-11 | Busca OS/ID/texto, máquina, status, criticidade, mantenedor, classificação, motivo e origem | PENDENTE |
| HML-12 | Hoje/7d/30d/data/hora local e turno atravessando meia-noite; ordenação/paginação consistentes | PENDENTE |
| HML-13 | Agregados correspondem ao conjunto total filtrado, não somente à página | PENDENTE |
| HML-14 | Múltiplas sessões técnicas, eventos de falha/diagnóstico/auditoria e intervalos de impacto | PENDENTE |
| HML-15 | Tempos de espera/atendimento/acompanhamento/total/parada não são somados entre si | PENDENTE |
| HML-16 | Snapshots de motivo e classificação não substituídos por cadastro atual | PENDENTE |
| HML-17 | CSV da página = até 25 registros; CSV filtrado = até 500, autorizado e auditado | PENDENTE |
| HML-18 | CSV protege células contra injeção de fórmulas e mantém datas/idioma legíveis | PENDENTE |
| HML-19 | Ajuda contextual distingue reais/testes, métricas, escopo e tipos de CSV | PENDENTE |
| HML-20 | Português, inglês e chinês tradicional, temas claro/escuro, desktop/mobile e leitor de tela | PENDENTE |
| HML-21 | Estados carregando, sem registro, falha de API e 403 sem dados antigos | PENDENTE |
| HML-22 | Regressão Hub, ANDON operacional, BI, Prioridades, histórico individual e instalador | PENDENTE |

## 4. Gates e rastreabilidade
1. Conferir SHA da branch/PR e CI final Windows PowerShell 5.1 + Linux/PostgreSQL/API/segurança/frontend/SSR/HTTPS/testes UI.
2. Revisar diff consolidado e confirmar que não houve migração, mudança de API/SQL/KPIs nem autorização de módulo nova.
3. Mediante decisão de integração controlada, integrar apenas uma PR candidata, confirmar novo SHA da main e registrar PRs substituídas.
4. No notebook: backup pelo instalador oficial, atualização pela main, Health/menu 6 e comprovação de SHA instalado, API/frontend, PostgreSQL, HTTPS e readiness.
5. Realizar HML-01 a HML-22 com conta/grants e máquina de teste autorizados; registrar capturas e logs sanitizados, resultado por item e SHA.
6. Corrigir reprovações via PR mínima, CI novo e nova homologação do SHA; não reutilizar aceite de um SHA anterior.
7. Somente encerrar #621 após homologação completa. Autorização de implantação industrial é gate diferente e depende dos responsáveis TI/operação.

## 5. P2 futuro (não incluído no PENTE 3 inicial)
PDF profissional por período, relatórios agendados, filtros salvos, comparações históricas, análise avançada de grandes volumes e vínculos adicionais ao BI. Cada melhoria exige issue, definição formal, dados confiáveis e aprovação de segurança separados.
