# REFINE 9 — Continuidade do REFINE 8 / Segurança do Hub e Kiosk

**Data:** 05/11/2026. **Status:** PLANEJAMENTO + UI DE MÓDULOS EM DESENVOLVIMENTO. **Nenhuma homologação final.**

**Repositório:** `projetoever/andon-evergreen`; **PR base:** #342 (draft, sem merge, correções do painel Hub/ANDON; CI ainda sob revisão); **PR launcher HML:** #341 (draft). **Drive mestre:** https://docs.google.com/spreadsheets/d/1Jh0AqVL0YsNzGhss1xyM-XnfV5MGDbzH/edit .

## Ambiente e limites inegociáveis

- Notebook LAB: `C:\web-andon-refine8-hml\andon`, HTTPS https://localhost:8080/hub, API 3001, PostgreSQL `andon_https_hml`, Docker isolado `127.0.0.1:55432`.
- Notebook principal: `C:\web-andon-industrial\andon`, banco `andon_db`. **NÃO** modificar sem backup, homologação e aceite explícito.
- Fábrica Evergreen: **NÃO** atualizar, migrar, habilitar central, mexer na Máquina 37, PLC, GPIO ou Node-RED.
- Existe cópia validada por hash, ensaio de restauração isolada com 35 tabelas, patch somente HML da colisão de portas. Os ambientes não se confundem.
- Separar sem exceção: **código em branch ≠ CI verde ≠ homologação no notebook ≠ merge main ≠ implantação industrial**.

## Itens e critérios (ordem obrigatória)

| ID | Prioridade | Estado em 05/11 | Mudança / aceite | Comprovação |
|---|---|---|---|---|
| R9-01 | P0 | Código UI em PR #342, CI pendente | Hub exibe TODOS os cards ANDON/BI/Prioridades; não autorizado = esmaecido, cadeado, sem link/click; motivo correspondente. Não confundir 'módulo indisponível' com 'sem permissão'. | Testar conta Admin, Manutenção e Produção, URLs diretas, 403 sem permissão, PT/EN/ZH, desktop e móvel. |
| R9-02 | P0 | Regra em PR #342; CI pendente | Admin principal (`isPrimaryAdmin=true`) acessa TODOS os módulos e painéis, sem toggles; workstation ainda deve estar aprovada/ativa, HTTPS/CSRF válidos e reautenticação nas ações críticas; sem bypass de escrita industrial. | Todos os módulos e telas + escritas controladas; roleLabel 'Admin' sozinho não confere privilégios. |
| R9-03 | P0 | PR #342, CI pendente | Painel de config completo e aparência retornam ao ANDON; Hub só segurança geral/usuários/workstations/integrações. Cadastros existentes preservados; APIs ainda não migradas permanecem fail-closed. | Comparar menu antigo com novo, confirmar salvamento de campos migrados e bloqueio de campos ainda não migrados. |
| R9-04 | P0 | PR #342, CI pendente | Usuários simplificados: perfis Admin (primário), Gerente, Líder, Manutenção, Produção; concessões visíveis somente ANDON, BI, Prioridades, configurações ANDON. Workstation aprova terminal, NÃO define módulos. Preservar controles por máquina e grants históricos sem conceder ações extras. | Testes por perfil com 2 workstations, negar URL/API para usuário sem grant, verificar login e auditoria. |
| R9-05 | P0 | **A PROJETAR/IMPLEMENTAR** | 'Confiar esta workstation' / 'Lembrar neste dispositivo' via fluxo autenticado e autorização Admin por estação; só perfil Produção/Kiosk, não Admin, não Gerente e não máquinas improvisadas. Revogar confiança e pedir novo login. | Segurança de registro/chave, expiração/revogação, reboot e troca de usuário; teste de cópia de armazenamento e navegador limpo. |
| R9-06 | P0 | **A PROJETAR/IMPLEMENTAR** | Tela ANDON nunca expira/fecha por ociosidade. Sessão humana normal permanece 30 min idle, 12 h máx, Admin reauth crítica 5 min. Para kiosk aprovado, credencial operacional especial renovável/rotativa vinculada ao dispositivo; não é um cookie de sessão humana infinita nem armazenamento de senha. Só operações autorizadas; offline falha fechado para escrita, tela local pode ficar exibida com alerta. | 31 min, 13 h, reinício Chrome e servidor, reconexão, token reutilizado, terminal revogado, heartbeat não renova sessão humana. |
| R9-07 | P0 | **A PROJETAR/IMPLEMENTAR** | No Hub > Workstations, Admin principal pode forçar logout por **workstation específica**, nunca indiscriminadamente por usuário. É proibido encerrar a própria workstation do solicitante OU qualquer workstation com sessão válida de Admin principal; exige reautenticação recente, motivo, confirmação, locks/versões, auditoria e revogação do lease de confiança. Tela ANDON continua aberta; próximo write exige nova autenticação. | Sessões de mesmo usuário em duas estações, corrida revogação/refresh, 401 e aviso visual, qualquer estação com Admin principal protegida, rollback seguro. |
| R9-08 | P1 | **A PROJETAR/IMPLEMENTAR** | Status visível: workstation confiável? responsável? última renovação? sessão válida/revogada? online por heartbeat (último registro NÃO prova Chrome aberto); botão ativar/desativar confiança (somente Admin). | Atualizações de UI sem atraso indevido, nenhuma credencial exposta, auditoria completa. |
| R9-09 | P2 FUTURO | **NÃO IMPLEMENTAR NESTE CICLO** | Eventual 'Abrir ANDON' pelo Hub precisará de agente local explicitamente instalado, comandos estritamente allowlisted, autenticação mútua, confirmação e log. Não criar endpoint de shell remoto nem controlar PLC/Node-RED. | Design de segurança separado e homologação física antes da fábrica. |

