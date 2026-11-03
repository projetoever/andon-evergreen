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

**Observação:** `/api/admin-auth/recover` ainda permite redefinir a senha global sob código de recuperação e pode retornar um token legado. Nesta fatia esse caminho não é modificado: deve ser explicitamente redesenhado e coberto por testes negativos na próxima fase. Não anunciar autenticação única completa.


## Continuidade S1/2 — recuperação global sem token Admin duplicado

- No modo central, `POST /api/admin-auth/recover` conserva o uso do código de recuperação global e invalida o código utilizado, **mas não emite token Bearer Admin legado**, nem horário de expiração dessa sessão. A credencial central permanece independente.
- Em modo legado, recuperação válida continua retornando a sessão antiga para não interromper o piloto instalado.
- `/api/admin-auth/recover` e `/api/admin-auth/recovery-code` agora respondem com `Cache-Control: no-store` para impedir caching de respostas sensíveis.
- Teste automatizado cobre código inválido, sucesso central sem token, código de uso único, novo hash salvo e compatibilidade da recuperação legada.
- **Atenção:** este passo NÃO elimina a senha global, NÃO recupera a senha da conta humana central e NÃO resolve a duplicidade do bootstrap. Isso continua no S1/3, com mecanismo central de recuperação e migração por rota, antes de qualquer implantação.

## Separação operacional

`main` e PR integrados são código; CI é validação automatizada; notebook HTTPS é homologação; servidor Evergreen/M37 exige autorização de deploy independente. Esta mudança não altera PostgreSQL, migrations, PLC, Node-RED, GPIO, IPs, portas, flags instaladas nem dados reais.
