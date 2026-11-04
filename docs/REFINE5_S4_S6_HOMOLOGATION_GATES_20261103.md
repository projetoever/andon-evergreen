# REFINE 5 — Homologação industrial e critérios de liberação S4–S6

**Data:** 03/11/2026 · **Condição:** planejamento executável, não autorização de deploy.
**Ambientes:** notebook isolado primeiro; depois dois terminais de teste. Servidor Evergreen, Máquina 37, GPIO, Node-RED, bancos e certificados produtivos **não devem ser alterados por este documento**.

## Princípio de liberação

Uma CI verde demonstra regressão automatizada, **não** compatibilidade com o controlador físico. Todas as linhas de aceite devem ter evidência observável, responsável e decisão. Não usar `ANDON_CENTRAL_ACCESS_ENABLED=1` na fábrica enquanto houver linhas em aberto. Não reutilizar credenciais produtivas no notebook.

## Matriz objetiva de aceite

| Código | Teste / resultado obrigatório | Evidência mínima | Estado antes do teste |
|---|---|---|---|
| S1-01 | Administrador de instalação existente migra com senha anterior válida, gera recuperação central e retira a senha legada somente após confirmação | vídeo ou relatório do notebook, tentativas aceitas/negadas e auditoria | Fluxo S1/7 implementado e ensaiado em PostgreSQL isolado; **homologação manual pendente** |
| S1-02 | Primeiro acesso comercial central cria uma senha humana e workstation local aprovada, com demais workstations pendentes | instalação limpa em banco fictício e repetição após rollback | Fluxos S1/6 e S1/8 implementados; **homologação no notebook pendente** |
| S1-03 | Sessão central: inatividade 30 min; duração máxima 12 h; operações críticas exigem confirmação após 5 min sem reiniciar a sessão | relógio, logs de autenticação e testes após expiração | Implementado; homologação manual pendente |
| S1-04 | Recuperação central em loopback/HTTPS: código de uso único, revoga todas as sessões, não entrega novo token | testes local/remoto e negação de código já usado | Código implementado; testar notebook |
| S2-01 | Produção, Manutenção, Gerente e Admin têm somente as permissões aprovadas, inclusive por URL direta | matriz ACL HTTP 200/401/403 e UI PT/EN/ZH-TW | Código implementado; homologação pendente |
| S3-01 | Com modo central ativo, ANDON, BI e Prioridades não exigem nem emitem segundo login de navegador | chamadas HTTP com e sem cookies e Bearers legados | Bloqueio implementado; credenciais ainda persistidas |
| S3-02 | Todas as rotas administrativas sensíveis dispõem de ACL central, auditoria, CSRF e rollback antes de apagar a senha global | inventário de GET/POST/PATCH/PUT/DELETE e testes negativos | **PENDENTE:** cobertura integral |
| S4-01 | Identidades industriais distintas: máquinas, chamados e som, apenas escopos `machines.read`, `calls.read`, `sound.read` | logs sem segredos; negação de métodos não permitidos | Backend implementado; cliente real não testado |
| S4-02 | Node-RED M37 preserva contratos reais dos payloads 7–12, ordem, frequência e estado de sirene | amostras originais redigidas de dados privados, comparação byte/campo e vídeo físico | **PENDENTE:** cliente externo ao repo |
| S4-03 | Mini PC GPIO mantém estados seguros com renovação/expiração de token, perda/reconexão de rede e reinício | teste acompanhado pela manutenção, com efeito físico observado | **PENDENTE:** cliente e teste físico |
| S4-04 | Credencial de serviço não autoriza ações administrativas, escritas, machine-scope não concedido ou navegador com Origin | evidência de respostas 401/403, sem comportamento físico indevido | Regressões automatizadas; teste real pendente |
| S5-01 | Workstations exibem online apenas com heartbeat recente (15s/45s) e sessão válida; polling não estende sessão | dois terminais, suspensão/fechamento de aba, rede desconectada | Código implementado; homologação pendente |
| S5-02 | Pré-verificação de arquivamento bloqueia estações em manutenção, com kiosk, sessão, tela fixada ou contato recente | resposta do preflight e identificação física/UUID | Pré-verificação desenvolvida; ação de arquivo indisponível |
| S5-03 | Arquivamento lógico retém UUID e auditoria, só é liberado após validar vínculos industriais físicos | aprovação operacional documentada e teste de restauração | **PENDENTE:** bloqueio intencional |
| S6-01 | CI Windows/PowerShell, backend, PostgreSQL isolado, HTTPS e testes UI desktop/mobile verdes no mesmo commit | URL do workflow e SHA exato | Executar após última alteração |
| S6-02 | Exportar backup verificável, ensaiar reversão e comprovar integridade dos KPIs MTTR/MTTA/MTBF, disponibilidade e downtime | relatório de backup, restauração e amostras de BI sem dados reais | Validação automatizada de **recuperação Admin/negação no rollback** acrescentada; **backup/restauração e BI no notebook pendentes** |
| S6-03 | Gestor autoriza janela de implantação **separadamente**, depois dos testes e do parecer de manutenção | aceite expresso com SHA, risco e plano de rollback | **NÃO AUTORIZADO** |

## S6-02 — rotina de backup/restore isolada disponível para execução manual

