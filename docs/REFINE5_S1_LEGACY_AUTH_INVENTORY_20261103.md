# REFINE 5 — S1/1: inventário de autenticações legadas e bloqueio de login duplicado

**Data:** 03/11/2026. **Base auditada:** `main` em `d7984c051f9a4a9fe18c29aff3a43d9a3e601d02`.
**Escopo desta fatia:** somente impedir a emissão de novos tokens Admin legados em `ANDON_CENTRAL_ACCESS_ENABLED=1`; preservar o modo legado/industrial. **Não é migração completa da senha Admin. Não implantar na fábrica.**

## Mecanismos coexistentes

| Mecanismo | Fonte de verdade | Endpoints e dependências | Condição central / decisão S1 |
|---|---|---|---|
| Admin global legado | `SystemSettings.adminPasswordHash`; token Bearer em memória (8 h) | `POST /api/admin-auth/login`, `PUT /api/admin-auth/password`, `POST /api/admin-auth/recovery-code`, `POST /api/admin-auth/recover`, `POST /api/admin-auth/logout` | Nesta fatia, **login** retorna `403 legacy_admin_login_disabled` em modo central, sem consultar hash nem emitir token; modo central OFF preservado. Recuperação e senha global exigem migração própria |
| Primeiro setup da instalação | `SystemSettings.adminPasswordHash` e token de bootstrap local de uso único | `GET /api/admin-auth/status`, `POST /api/admin-auth/initialize` | Continuidade obrigatória para instalação limpa, sem `123456`. `enforceInitialAdminSetup` nega acesso à API antes da inicialização |
| Admin humano central | `AccessUser`, `AccessSession`, cookie `__Host-andon-access` | `/api/access/initialize`, `login`, `session`, `interaction`, `password`, `logout`; administração de usuários e estações | `/api/access/initialize` ainda chama `verifyAdminPassword(currentPassword)` durante o primeiro cadastro. **Este é um bloqueio real** para eliminar o hash global |
| Senhas de ANDON e BI | `ModuleCredential`; tokens por módulo em memória (8 h) | `GET /api/modules/credentials`, `PUT /api/modules/:module/credentials`, `POST /api/modules/:module/login`, `logout` | Em central ON, leitura operacional utiliza sessão central e ACL; escritas e login redundantes não devem ganhar bypass. Remover armazenamento/rotas apenas após inventário S3 |
| Senha de Prioridades | `DashboardPriorityConfig`, token próprio | `GET /api/dashboard-priority/access-status`, `PATCH /api/dashboard-priority/access-policy`, `PUT /api/dashboard-priority/credentials`, `POST /api/dashboard-priority/login`, `logout` | Ler ordem em modo central já dispensa a senha adicional; escrita requer ACL específica. Migrar configurações/credenciais antes de eliminar token |
| Identidade de serviço industrial | Cliente não humano, token de serviço | `POST /api/service-auth/token`, leituras escopadas | NÃO substituir por login humano; inventariar Node-RED M37/mini PC GPIO e testar integração física em S4 |

## Inventário de rotas protegidas por Admin legado

O catálogo autoritativo de rotas históricas está em `server/src/security/adminAuthorization.ts:isAdminProtectedMutation`. Abrange:
- Configuração de módulos e credenciais: `/api/modules/settings`, `/api/modules/credentials`, `/api/modules/:module/credentials`;
- Configurações e diagnósticos: `PATCH /api/system-settings`, `GET /api/diagnosis-audit`, credenciais de Prioridades e política de acesso, `GET /api/workstations`;
- Senha e recuperação administrativa: `PUT /api/admin-auth/password`, `POST /api/admin-auth/recovery-code`;
- Catálogos/cadastros: técnicos, classificações, máquinas, turnos, conjuntos, subconjuntos e tipos; criar/editar/excluir conforme padrão de rota no catálogo.

A existência de uma rota no inventário **não** significa que esteja migrada. No modo central, `enforceWorkstationAccess` permite somente adaptadores de escrita individualmente habilitados por flags, origem HTTPS, sessão, workstation, permissões, CSRF e revalidação transacional. O único bypass do hook Admin legado é por request com marcador específico aprovado, nunca pelo rótulo Gerente/Admin.

## Evidência da primeira correção (S1/1)

- `server/src/routes/adminAuth.ts`: rejeita `POST /api/admin-auth/login` com central ON antes de ler a senha, sem token e com `Cache-Control: no-store`. Central OFF preserva autenticação antiga.
- `server/src/security/centralSingleLogin.test.ts`: simula credencial válida e confirma 403 sem consulta ao hash em central ON, 200 com token em central OFF e 401 para senha inválida.
- O bloqueio **não** altera `verifyAdminPassword` nem `/api/access/initialize`; portanto não quebra o cadastro inicial do Admin central e não revoga credenciais já existentes no modo legado.

