# REFINE19 UX-SEC-21 — Acesso administrativo restrito por notificação discreta

## Situação
Captura do notebook: navegar para `/hub/admin` ou `?section=users` sem sessão Admin principal fazia aparecer uma página isolada com cartão "Acesso administrativo restrito". O operador pediu consistência com os demais avisos compactos no canto inferior direito.

## Implementação
- Hub com acesso central habilitado: clicar Administração do Hub enquanto não há principal normal não navega; usa toast padrão localizado.
- Deep-link direto /hub/admin sem autorização principal/gerencial: não renderiza painel protegido; redireciona com `replace` para `/hub` e notifica por Sonner no canto inferior direito.
- Gestor com acesso gerencial de leitura: URL para `?section=users` ou outra seção restrita redireciona para visão geral permitida com toast. Nenhum componente de edição de usuário/workstation é montado.
- Inicialização da conta Admin principal e seu gate de aprovação de workstation permanecem distintos.
- Não iniciar login automático nem ampliar direitos; form de autenticação continua no Hub.

## Segurança
O backend GET /session e os endpoints seguem como fonte única de autorização. Não usar roleLabel, senha legada, armazenamento local ou URL como credencial. Nenhuma mudança DB, ACL, flags ou equipamentos.

## Testes
Regressão UX-SEC-21 em tests/hubCentralAdmin.test.ts; frontend, SSR e Windows CI. Validar no notebook: URL direta sem login, URL de usuários com perfil Produção, usuário Gestor com acesso gerencial de leitura em aba indevida, Admin principal logado acessando normalmente, idiomas e mobile. Sem homologação presumida.
