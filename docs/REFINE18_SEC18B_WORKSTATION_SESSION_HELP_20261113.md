# REFINE 18 — SEC-18B | Workstations: login persistente sem confusão

Data: 13/11/2026.

## Contexto
Após SEC-17B/SEC-18 (main commit 1fb86293), novos usuários são sempre Pessoa. O modo de confiança Kiosk continua dormente no backend e não deve aparecer como funcionalidade utilizável para Admin. A sessão operacional durável exige dois opt-ins independentes: política `persistent` na conta e autorização `allowPersistentOperationalLogin` na workstation fixa/aprovada.

## Ajustes (somente UI)
1. Ocultar cartão de status `Confiança Kiosk` em Workstations enquanto não há provisionamento seguro. Não remover tabelas, trilhas de auditoria, modelo de ameaça ou guardas servidor-side.
2. Explicitar na aba Workstations que habilitar o terminal NÃO basta: editar conta Pessoa em Usuários e Acessos com política de login persistente e permissões compatíveis.
3. Quando terminal permite persistência mas a última leitura não apresenta sessão persistente válida, exibir aviso orientando a conferir política da conta e entrar novamente.
4. Mostrar `Sessão sem expiração automática` no resumo apenas quando a sessão de último login permanece válida, não após logout/revogação.

## Aceite
- Workstation aprovada com switch ativado + conta standard: status não pode afirmar sessão durável.
- Conta persistent elegível + workstation permitida: após logout/login, estado mostra sessão válida durável.
- Revogação remota ou desativação da workstation: status perde indicação de sessão ativa.
- Kiosk não aparece como configuração nem opção de login.
- PT/EN/ZH e CI/SSR/testes UI. Nenhuma mudança na ACL, HTTP, banco ou fábrica.
