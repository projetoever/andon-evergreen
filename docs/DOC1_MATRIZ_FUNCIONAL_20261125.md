# DOC 1 — Matriz funcional e de verificação por módulo
**Fotografia:** 25/11/2026 · `main@6018335c6f085757a0fd35faed8a2893f4f03e0a`  
**Legenda:** C = código integrado; CI = CI aprovada no PR; H = homologação manual do SHA congelado; P = implantado no destino. Uma célula sem H/P **não** significa falha: significa evidência ainda não anexada.

| Domínio | Recursos e particularidades atuais | PRs de referência | Estado documental |
|---|---|---|---|
| Hub | Entrada por módulo autorizado, login, navegação entre módulos, administração, idioma e tema. | #613, #651 | C; H/P a verificar |
| Operação ANDON | Chamados diretos, por grupo, ordem de serviço conforme política, criticidade, atendimento, acompanhamento, múltiplos mantenedores, fechamento/cancelamento com auditoria e contexto de parada. | REFINE23; #632 | C; H/P a verificar |
| Dashboard | Cards de máquina, status, identidade `SETOR — GRUPO`, indicadores de destaque configurável P1..Pn, nome de máquina legível e atalhos por permissão. | #632, #646, #648 | C; H/P a verificar |
| Prioridades | Sequência P1..Pn de 1 até número de máquinas ativas, visão geral com cobertura, produção programada independente, salvamento CAS, permissão `priorities.write`, histórico por escopo, diálogos próprios. | #619, #620, #628, #646, #650, #652 | C; H/P a verificar |
| Histórico Global e máquina | Busca/filtros, timeline, tempos por técnico, parada produtiva e registros elegíveis BI; consultas e exportações protegidas. | #627, #629, #630 | C; H/P a verificar |
| ANDON BI | Cinco áreas, métricas, explorador de gráficos, modais e CSV/PDF existentes, comparação de períodos, “Sem amostra”, qualidade de origem, tooltips legíveis. | #611–613, #636, #638–639, #641–644, #649 | C; H/P a verificar |
| Hub — segurança e auditoria | Permissões por ação/estação/escopo, auditoria de mutações, central de consulta, `audit.read` e `audit.export`, CSV limitado, navegação sem capturar dados de entrada. | #651 | C; H/P a verificar |
| Configuração | Cadastros, grupos, setores, máquinas, cores, regras e preferências por contexto. | REFINE17–23; PENTE5 | C prévio; H/P por função |
| Mobile | Drawer, cards compactos, páginas e modais responsivos, manutenção das ações e política de acesso. | #653 | C/CI; H física pendente |
| Instalador e suporte | Piloto `1.0.0-pilot.3`, Node 22, API, frontend, PostgreSQL, verificação de saúde e fluxo de recuperação. | `release-manifest.json`, docs de instalação | Processo existente; atualização/restore no destino a verificar |
| Integrações industriais | Escopo de conectividade opcional, futuras interfaces SDK e dispositivos físicos sujeitos a autorização específica. | documentos de arquitetura | **Não homologar por inferência do frontend** |

## Matriz mínima de aceite do marco
| ID | Teste obrigatório | Evidência esperada |
|---|---|---|
| DOC1-H01 | Abrir chamado direto e por grupo; OS obrigatória/duplicada | Timeline + estados + resposta API |
| DOC1-H02 | 2 técnicos, atendimento individual, retorno e encerramento do último | Tempos distintos e impacto físico correto |
| DOC1-H03 | Grupo com setor oculto e chamado ativo; recarga e outra estação | Visibilidade temporária sem novo chamado indevido |
| DOC1-H04 | Prioridades de 1 até N, 14+ cards, alteração em outra estação | Contornos/rank corretos + 409 sem sobrescrita |
| DOC1-H05 | Produção programada via autorização individual/dupla | Auditar mudança; diferença entre prioridade e programação |
| DOC1-H06 | Histórico em perfil sem permissão e com escopo restrito | Ausência de botão, 401/403 diretos e sem vazamento |
| DOC1-H07 | BI com zero elegíveis; elegíveis sem retorno; valores reais | “Sem amostra” versus 0% coerentes |
| DOC1-H08 | Auditoria: usuário leitura, exportação, Admin e usuário negado | CSV, filtros, ACL e ausência de credenciais/logs sensíveis |
| DOC1-H09 | Temas e idiomas; tooltip em rosca, disco, barras/Pareto | Texto legível e valores inalterados |
| DOC1-H10 | Android/iOS 320–430px; teclado, ESC, toast e rolagem | Sem ação oculta, perda de funções ou scroll horizontal global |
| DOC1-H11 | Chrome/Firefox persistência, logout/revogação e suspensão | Sessão de acordo com política sem acesso indevido |
| DOC1-H12 | Atualização/Health, recuperação e backup-restauração isolada | SHA API+frontend, migrações e rollback reproduzível |

**Modelo para cada execução:** ID · SHA do notebook · data/hora · navegador/dispositivo · conta e privilégios sintéticos · perfil de teste · dados de amostra · resultado OK/FALHOU/BLOQUEADO/NÃO EXECUTADO · link da evidência segura · responsável · issue de correção.

**Cuidado:** automatização e smoke test não são evidência de validação industrial; ambiente e banco fabris não foram inspecionados neste DOC 1.
