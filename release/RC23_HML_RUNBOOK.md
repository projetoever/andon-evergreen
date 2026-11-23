# REFINE 23 — Aceite de release P0/P1 (notebook, 23–24/11/2026)

Este roteiro é **técnico**, não é o relatório RELAT 1. Não atesta resultados que o operador ainda não demonstrou. Não alterar o servidor, banco, PLC, Node-RED ou dispositivos físicos da Evergreen. Não usar NOTEBOOK_ISOLADO como arquitetura de implantação comercial.

## Estado comprovado nesta revisão
- Main GitHub observada: `70f3bbff83f7c1c506023a43f90438c86fa5a795` (PR #602, CI #1334).
- Último SHA do notebook comprovado via menu 6: `11c4f84cf0f7e76da9a8c5a5fdd05a8776cee140` (versão anterior; API/frontend/PG/HTTPS funcionavam).
- A main nova acrescentou **apenas diagnóstico read-only** do Health: portas observadas inconclusivas versus HTTPS vivo, e boot autostart separado da saúde atual.
- Resultado de Firefox **reprovado anteriormente**, sem reteste físico; Histórico Global HIST-A–I, restore isolado e concorrência continuam pendentes. CI verde não é HML.
- Firewall 3001/8080 `BROAD_ANY_PROFILE`, CA de laboratório `mkcert`: NO-GO industrial até análise e autorização de TI.
- PR #599 de feedback administrativo de grupos segue separado, sem merge; #596 configuração individual por máquina não está entregue. Não inventar aceite.

## Sequência segura de campo
1. Em notebook **não industrial**, fazer backup com procedimento já validado, sem sobrescrever a única cópia e sem apagar dados; não enviar backup em chat.
2. Instalar **somente** via instalador oficial menu **2** e anotar SHA, sem migração manual ou scripts `NOTEBOOK_ISOLADO`.
3. Menu **6**: conferir SHA do instalado, API, frontend; saúde `/health`, `/health/db`, `/health/ready`; observar `Boot Servicos`, `Kiosk`, `Watchdog`, CA/firewall. O menu 6 é read-only e um HTTP 403 anônimo central é esperado.
4. NÃO ativar automaticamente tarefas Boot/Kiosk, mexer firewall, CA ou certificados. A política de autostart/reboot precisa de decisão própria; a opção 9 é mutável.
5. Em todas as evidências, registrar gate, teste, SHA, navegador, máquina de teste, horário, resultado APROVADO/REPROVADO/NÃO TESTADO e captura **sem** tokens, cookies, IP pessoal, dados privados de operadores, credenciais ou informações da fábrica.

## RC01 — Grupos, setores e visibilidade
- Pneumática cadastrado como `active=true`, `showDirectButton=false`, mantendo vínculo com TESTE e política BI original; modal TESTE deve exibir opção habilitada.
- Criar chamado do grupo; ver **botão temporário ocupado** na máquina, seleção da ocorrência existente e nunca botão para abrir duplicado. F5 e segunda estação devem preservar seleção/visibilidade.
- Atender, acompanhar, finalizar; somente após a **última ocorrência ativa** botão excepcional desaparece. Remover vínculo durante atendimento não apaga cadastro, classificação ou chamado histórico.
- #596: ocultação **diferente por máquina** requer implementação/decisão de escopo à parte. A configuração global não substitui esse aceite.

## RC02 — Histórico Global (HIST-A até HIST-I)
- HIST-A: abrir Hub > Histórico Global com conta autorizada; voltar Hub sem erro, loading preso ou flash de login.
- HIST-B: lista cronológica à esquerda por abertura e detalhe exato à direita; comparar chamado recente e antigo, com máquina/OS permitidos.
- HIST-C: largura de 360/390/412px, lista → detalhe → voltar mantendo filtros e seleção; teclado, tema e i18n.
- HIST-D: filtrar por máquina autorizada, OS/ID, status, criticidade, motivo e período; testar 22:00–02:00, reset; ordenar abertura, última movimentação e finalização; sem vazamento de outra máquina.
- HIST-E: perfis sem grant, workstation pendente/revogada, escopo por máquina (401/403/404 conforme contrato), HTTPS e Origin; sem liberação por URL compartilhada.
- HIST-F: timeline de técnicos, espera/atendimento/acompanhamento/parada, revisão de diagnóstico/ações do próprio chamado; não somar tempos sobrepostos; sem IP, token, PIN ou dados de outra máquina.
- HIST-G: CSV de página e exportação filtrada com escopo/auditoria, volume limitado; jamais registrar CSV real em repositório. Não declarar PDF como entregue se faltar.
- HIST-H: chamado legado sem snapshot/auditoria, múltiplos técnicos, histórico recente, dados ausentes tratados como N/A, sem crash.
- HIST-I: navegar do histórico individual ao Global com máquina fixada, reset dos filtros preservando máquina, voltar Hub; recarregar sem vazamento.

## RC03 — Operação e concorrência
- Abrir chamado direto, via grupo, e dois chamados simultâneos; OS obrigatória e duplicidade com 409 consistente.
- Atender com 2 técnicos, adicionar terceiro, concluir individualmente sem encerrar o último indevidamente; acompanhamento, retorno e finalização; testar primeira/última decisão de parada.
- Cancelamento por titular e fluxo autorizado, bloqueio de sessão/estação não habilitada, CSRF/Origin inválido (403) e ação concorrente stale (409). Validar auditoria única e BI sem contagem duplicada.
- F5, troca de terminal e dois navegadores; comparar persistência no histórico. Não acionar GPIO nem CLP.

## RC04 — Segurança e sessão
- Conta Pessoa Produção (não Admin principal) com política **Não expirar** e permissões limitadas; confirmar sinal `persistentOperational=true` emitido **pelo servidor** no mesmo HTTPS.
- Firefox perfil **normal**, mesma URL/host: fechar/reabrir duas vezes, esperar >30min sem interação e reiniciar estação apenas em janela controlada; repetir em Chrome. Verificar só nome/presença/atributos Secure, HttpOnly, SameSite e validade do cookie, **NUNCA seu valor**.
- Se falhar, registrar apenas `sessionDiagnostic` e status do cookie (presente/ausente), sem exportar cookies nem copiar tokens. Revogar via Hub/derrubar workstation e comprovar perda imediata de acesso.
- Não usar UUID, IP, localStorage ou senha de equipamento como recuperação insegura.

## RC05 — Instalação e recuperação
- Opções 2/4/6, confronto SHA e endpoints; medir reinício do runtime sem recriar banco.
- Boot Disabled e Kiosk Disabled com Watchdog Running: **autostart após reboot NÃO homologado**. Reboot e ativação de tarefas somente após decisão explícita do operador.
- Backup: conferir integridade, testar **restauração em banco/contêiner fisicamente isolado**, comparar contagem de tabelas, registros e amostra de chamados; não restaurar sobre `andon_db` nem acessar banco fabril. Documentar rollback do binário/config mantendo DB.
- Firewall/CA: diagnóstico só leitura; escopo CIDR e certificado corporativo precisam da TI. Mkcert nunca equivale a confiança industrial.

## RC06 — BI e qualidade de dados (P1)
- Amostra controlada com manutenção corretiva real, grupo TESTE/SETUP excluído conforme configuração, parada simultânea, janela programada parcial e responsabilidade indefinida.
- Validar MTTA, MTTR, MTBF, Disponibilidade e Downtime contra fontes oficiais; unir interseções físicas sem duplicar paradas; N/A não vira zero.
- A auditoria existente `server/scripts/audit-bi-causal-cohort.mjs` é **somente leitura**; executar apenas contra banco sintético/clone autorizado. O script exige `--ack-live-read` em outra base: **não usar essa opção para acessar fábrica**.
- Conferir os totais da tela e CSV/PDF já existentes, com mesma classificação e escopo, sem alterar retroativamente os snapshots.

## RC07 — UX e Administração (P1)
- Hub navega Andon/BI/Prioridades/Histórico e retorna; testar carregamento, lista de 11 abas admin em tela inteira, permissões granulares, feedback 403/409 e ausência de modal que esconda configurações.
- Testar desktop, tablet e 360/390/412px, teclado virtual, Esc, cores/temas, contraste, PT/EN/ZH e som navegador independente do GPIO.

## Fechamento e decisão
- Fonte de status: `release/rc23-acceptance.json` — **não marcar aprovado automaticamente**. Somente registrar `operator=approved` com `acceptance.status=approved`, `approvedBy`, `approvedAt` e evidência de homologação específica. A mesma exigência vale para aprovações da TI/IP.
- Executar do repositório instalado: `node release/check-rc23.mjs` ou `node release/check-rc23.mjs --json`. Saída **NO-GO e exit 1 são intencionais** enquanto existirem gates sem comprovação. O avaliador não altera o sistema.
- P1 pode ter mitigação formal com waiver assinado, nunca se o teste foi reprovado; P0 não tem waiver implícito. GO de laboratório é distinto de GO industrial/comercial.
- O chat **RELAT 1** só poderá gerar PDF/WhatsApp/e-mail após HIST-A–I e autorização **separada** do operador; evidências devem ser anonimizadas e publicação comercial depende de titularidade, licença e TI.
- Se alguma prova P0 reprovar, registrar log mínimo/captura segura e criar PR pequena e isolada; não adicionar novas funcionalidades opcionais durante este fechamento.

Controle: https://github.com/projetoever/andon-evergreen/issues/595 e https://github.com/projetoever/andon-evergreen/issues/479
