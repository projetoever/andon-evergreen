# REFINE 5 — S1/8: terminal Admin local confiável no primeiro acesso

**Data:** 04/11/2026 · Escopo: instalações **novas**, com `ANDON_CENTRAL_ACCESS_ENABLED=1`. Não afeta workstations e configurações existentes na Evergreen; não é deploy.

## Problema corrigido

Um primeiro setup central sem senha global criava a conta Admin humana, mas não vinculava um terminal inicial aprovado. Como o valor padrão anterior de `SystemSettings.requireWorkstationApproval` era `false`, novas workstations poderiam ser criadas como ativas imediatamente, antes do Admin definir a política. Isso tornava o fluxo inicial inconveniente e permissivo.

## Contrato corrigido

- O formulário de primeira configuração gera/recupera o UUID persistido **no próprio navegador local** (cookie/localStorage, com verificação de persistência). Caso não consiga preservar a identidade, o setup recusa a tentativa antes de enviar uma senha.
- `POST /api/admin-auth/initialize-central` agora exige `workstationId` validado no padrão `ws_<UUIDv4>`, além de HTTPS, socket/Host/Origin localhost reais, token temporário de uso único e senha forte. Nem cabeçalhos de proxy nem identificadores arbitrários substituem prova de localidade.
- Uma transação serializada exige banco ainda **sem conta e sem workstation**, grava `SystemSettings.requireWorkstationApproval=true`, cria o primeiro terminal com **`active=true`, `pendingApproval=false` e todos os módulos inicialmente desabilitados**, cria a conta Admin central e registra um audit event. Se algum passo falhar, nenhuma das alterações é confirmada.
- A workstation Admin inicial passa a poder acessar o gerenciamento central imediatamente com sua senha única. O Admin deve depois conceder módulos a terminais autorizados; o primeiro terminal não recebe acesso operacional, BI ou Prioridades por padrão.
- Os próximos terminais que chamarem a rota existente `POST /api/workstations/register` receberão `pendingApproval=true` e `active=false` enquanto a política estiver vigente. Admitir outros terminais continua exigindo o fluxo próprio de autenticação/autorização e aceite.
- Testes unitários e PostgreSQL isolado cobrem IDs inválidos, instalação antiga, origem remota, senha fraca, rollback de auditoria, primeiro terminal ativo restrito e terminal remoto pendente.

## Gates de homologação

1. Apagar cookies/localStorage **somente do ambiente de notebook de testes** e confirmar que a identidade do primeiro terminal é persistida após recarregar a página.
2. Instalar em banco fictício vazio com central ON, HTTPS local e sem senha global legada. Criar a única senha Admin, autenticar a conta `admin` no terminal local e abrir o Hub central.
3. Verificar que o primeiro terminal está aprovado, mas os módulos operacionais permanecem desligados por padrão. Verificar que o segundo navegador/dispositivo não é autoaprovado.
4. Testar recusa de UUID inválido, senha fraca, token vencido, navegador remoto, sessão ausente e múltiplos setups concorrentes.
5. Reverter apenas no notebook depois de backup verificável. Como não há senha global legada, um rollback para central OFF **não** deve destravar APIs sem novo bootstrap local seguro.
6. Não iniciar atualização industrial sem validação de Node-RED/GPIO e homologação geral S6.

**Decisão de compatibilidade:** a mudança é intencional apenas para uma instalação central completamente nova. Instalações legadas não são convertidas nem recebem modificação silenciosa da política de workstations.
