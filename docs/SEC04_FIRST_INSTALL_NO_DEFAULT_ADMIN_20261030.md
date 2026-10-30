# SEC-04/2V — Primeira instalação sem senha administrativa padrão

Data: 30/10/2026 — mudança solicitada para futuras instalações comerciais.

## Decisão e ameaça evitada
Antes deste ajuste, quando `SystemSettings.adminPasswordHash` estava vazio, o backend autenticava `admin/123456`. Isso permitia tentar adivinhar a credencial de uma instalação recém-exposta na LAN. O código agora **nunca** autentica qualquer senha enquanto o hash estiver vazio. Instalações com um hash existente mantêm a senha e a recuperação existentes; nenhum reset ocorre.

Na primeira abertura do Hub em modo API, se `GET /api/admin-auth/status` indicar `passwordConfigured=false`, o sistema exibe a configuração inicial e **não mostra o painel de módulos no Hub** até o cadastro da senha global. A página apresenta um aviso para usuários remotos; apenas o navegador no **próprio servidor**, acessando frontend via `localhost`, recebe um token temporário de configuração.

O fluxo local:
1. Instalação limpa e seed sem credenciais de Admin; nenhum valor `123456` é configurado.
2. No servidor, abrir o Hub pela origem local permitida. Para HTTP: `http://localhost:8080/hub`. Para HTTPS: certificado válido para `localhost` e origem `https://localhost:<frontendPort>` explicitamente autorizada (sem ignorar erros do TLS).
3. Informar e confirmar a nova senha Admin global de 8–128 caracteres (12+ recomendado). Bloqueio de senha comum e repetição. Sem preenchimento automático.
4. O navegador recebe `setupToken` aleatório de 256 bits, restrito ao IP real de loopback, cabeçalho Host loopback e Origin localhost em CORS, de validade 10 minutos; o servidor guarda somente o SHA-256 desse token, não o valor em log/banco. POST aceita apenas os campos token e senha.
5. O banco faz update condicional `adminPasswordHash IS NULL` e registra `admin.global_password.initialized` **na mesma transação**, com concorrência resolvida pelo lock na linha global. Após sucesso o token é invalidado. Novo pedido retorna que a senha já existe. A senha é salva como hash scrypt com salt aleatório, nunca em texto.
6. A tela libera o Hub após confirmação. A credencial global já funciona para login Admin legado.

## Relação com o Admin central
**Este PR estabelece a senha Admin global legada e remove a senha de fábrica**. O login central (`/api/access`) conserva seu cadastro específico por ora; ao habilitá-lo, o sistema utiliza a senha global configurada para validar a inicialização da **única conta Admin central**, cuja senha pessoal continua independente, segundo a regra SEC-04/2T. Não há criação silenciosa de contas centrais, quebra de login existente, alteração de flags ou desativação do legado. A unificação final das credenciais exige uma evolução e homologação próprias.

## Proteções, compatibilidade e limitações
- Nenhum cliente da rede pode configurar a senha pela API. Origin/Host falsificados não substituem o IP real local. Cabeçalhos `X-Forwarded-For` e `X-Forwarded-Host` não são aceitos como identidade. **Não habilitar Fastify `trustProxy` indiscriminadamente**.
- HTTPS local exige certificado com SAN localhost válido. O instalador deve garantir esse pré-requisito ou orientar a configuração inicial por procedimento local antes de publicar o acesso HTTPS; nunca desabilitar verificação TLS.
- Instalações existentes com hash têm comportamento inalterado. Instalações antigas que ainda dependiam do fallback `123456` (hash ausente) serão tratadas como **não inicializadas**, exigindo primeiro cadastro local controlado antes de atualizar em produção.
- A tela do Hub não equivale a um firewall; é necessário instalar em rede protegida, controlar URL direta e garantir política de acesso dos demais endpoints. **A validação de bloqueio de operações sem configuração global deve constar da homologação comercial**, antes de exposição externa.
- Somente a senha global inicial é criada; a recuperação permanece pelo código de recuperação do Admin quando já configurada.
- Local/demo frontend sem API não deve ser confundido com instalação comercial.
- O instalador HTTPS preserva origem pública e adiciona somente `localhost`/127.0.0.1 do mesmo protocolo à allowlist CORS; CORS não autoriza o setup sem as verificações de loopback.

## Testes exigidos
- `initialAdminSetup.test.ts`: IP remoto, Host malicioso, Origin não local e localhost confiável.
- `validate-initial-admin-setup-pg.mjs` no banco isolado `/andon_test`: sem hash, `123456` rejeitado, acesso remoto e Host negados, token inválido, senha fraca, sucesso com 8 caracteres, hash persistido, repetição negada, login após cadastro e audit sem segredos.
- Regressão do teste PR com senha isolada provisionada e SEM `123456`.
- CI Windows PowerShell/instalador, backend, PostgreSQL, HTTPS, frontend, navegador e i18n.
- Testar manualmente no notebook com rede desconectada antes da distribuição comercial. **Nenhum deploy** no servidor da Evergreen ou Máquina 37 durante esta fase.