## Arquitetura segura para R9-05 a R9-08

1. Distinguir três identidades: workstation física/navegador (`ws_UUID`), conta do operador, credencial de dispositivo aprovado. **UUID não é segredo de autenticação.**
2. Uma solicitação local 'Lembrar este dispositivo' não autoriza nada sozinha; depende de login autenticado, aprovação de Admin e política no servidor. Confiar exige justificativa e auditoria.
3. Renovação do modo kiosk: token rotativo de longa vida, armazenado exclusivamente em cookie `Secure + HttpOnly + SameSite` e vinculado à estação e a uma prova do dispositivo; guardar somente hash/versão e estados no banco. Não gravar senhas, access tokens ou secrets em localStorage. Usar chave não exportável do navegador quando tecnicamente viável; não prometer segurança física absoluta apenas com IndexedDB.
4. Se navegador, banco ou serviço reiniciar, retomar exclusivamente se assinatura/prova da estação, confiança não revogada, operador/conta ativos e políticas forem válidos. Caso contrário, mostrar login sem destruir a tela do ANDON.
5. O modo kiosk não concede permissão de Admin, BI, Prioridades ou configurações apenas por ser confiável. A conta/provisão autorizada determina o escopo; operações sensíveis exigem login e reautenticação normais.
6. Revogação precisa sobreviver a reinício, revogar cookie + lease + sessões no banco, impedir refresh concorrente, invalidar por mudança de senha/usuário e registrar ator, alvo, motivo e carimbo UTC. Sem remoção dos chamados/atendimentos em andamento.
7. Evitar login humano com 30 minutos idle e 12h máximo em loop de automação; implementar separação formal de **sessão humana** e **presença operacional kiosk**, com contratos de API e testes de abuso.
8. Não confundir heartbeat de presença com renovação da sessão. Polling nunca deve prolongar sessão humana normal.
9. A confiança do dispositivo é uma escolha de segurança por terminal, não uma concessão de módulos da workstation. O Admin pode revogá-la mas não ampliar o acesso do perfil do usuário via toggle. Nenhum logout remoto deve revogar uma sessão válida do Admin principal, mesmo quando for em outro terminal.

## Portões de teste/implantação

- **G0:** PR #342 com CI verde Windows e Linux; corrigir contratos UI, traduções PT/EN/ZH e cenários de navegador; nenhum merge.
- **G1:** Homologação UX HML: R9-01 a R9-04 com banco fictício, screenshot e aceite.
- **G2:** Implementar backend seguro R9-05 a R9-08 em PR(s) pequenos, migrations/feature flag só HML e logs sem segredos.
- **G3:** CI verde, testes de concorrência e reautenticação, HML com dois browsers/terminais, rollback e auditoria.
- **G4:** Homologar notebook original `andon_db` **somente com novo backup validado e autorização explícita**.
- **G5:** Fábrica só após janela de manutenção, plano de reversão e aprovação formal; validar Node-RED, GPIO, Máquina 37 em ambiente controlado.

## Handoff obrigatorio para REFINE 9

Abrir planilha mestre (inclusive comentários/decisões), PR #342 e PR #341, checar SHAs/CI e ler este documento. Reproduzir estado HML sem mexer no operacional. A PR #342 ainda pode conter testes antigos pendentes; corrigir antes de liberar instalação HML. **NÃO marcar itens concluídos sem teste e aceite**.
