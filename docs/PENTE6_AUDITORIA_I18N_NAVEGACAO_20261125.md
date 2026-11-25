# PENTE 6 — Auditoria, idiomas e navegação do ANDON
Data: 25/11/2026 · Projeto: ANDON Web Industrial — Ever Green  
PR de homologação: https://github.com/projetoever/andon-evergreen/pull/651  
Base de desenvolvimento: `main@b3e496e81274d9ede021aba6099c94d62164436d`  
Status deste documento: **implementado em branch de homologação, sem merge ou instalação comprovada**.

## 1. Login
- Removido o botão manual "Ver diagnóstico do login anterior".
- Mantido o aviso contextual automático somente quando houve sessão persistente anteriormente confirmada e realmente perdida.
- Consulta de sessão com nova tentativa curta somente em falhas transitórias.

## 2. Idiomas (PT-BR, EN, ZH tradicional)
- Localizadas as mensagens, os filtros, as ações, os estados, os cabeçalhos e as permissões da central de auditoria.
- Padronizadas 12 entradas legadas com traduções conflitantes; foi preservada a versão já efetiva no catálogo final para evitar alteração funcional inadvertida.
- Testes protegem a cobertura, os placeholders e conflitos futuros entre catálogos.
- Nomes de usuários, setores, máquinas, motivos e recursos permanecem dados cadastrados e não são traduzidos automaticamente.

## 3. Auditoria e rastreabilidade
- Fonte persistente: PostgreSQL, tabela `audit_events` do Prisma (sem nova tabela ou migração).
- Ícone de auditoria no cabeçalho do Hub apenas quando o servidor informar permissão de consulta; Admin principal tem acesso em modo central.
- Editor de usuários: grupo independente "Auditoria e rastreabilidade" com `audit.read` e `audit.export`.
- Exportar exige também consultar, sem herança a partir de perfil descritivo ou de qualquer módulo.
- API: `GET /api/access/audit-events` (50 eventos/página, ordenados por data e ID), `GET /api/access/audit-events/export` (CSV UTF-8 com BOM e separador ponto e vírgula). Cada endpoint valida sessão, estação aprovada e ACL.
- Filtros: período em UTC, usuário, ação, texto de recurso. Visualização usa fuso horário do dispositivo e expõe detalhes de antes/depois quando registrados.
- CSV limitado a 20.000 eventos por exportação; períodos maiores exigem filtros/particionamento, sem truncamento silencioso.
- Prevista proteção contra fórmulas de planilhas no CSV e nova aplicação da redação de campos sensíveis tanto na consulta quanto na exportação.
- Consultas e exportações também registram seus próprios eventos de auditoria.
- `POST /api/access/audit-events/navigation` e `POST /api/access/audit-events/interactions` registram páginas e interações de componentes permitidos, com lotes e limites de volume. **Nunca enviam o texto de entradas, senha, PIN, cookie, token ou parâmetros de URL.** Interações de navegador são informativas; mudanças aceitas são identificadas pelo log transacional do backend.

### Limites explícitos de cobertura
- A trilha de cliques é de **melhor esforço**: depende de sessão central válida, conectividade e navegador com JavaScript. Telemetria não é prova de operação concluída.
- O rastreador contempla as rotas atuais do frontend; extensões futuras exigem revisar a allowlist de páginas.
- O nível de detalhe de eventos transacionais preexistentes depende da instrumentação de cada rota no backend; não se pode afirmar cobertura retroativa de operações nunca auditadas.
- A gravação de cada clique pode aumentar o volume do banco. Antes do uso industrial contínuo, estabelecer política de retenção e monitorar armazenamento/latência.

## 4. Navegação
- Revalidação de permissões preservada no servidor, inclusive ao navegar por links diretos.
- Transições de todos os módulos tentam recuperar uma falha temporária de rede uma única vez, sem repetir negativas HTTP 401/403.
- Falha transitória na administração central não é mais mostrada como acesso negado/logout; exibe tela neutra com nova tentativa.
- Navegação de recuperação volta ao Hub pelo roteador, sem recarregamento integral desnecessário.

## 5. Homologação obrigatória
1. Login central em Chrome e Firefox, conta Admin e conta comum; confirmar ausência do botão manual e comportamento dos avisos de sessão.
2. Conta sem `audit.read`: sem ícone, GET 403 e URL direta sem acesso. Conta somente `audit.read`: leitura autorizada e exportação 403. Conta com ambos: consulta e CSV. Admin principal: consulta e CSV.
3. Cadastrar/editar usuário: permissões independentes, `audit.export` seleciona leitura e remoção da leitura revoga exportação.
4. Simular navegação ANDON, BI, Prioridades, Histórico, Hub Admin e detalhes de máquinas; confirmar distinção entre `ui.click`, `ui.route.view` e mutações confirmadas no banco.
5. Confirmar que campos digitados/credenciais não aparecem em UI, banco nem CSV; testar filtros, datas UTC, paginação, registros históricos e planilha Excel.
6. Verificar tradução visual completa nas três línguas, rótulos extensos, responsividade e acessibilidade de ícones e modal.
7. Simular API indisponível e 503 temporário: sem tela de permissão negada falsa; 401/403 continuam negando imediatamente.
8. Verificar CI de frontend, backend, testes de acesso/idiomas e instalador PowerShell 5.1. Executar testes manuais no notebook sem afetar produção.
9. **Merge para main somente após testes verdes e autorização explícita do responsável.**

## 6. Segurança da entrega
Sem alteração de schema, credenciais, permissões padrão, sequência de máquinas, flags de BI ou lógica de chamados. Sem deploy automático; instalação/validação física permanecem pendentes.