## Gates pendentes antes da desativação definitiva da senha antiga (S1/2+)

1. Inventariar acessos reais de navegador, scripts instalador, kiosk, rotas e integradores; identificar dependências de token Admin e recuperação.
2. Migrar cada configuração/catálogo administrativo ainda legado para sessão central, com ACL por ação e escopo, CSRF, revalidação dentro da transação, auditoria e rollback. Rota não migrada deve falhar fechada com central ON.
3. Migrar `/api/access/initialize` e o primeiro acesso comercial para um único bootstrap seguro com uma única credencial humana, sem abrir bootstrap remoto ou reabilitar senha previsível.
4. Planejar recuperação e revogação de tokens legados sem bloquear operadores da Evergreen; nunca remover hash global sem backup, recuperação ensaiada e compatibilidade comprovada.
5. Verificar 30 min de inatividade, 12 h máximas, reautenticação Admin após 5 min, duas workstations, estados bloqueada/pendente, revogação, perda de rede, idiomas PT/EN/ZH-TW.
6. CI Windows/PG/frontend/Playwright verde e homologação HTTPS no notebook com dados fictícios. Aprovação separada e backup/rollback antes de qualquer atualização industrial.

**Registro histórico de S1/1:** naquela etapa `/api/admin-auth/recover` ainda emitia token legado após recuperação, e não foi alterado. A correção subsequente S1/2 está descrita abaixo. Não anunciar autenticação única completa.


## Continuidade S1/2 — recuperação global sem token Admin duplicado

- No modo central, `POST /api/admin-auth/recover` conserva o uso do código de recuperação global e invalida o código utilizado, **mas não emite token Bearer Admin legado**, nem horário de expiração dessa sessão. A credencial central permanece independente.
- Em modo legado, recuperação válida continua retornando a sessão antiga para não interromper o piloto instalado.
- `/api/admin-auth/recover` e `/api/admin-auth/recovery-code` agora respondem com `Cache-Control: no-store` para impedir caching de respostas sensíveis.
- O consumo do código usa atualização **atômica e condicional** (`WHERE adminRecoveryCodeHash = hash verificado`); duas requisições simultâneas não podem concluir com o mesmo código.
- Teste automatizado cobre código inválido, sucesso central sem token, consumo único sob concorrência, novo hash salvo e compatibilidade da recuperação legada.
- **Atenção:** este passo NÃO elimina a senha global, NÃO recupera a senha da conta humana central e NÃO resolve a duplicidade do bootstrap. Isso continua no S1/3, com mecanismo central de recuperação e migração por rota, antes de qualquer implantação.

## Continuidade S1/3 — reautenticação curta sem expirar a sessão central

**Cenário:** ao exigir confirmação para edição de usuários, revogação ou outra ação sensível, a verificação de cinco minutos deixa de depender exclusivamente da criação da sessão. Confirmar a senha atual no Hub não cria outra sessão nem renova as doze horas máximas.

- Migration **aditiva** `access_sessions.lastAuthenticatedAt TIMESTAMP(3) NULL`, com fallback de leitura para `createdAt` em sessões existentes.
- `POST /api/access/reauthenticate` usa o mesmo cookie HttpOnly e CSRF central, obriga HTTPS, Origin exato, workstation aprovada, sessão normal e Admin principal, além do limitador de tentativas de credencial. Sem resposta contendo token ou nova cookie.
- Revalida usuário, hash e sessão sob lock de usuário; `updateMany` condicional impede revalidar sessão revogada, inativa ou expirada. Apenas `lastAuthenticatedAt` é alterado na transação, com auditoria `access.admin.reauthenticated` e rollback diante de falhas.
- `assertRecentAdmin` considera o carimbo da última confirmação; **inatividade de 30 minutos, expiração absoluta de 12 horas, autorização do usuário, sessão e workstation não são ampliadas**.
- A tela de Usuários/Acessos passa a chamar o endpoint de confirmação ao receber `reauthentication_required`, em vez de reexecutar `/api/access/login` e criar uma nova sessão.
- Cobertura automatizada para senha incorreta, não-Admin, revogação durante lock, troca concorrente de senha, atualização recusada, falha de auditoria e imutabilidade da expiração.

**Limitações:** esta etapa não unifica a credencial global legada com a conta central; não migra bootstrap, catálogos ou senhas de módulos. Migration somente no repositório até validação e autorização de deploy. Para notebook isolado, testar reautenticação após mais de cinco minutos, confirmar que a mesma cookie/sessão permanece, e verificar revogação, escopo e a validade absoluta. Não alterar a fábrica.

## S1/4 — revogação preventiva das sessões Admin legadas

