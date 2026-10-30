# SEC-04/2S — Navegação da Administração central e triagem das 20 operações remanescentes

Data: 30/10/2026. Base: PR #293, commit `f5959cd64709e38da8c2b052704900dec4dc8b51`.

## Decisão de arquitetura
No modo central, o botão de configurações do **Dashboard principal** abre `/hub/admin?section=andon`, nunca o modal de login Admin legado. A página do Hub verifica novamente no servidor a sessão HttpOnly e o atributo `isPrimaryAdmin` com finalidade `normal`, antes de montar qualquer aba. O backend continua impondo privilégios próprios sob transação: interface nunca constitui a autoridade de escrita.

A nova seção **Configurações do ANDON** contém somente `GeneralSettingsTab` (OS obrigatória, teclado virtual, restrição de conclusão por workstation e organização do Dashboard) e `AttendanceModeSettingsTab` (identificação PIN/RFID). As demais abas legadas **não são** expostas: Sons, Mantenedores, Máquinas, Categorias, Turnos, Segurança do Hub e credenciais de módulo exigem suas próprias políticas. Ao desligar central, Dashboard e Hub mantêm o login legado anterior e a rota central exclusiva `andon` é convertida em `overview`.

Em central, a opção de prioridades só consulta a política retornada pelo Hub, sem tentar autenticar por senha de Prioridades legada; se a workstation não tiver permissão, a opção de ativar visualização por prioridade fica desabilitada. O backend deixa `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED` OFF por padrão. Uma tela pode ser montada e ainda receber 403 até liberação formal da flag, que deve ser informada na homologação.

## 20 escritas ainda não classificadas no inventário — decisão por grupo
A presença no inventário **não** indica que uma rota deve ser liberada. Todas permanecem fail-closed no login central até cada adaptação e testes.

| Grupo | Qtde. | Classificação e ordem de homologação |
| --- | ---: | --- |
| `machines.ts`: cadastro/edição/ativação | 3 | **P1**: gerência de ativos; a homologação operacional usa máquinas já cadastradas, mas rollout precisa ACL/auditoria |
| `dashboardPriority.ts`: política/credenciais/login/logout legados | 4 | **P1 legado**: sessão central deve substituir autenticação por senha; não migrar automaticamente credenciais antigas |
| `failureEvents.ts`: abertura, alteração e término de parada física | 3 | **P0 industrial**: revisar origem do evento, escopo físico e efeito nos KPIs antes de qualquer ativação produtiva; usar simulação isolada no notebook |
| `technicians.ts`: cadastro e edição de identidade técnica | 2 | **P0 preparação** se for necessário cadastrar técnicos na homologação; **P1 operação** caso técnicos de teste sejam previamente provisionados; PIN/tag exigem locks e auditoria separada |
| `shifts.ts`: edição de turno | 1 | **P1**: cadastro administrativo separado, sem habilitação de escrita genérica |
| `systemSettings.ts`: mute global/sirene | 1 | **P0 avaliação de funcionamento** do Dashboard e integrações Node-RED/GPIO; não liberar escrita central nem som do servidor antes de provar escopo, propagação e segurança |
| `workstations.ts`: registro e edição geral | 2 | **P1**: admissão e política central já usam API `/api/access/workstations`; não transportar privilégios do legado |
| `modules.ts`: política do Hub | 1 | **P1 governança**: requer concessão Admin dedicada e rollback, não confundida com login |
| `moduleCredentials.ts`: credenciais, login e logout legados | 3 | **P1 legado**: não devem substituir login central nem ficar liberados por permissão de uso de módulo |

**Total: 20 rotas**. Isso não representa 20 defeitos e não deve levar a 20 liberações indiscriminadas. A classificação é planejamento; não altera `UNMIGRATED_WRITE_ROUTES`.

## Critérios de aceite para pacote dos 11 ajustes
1. Login central, troca de senha inicial, aprovação/bloqueio de workstation e gestão de usuários usando exclusivamente a sessão central; verificar URL direta e revogação.
2. Dashboard -> Hub Admin abre as configurações autorizadas sem autenticação legada; usuário comum vê acesso restrito; legado OFF continua com modal anterior.
3. Testar OS obrigatória, teclado, conclusão por workstation, PIN/RFID, técnicos 2→1 e bloqueio 1→0, acompanhamento e diagnóstico com auditoria/BI, tudo em `andon_test` e uma única instalação no notebook.
4. Em estação de TV, garantir que mute global ainda não habilitado em central é tratado como função pendente: não prometer sincronia de sirene até política própria. Revisar Node-RED/GPIO do piloto somente sem tocar o hardware.
5. Verificar flags OFF, startup HTTPS, backup/rollback, versão do Hub, módulos em tela 16:9, controle de acesso e reinicialização. Não copiar configurações industriais para o notebook.
6. Não fazer deploy, merge não autorizado ou ativação de flags no servidor da Evergreen/Máquina 37. Integrações físicas dependem de autorização separada.

As UX novas continuam em issues #288, #289 e #291, isoladas do fechamento SEC-04.
