# ANDON Evergreen — gates para candidato de liberação pela main

**Data de revisão:** 2026-11-11. **Destino final:** Windows Server 2016 / PostgreSQL 17 / Node 22.23.2 / frontend 8080 / API 3001. **Situação:** planejamento e revisão estática; NENHUM deployment autorizado. Laboratório HML do notebook não integra este fluxo.

## 1. Bloqueios inegociáveis antes de ativar hierarquia
- [ ] As PRs de backend/migration, catálogo operacional, painel de máquina e histórico estão na **main**, com CI e smoke test de PostgreSQL descartável. Conferir HEAD do release e SHA fixo, não apenas nome da branch.
- [ ] S4: testes mensurados demonstram que Setup→Mecânica, Apoio→Elétrica e categorias de Produção não entram em **MTTA, MTTR e MTBF corretivos** sem evidência adequada. O tempo de atendimento/apoio, volume de solicitações e parada física real devem continuar registrados, inclusive se não forem corretivos.
- [ ] Revisar episódio de falha causal e seus eventos/impactos antes de mudar MTTR/MTBF; não basta filtrar uma lista de chamados por nome de motivo.
- [ ] A abertura com motivo e especialidade guarda snapshot imutável (IDs, nomes, revisões, natureza, política) na MESMA transação da abertura, com rollback total em erro.
- [ ] Testar mudança simultânea de catálogo/revisão e duas workstations tentando abrir mesmo setor/OS; validar erro 409 controlado, sem chamado duplicado.
- [ ] Botões de máquina exibem modal categoria→especialidade, e chamados ativos continuam selecionáveis. Confirmar Escape, Voltar, tradução PT/EN/ZH-TW, tela sensível ao toque, OS obrigatória, alerta OS repetida e erro de API.
- [ ] Abertura global/dashboard, batch e flows legados continuam utilizáveis; não impor razão hierárquica compulsória a cliente legado. Testar com nova flag OFF e ON separadamente.
- [ ] Histórico antigo permanece intacto, novos chamados mostram os nomes/revisões do dia da abertura; mudança posterior do catálogo não reescreve passado.

## 2. Segurança, autenticação e workstation
- [ ] Revisar a PR #431 com base na **main atual**, sem sobrescrever schemas, traduções ou testes recém-integrados. Não confundir CI antiga da branch com aprovação do código reconciliado.
- [ ] Em estação de Produção fixada e aprovada, avaliar opt-in de login sem expiração por workstation. A sessão fica restrita à máquina e a permissões operacionais, revogada ao perder confiança, mudar senha, desligar estação ou substituir operador.
- [ ] Admin principal e contas com gestão **nunca** ganham sessão ilimitada. Manter inatividade 30 min, máximo 12 h e prova recente de 5 min para operações críticas nos demais perfis.
- [ ] Logout remoto por Admin exige reautenticação recente, motivo auditado, protege estação atual/Admin e só revoga sessão; nunca finaliza ou cancela chamado.
- [ ] Conferir ACL, CSRF, HTTPS/Origin, cookie Secure/HttpOnly/SameSite, aprovação por workstation, escopo por máquina e prevenção de acesso cruzado por URL/método.
- [ ] Exercitar fluxos: Produção, Manutenção, Líder, Gerente, Admin; menus inacessíveis visíveis bloqueados sem elevar privilégios.
- [ ] Auditar 33 controles inventariados no Drive e registrar prova objetiva (arquivo, teste, resultado, data), com responsável por pendência.

## 3. Operação industrial e compatibilidade
- [ ] Manter GPIO/Node-RED/sirene externa **opcionais**, e mudo do navegador independente de falhas desses agentes.
- [ ] Testar abertura, atendimento por nome, múltiplos técnicos, acompanhamento, troca de mantenedor, cancelamento, finalização e histórico de chamados criados antes da atualização.
- [ ] Testar máquina 37 (piloto) e workstations diferentes sem utilizar dados fictícios em produção; sem comandos físicos a CLP no ensaio.
- [ ] Verificar perfil Produção com tela sempre aberta, atualização de página, falha de rede, revogação de sessão e recuperação controlada.
- [ ] Validar cadastro de máquinas/mantenedores/áreas, configurações globais e persistência. Nenhuma permissão Admin deve vazar para operador.

## 4. Pacote main e rollback — janela controlada
1. Escolher commit **exato** da main após CI aprovada e revisar todas migrations incrementais. Conferir ambiente e dependências com scripts read-only.
2. Agendar janela de manutenção com responsável da fábrica; comunicar indisponibilidade, congelar novos chamados somente se aprovado.
3. Capturar backup consistente do PostgreSQL e arquivos de configuração, certs e versão anterior; validar **restauração em banco isolado** e checklist de integridade. Nunca usar backup sem teste de restore.
4. Planejar migração aditiva; preservar tabelas e chamadas históricas. Flags novas permanecem OFF durante a instalação.
5. Aplicar pacote com logs e health HTTP/HTTPS, validar leitura/histórico e rota de rollback antes de qualquer flag ON.
6. Ativar flags somente após teste operacional supervisionado e aceite explícito do responsável; reverter flag imediatamente se erro de abertura, login, BI ou workstation.
7. Se precisar rollback de binários, **não reverter migrations destrutivamente nem restaurar backup sobre gravações recentes** sem plano de conciliação de chamados posteriores.

## Critérios do status
- **Codificado** ≠ **CI aprovada** ≠ **integrado na main** ≠ **instalado** ≠ **homologado em fábrica**.
- Só anunciar **liberado para atualização** quando seção 1 + segurança aplicável + pacote seção 4 estiverem revisados e testados, com aceite.
- Não habilitar `ANDON_HIERARCHICAL_CALL_OPEN_ENABLED` e `ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED` no servidor Evergreen enquanto BI S4, #431 e protocolos de instalação estiverem pendentes.

## Referências
- Main oficial: `projetoever/andon-evergreen`.
- PR #431: sessão operacional persistente/logout remoto (em revisão).
- PR #443: S4-B MTTA/retornos corretivos (CI em andamento no registro).
- Google Drive: diário de homologação e segurança, EV-095 em diante.