Na ativação do modo central, `readAdminSession` **recusa todos os Bearers legados** e limpa o cache em memória de sessões emitidas antes da ativação. Isso também impede que tokens antigos voltem a funcionar caso a aplicação retorne posteriormente ao modo legado sem reiniciar o processo. `createAdminSession` falha fechado enquanto `ANDON_CENTRAL_ACCESS_ENABLED=1`, impedindo que novos handlers emitam Bearers por engano.

- Protege as rotas administrativas existentes independentemente de a interface ocultá-las; em modo central uma rota ainda não migrada continua sem acesso por Bearer.
- O modo legado desligado mantém emissão de **novas** sessões pelo fluxo autenticado de costume. Os tokens anteriores à ativação central precisam de novo login após a reversão.
- A revogação é em memória do processo. Não confundir com revogação global de tokens persistidos de terceiros ou com a remoção do hash da senha antiga.
- Regressão: Bearer válido com central OFF, negado com central ON, não ressuscita após retorno a OFF, uma nova sessão autenticada no modo legado continua possível.
- **Ainda não é unificação final:** o primeiro cadastro central requer comprovação da senha global legada; recuperação central e migração assistida dessa credencial permanecem para S1/5+.

## S1/5 — recuperação da identidade central (fatia isolada)

Para não depender de uma segunda senha global no dia a dia, foi preparado um mecanismo **separado** de recuperação do Admin principal, sem reutilizar a recuperação legada. Um Admin principal autenticado com confirmação recente emite um código de 128 bits, mostrado uma única vez. Somente seu hash scrypt é persistido no próprio registro do Admin; a nova emissão substitui a anterior.

A recuperação exige que a requisição chegue pelo **socket de loopback real**, com Host localhost, Origin local autorizado, HTTPS, CSRF e workstation ativa/aprovada. Ela não aceita cabeçalhos X-Forwarded como prova de origem local. O código é verificado novamente sob lock de usuário dentro de transação; o consumo é condicionado ao hash atual, troca a senha central, incrementa a versão de autorização, revoga todas as sessões existentes e registra a ação na auditoria. **Não emite cookie nem token de login**. O navegador deverá autenticar-se normalmente com a nova senha.

O código de recuperação deve ser guardado fora do sistema e testado previamente no notebook isolado. Uma instalação existente sem código gerado não passa a ter recuperação automática e precisa de procedimento autorizado. Nenhum caminho de recuperação ignora o bloqueio de workstation ou habilita automaticamente permissões.

**Ainda não equivale ao S1 completo:** a senha global do instalador/bootstrap e as configurações legadas continuam independentes; somente após migrar cada rota, revisar rollback e comprovar recuperação será possível descontinuar esse segredo sem indisponibilidade. Não habilitar o modo central na fábrica com base apenas neste PR.

## S1/6 — primeiro acesso limpo, Admin central único (sem senha global)

Apenas com `ANDON_CENTRAL_ACCESS_ENABLED=1`, em **instalação realmente nova** (sem hash global, contas humanas cadastradas nem workstations), a tela local de configuração poderá cadastrar diretamente o Admin principal com uma senha de 8–128 caracteres, política forte e token local temporário. Uma única transação cria a conta humana `admin`, com hash scrypt e auditoria, **sem** persistir senha global legada, criar sessão automaticamente ou emitir Bearer.

- `/api/admin-auth/status` distingue instalações centrais virgens de instalações migradas; o setup central utiliza `POST /api/admin-auth/initialize-central`.
- O guard do servidor continua negando todas as outras APIs enquanto não existir Admin configurado. O setup central é permitido apenas a socket/Host/Origin localhost reais, com token de bootstrap de uma vez; a workstation só pode ser registrada depois da criação do Admin.
- Existindo qualquer senha global anterior, conta ou workstation, o novo setup recusa a operação. A migração de uma fábrica legada **continua exigindo prova da senha anterior**; nunca criar Admin de modo remoto ou encurtar o fluxo de migração.
- Com central ON, `/api/admin-auth/initialize` não gera a senha global paralela. Com central OFF, o bootstrap legado permanece exatamente como antes.
- **Rollback explícito**: se uma instalação nova, criada apenas com Admin central, voltar para `ANDON_CENTRAL_ACCESS_ENABLED=0`, o guard bloqueará APIs até a criação de uma nova senha legada **local e segura**. Não alegar reversão operacional instantânea: documentar, ensaiar e aceitar esse procedimento no notebook antes do piloto.
- Não instalar em produção antes de testar a condição de partida totalmente vazia, concorrência, senha inválida, reset, guarda inicial, duas workstations, recuperações e rollback.

## Separação operacional

`main` e PR integrados são código; CI é validação automatizada; notebook HTTPS é homologação; servidor Evergreen/M37 exige autorização de deploy independente. Esta mudança não altera PostgreSQL, migrations, PLC, Node-RED, GPIO, IPs, portas, flags instaladas nem dados reais.