Foi acrescentado `homologation/https/Test-AndonHttpsBackupRestore.ps1` para **notebook Windows**. A rotina só aceita o PostgreSQL `andon_https_hml` no container exato do launcher, Docker local via named pipe e porta loopback. Exige que o launcher esteja encerrado; exporta um dump binário `pg_dump -Fc`, copia e compara SHA-256, reenviando o arquivo exportado para **restore em banco temporário novo**. Verifica contagem/hash de dez tabelas críticas e gera manifesto protegido. Não aceita parâmetros de banco/host externos e não restaura sobre `andon_https_hml`.

**Não marcar S6-02 como concluído só por CI verde:** o teste Windows da CI apenas valida sintaxe e travas estáticas; resta executar o ensaio real no notebook e comparar os indicadores BI com dados fictícios. Procedimento e evidências: `docs/REFINE5_S6_NOTEBOOK_BACKUP_RESTORE_20261104.md`.

## Sequência para homologar no notebook sem tocar a fábrica

1. Usar apenas PostgreSQL de testes, dados fictícios, certificados HTTPS do próprio notebook e conta central de testes. Registrar SHA e variáveis de configuração **sem** copiar senhas, secrets, certificados privados ou dados da fábrica.
2. Rodar os scripts de validação de acesso/HTTPS e a CI completa correspondente. Abrir Hub, ANDON, BI e Prioridades diretamente por URL, em PT/EN/ZH-TW, para verificar autenticação e negação de acesso. Nenhuma rota não migrada deve receber bypass genérico.
3. Testar o tempo real de sessão humana (5 min Admin, 30 min idle, 12 h absoluto), heartbeat separado, logout, revogação, suspensão do navegador, perda de conexão e reconexão com duas workstations de teste.
4. Repetir o cadastro novo e a migração de um banco legado **sintético** após backup/reversão. Não marcar S1 concluído enquanto o bootstrap ainda exigir duas senhas.
5. Somente após um ensaio Node-RED/GPIO acompanhado fisicamente, comparar contratos dos payloads 7–12 e confirmar que leitura autorizada não implica permissão de escrita. Registrar qual cliente/versão foi testado.
6. Conferir indicadores BI com chamados de manutenção classificados, testes excluídos, chamadas concorrentes e separação de categorias não manutenção. Conservar evidências de antes/depois e validar que não houve regressão.
7. Fechar cada critério com data, evidência, responsável e decisão. Com qualquer bloqueio, **não implantar**.

## Evidência S1/S6 adicional — recuperação após retirar a senha legada

O teste `server/scripts/validate-access-http.mjs`, executado na CI em **PostgreSQL isolado `andon_test` e HTTPS local**, agora prossegue após o opt-in de retirada da senha global. Para separar os limites de tentativa acumulados durante a prova anterior, ele abre **uma segunda instância HTTPS apontando para o mesmo banco isolado**, sem afrouxar o limitador de produção e verificando a persistência das credenciais/sessões entre instâncias: confirma que não há hash legado, testa rejeições por Origin e CSRF, recupera a senha central uma única vez, demonstra revogação da sessão anterior, nega reutilização do código, impede login com a senha central antiga, autoriza nova autenticação com a senha central redefinida e comprova que a conta global não reaparece. O guard de primeiro acesso é exercitado com a mesma base em modo central ON, rollback para OFF e retorno a ON, incluindo a negação **428** no modo legado sem senha global.

Essas verificações provam **apenas a lógica de autenticação e rollback do banco de testes**, sem restaurar um backup real, medir KPIs ou validar clientes físicos. Continuam obrigatórios a execução acompanhada no notebook, a restauração completa verificada, o aceite de manutenção para Node-RED/GPIO e a autorização industrial separada.

## Cenários negativos obrigatórios

- Token Admin legado criado anteriormente não autentica em modo central nem volta a valer após alternância de modo no mesmo processo.
- Token legado ANDON/BI/Prioridades não cria uma segunda sessão central; nenhuma credencial é devolvida quando central está ativo.
- Workstation inativa, pendente, com UUID incorreto, escopo de máquina diferente, sessão revogada ou expirada recebe negação na API, ainda que a interface esconda o módulo.
- Credencial de serviço sem escopo correto, expirada, rotacionada, com `Origin` de navegador ou usada para escrita, recebe rejeição. Falha de rede não gera acionamento espontâneo de GPIO ou sirene.
- Reautenticação do Admin não altera `createdAt`, `expiresAt` nem `lastInteractionAt`; heartbeat também não altera esses campos.
- O preflight de arquivamento é **informativo**; não aceita ação de arquivo enquanto o cliente industrial real estiver sem validação e a implementação final não tiver sido aprovada.

## Regras de rollback e parada

Interromper a homologação com qualquer 5xx novo na API crítica, diferença nos payloads físicos, contagem de chamados incorreta, perda do histórico, divergência dos KPIs, cert TLS inválido, regressão na autenticação ou ausência de restauração comprovada. Restaurar configuração/DB **do ambiente isolado de teste**, registrar resultado e preservar evidências sem segredos. Não copiar alterações de teste para o servidor industrial por analogia.

A homologação do projeto pode encerrar apenas quando **S1–S6 não tiverem bloqueios**, incluindo as verificações físicas. Merges na `main` não significam implantação.
