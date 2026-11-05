# REFINE 9.2 — Lote de segurança operacional e homologação

**Data:** 05/11/2026. **Status:** desenvolvimento em PR draft; nenhuma alteração da main nem implantação. **Base:** `main` merge REFINE 9.1 `4bb9041002b58fc5c8fe6a6f34f43f706f80aa2c`.

## Entregas do lote

| ID | Requisito | Status de código | Gate |
| --- | --- | --- | --- |
| R9.1-05 (#346) | Logout central no cabeçalho do Hub para qualquer pessoa com sessão normal, e opção de sair em sessão de aprovação pendente | Implementado na branch | Testes CI/HML e casos de falha |
| R9.2-01 | Política administrativa na aba Workstations: exigir ou dispensar aprovação para novas estações. Independente da política legada, exige Admin principal, reautenticação crítica recente, CSRF, justificativa e auditoria | Implementado na branch | Testes API/PG de fail-closed |
| R9.2-01-LAB | Padrão de novas workstations aberto **somente** no notebook HTTPS isolado (127.0.0.1, localhost:8080, DB andon_https_hml:55432, launcher específico). Para fábrica e qualquer outro ambiente, exigir aprovação por padrão; valor explícito Admin prevalece | Implementado na branch | Verificação identidade HML / regressão |
| R9.2-02 (#347) | Admin principal com senha verificada libera automaticamente **somente a própria** workstation nova e pendente; conta ativa/escopo global, sem credencial temporária, sem privilégio para perfis inferiores; rejeitada/bloqueada continua negada. Operação atômica com auditoria e revogação de sessões antigas | Implementado na branch | Testes de atomicidade, concorrência, rollback, login inválido e HML |
| R9.2-03-LAB | Resgate explícito da própria workstation pendente do Admin no LAB isolado quando já havia sessão de admissão antes da mudança; re-login exigido após aprovação | Implementado na branch | Verificar no notebook sem apagar cookies |
| R9.1-03 (#345) | Atendimento por **seleção de nome** no acesso central, separado da autenticação do Hub | **PENDENTE**: exige tratamento auditável de identidade declarada e rota transacional; não liberar só removendo PIN/RF | Backend+testes antes da próxima homologação |
| R9-05…08 | Dispositivo confiável, kiosk de Produção, logout remoto Admin, status de confiança/presença | **NÃO IMPLEMENTADO** neste lote | Design/PR separados |

## Invariantes de segurança

1. **Admin não significa acesso sem senha.** Autenticação de credenciais é obrigatória; auto-aprovação fica registrada no banco e na auditoria no mesmo commit. A estação bloqueada `active=false,pendingApproval=false` ou `admission.status=rejected` não pode ser recuperada pelo mero login; liberação manual explícita é necessária.
2. Abrir o cadastro de novas workstations nunca concede módulos, chamados, permissões, sessão ou acesso Admin. O sistema central autoriza somente após login humano válido; `principal` central controla permissões.
3. A opção de novas workstations não deve alterar as estações já pendentes/rejeitadas; o Admin pode aprovar a própria estação pendente via login legítimo ou, no LAB somente, via ação de autocorreção auditada.
4. Encerrar uma sessão não pode apagar workstation, dados dos chamados, indicadores, sessões de terceiros ou configuração de confiança/kiosk.
5. Sessões humanas: 30 min inatividade, 12 h absolutas, reautenticação crítica 5 min. Heartbeat não as estende.
6. Política de alterações de aprovação central deve ser revisável; nenhuma escrita pela antiga rota pública `/api/modules/settings` quando central ON.
7. Não executar merge nem atualizar notebook HML até CI verde. Usuário valida toda a interface. Nunca implantar automaticamente no servidor ou no banco oficial.

## Evidência e documentação
- Issue R9.1-05: https://github.com/projetoever/andon-evergreen/issues/346
- Issue R9.2-02: https://github.com/projetoever/andon-evergreen/issues/347
- Issue R9.1-03: https://github.com/projetoever/andon-evergreen/issues/345
- Diário: https://docs.google.com/document/d/14ctodyrT2xsVgEf3IKPBqJ8FV_cJl5KDhTVJjHS3ZCE/edit
- Planilha mestre: https://docs.google.com/spreadsheets/d/1Jh0AqVL0YsNzGhss1xyM-XnfV5MGDbzH/edit

**LAB:** `C:\web-andon-refine8-hml\andon`, `andon_https_hml`. **Fábrica e instalação original intocáveis**. Backup e restauração validada previamente são pré-condição antes de migração em LAB; campo Prisma aditivo opcional.
