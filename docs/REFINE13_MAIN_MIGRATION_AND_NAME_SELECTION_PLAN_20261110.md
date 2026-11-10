# REFINE 13 — Preparação controlada para main / banco original

Data: 2026-11-10. Estado: PLANO, sem deploy e sem migração de dados.

## Evidência HML
- Script R12-04H3 V4 terminou com SHA edec5d6d7a9c8dfe097565a2048b1acc77f9250b, HTTPS 8080/3001, PG HML 55432, backup+restore validados; sem acesso ao andon_db industrial.
- A seleção por nome continua indisponível sob login central. Root cause documental: SEC04_CENTRAL_ATTENDANCE_UI_MODE_20261030.md deliberadamente proíbe modo name com central ON; issue #345 permanece pendente.
- Comparação main...edec5d6: 145 commits à frente, não considerar apto a merge direto.
- npm install reportou 29 vulnerabilidades no frontend e 7 no servidor; requer auditoria e triagem, não executar npm audit fix --force indiscriminadamente.

## Prioridade 0 — atendimento por nome no central (issue #345)
Objetivo: usuário autenticado no Hub poderá escolher explicitamente o técnico numa lista sem PIN/RFID, se essa configuração for habilitada por Admin, preservando trilha auditável e distinção entre usuário operador e mantenedor declarado.
1. Criar modo de **identidade declarada**, distinto de autenticação por credencial. Exibir mensagem explícita na configuração; não representar escolha de nome como autenticação segura.
2. No backend, usar endpoint transacional dedicado à seleção nominal, exigindo sessão central válida, workstation aprovada e escopo para a máquina/chamado; validar mantenedor ativo/cadastrado, estado do chamado e permissões.
3. Registrar na auditoria: centralUserId, workstationId, technicianId, callId, timestamp, método name_declared, IP seguro/contexto e ação; evitar falsificação de userId no payload.
4. Garantir que entrada/inclusão/saída não burlem exclusividade, contagem de tempos, regra do último mantenedor 1→0, terminal de origem e regras de OS.
5. Modal de atendimento e encerramento, configurações e traduções PT/EN/ZH-TW; testes unit/PG real/browser e cenários negativos de autenticação/escopo/revogação.
6. Feature flag OFF por padrão até HML; manter PIN/RFID funcionando e legado sem regressão.

## Integração segura das PRs REFINE 12
- PRs funcionais empilhadas #404, #406, #408, #410, #412, #414, #416, #418: revisar dependências, maturidade e CI antes de construir PR de integração limpa contra main.
- PRs CI-only como #413, #415, #417, #419: **NUNCA MERGIR**.
- Desativar flags exclusivas de HML no pacote industrial, revisar permissões centralizadas; preservar proibição de controles físicos no acesso remoto.
- Eliminar referências a laboratório no launcher/menus da opção 4 antes de produção.

## Gate para banco original e opção 4
1. Inventariar instância e esquema reais e migrations; capturar HEAD de main, configurações, certificados, tarefas, serviços e endpoints atuais.
2. Fazer backup consistente do banco original, arquivar artefatos com hashes, testar restore em base descartável e verificar contagem de registros e BI/KPIs.
3. Executar migrations em clone do original; comparar schema e dados; elaborar rollback realista (restauração de backup, não assumir que migrate deploy reverte alterações).
4. CI completa e testes E2E/HML com seleção por nome, controle de acesso, auditoria, chamados, histórico, cancelamento, BI, Workstations e traduções.
5. Revisão de segurança das dependências, secrets, sessões, kiosk, HTTPS/Origin/CSRF, ACL e perfis.
6. Integrar na main apenas PR funcional validada; CI verde e autorização de release.
7. Atualizar opção 4 para consumir versão fixa aprovada da main, com verificação de SHA, preflight, snapshot, migração, health checks e rollback em falha.
8. Janela de implantação industrial autorizada; confirmar backup e retorno funcional antes de liberar operação.

## Backlog de segurança (33 itens)
Conferir planilha ANDON_CONTROLE_REFINE_1-7.xlsx no Drive, diário de homologação e issues do GitHub. Categorias: (1) Admin/credenciais primeiro acesso, (2) sessões 30min/12h + reautenticação 5min, (3) perfis e grants simplificados, (4) workstation aprovada/confiável com identidade e heartbeat opcionais, (5) logout/revogação/desfixação, (6) controle remoto auditado sem ampliar mobile, (7) logs/integridade, (8) Hub/BI/Prioridades e (9) HML→main. Marcar cada item como implementado, testado, HML ou pronto para main, sem declarar concluído por associação.

## Estado / restrições
- Este documento **não** implementa seleção por nome nem instala qualquer mudança industrial.
- Fábrica, DB andon_db, CLP/Node-RED/GPIO e instalação de produção continuam intocados.
- Próxima entrega de código: PR específica #345 na branch, depois PR de integração com gates.
