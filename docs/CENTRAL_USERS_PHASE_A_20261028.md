# Gestão central de usuários — Fase A (2026-10-28)

> **Atualização SEC-04/2T — 30/10/2026:** o mínimo de senha **pessoal central** passou de 15 para **8 caracteres** (máximo 128), com bloqueio de senhas muito comuns/repetitivas e recomendação visual de 12 ou mais. Esta atualização não modifica hashes já criados nem a senha do Admin legado, cuja política permanece própria. Na inicialização, a nova senha deve diferir da senha legada fornecida. A conta Admin principal central é criada uma única vez com o login escolhido; não se cria uma segunda conta Admin central. Durante a migração, continuam coexistindo **duas credenciais independentes**: Admin legado (somente funções anteriores ainda não migradas) e Admin central (Hub, ANDON e BI no modo central). A credencial legada só poderá ser desativada após migração, verificação de recuperação de acesso, teste no notebook e autorização de rollout. A alteração não habilita a flag `ANDON_CENTRAL_ACCESS_ENABLED`, não migra dados industriais e não ativa funções sensíveis.


## Escopo deste PR

Início da evolução de login único do ANDON Web Industrial. Esta fase prepara o cadastro,
a inicialização da conta principal e a administração de permissões sem ativar a autorização
central de módulos. A migração das credenciais antigas e a proteção das rotas operacionais
são escopos posteriores.

### Inicialização do Admin principal

No primeiro acesso a `/hub/admin?section=users`, em HTTPS confiável e workstation ativa:
1. O administrador escolhe **usuário (identificador de acesso)** (3–120 caracteres, `a-z`, `0-9`, ponto,
   traço e sublinhado; normalizado para minúsculas).
2. Confirma a senha administrativa já configurada.
3. Cria e confirma uma frase de acesso pessoal com 15–128 caracteres.
4. A API exige os três campos e inicializa a conta principal **apenas uma vez**,
   mediante transação com bloqueio no PostgreSQL, senha armazenada como hash e
   auditoria. O administrador passa a entrar com o usuário escolhido.

Instalações **já inicializadas** não têm login ou hash alterados automaticamente.
A senha Admin legada segue existente nesta fase para compatibilidade/recuperação,
sem ser apresentada como credencial unificada após a ativação futura.

### Criação dos demais usuários

- Nome de exibição e usuário único.
- Conta de pessoa ou registro inativo de kiosk.
- Perfil descritivo, escopo de máquinas e permissões granulares.
- Sugestões explícitas de permissão para Gestor/Gerente, Líder, Manutenção e Produção.
  A seleção do perfil **não** concede permissões automaticamente; o botão de
  sugestões substitui escolhas anteriores e exige revisão antes de salvar.
- Controle visual específico para entrada em ANDON, BI e Prioridades.
- O mecanismo existente gera senha provisória aleatória de exibição única,
  validade de 24 horas e uso único; o primeiro login permite somente troca obrigatória
  da senha. Somente hashes são persistidos. Reset administrativo requer reautenticação
  recente, revoga sessões e exige justificativa.

Os direitos atribuídos serão aplicados às rotas operacionais somente após a
implementação completa de autorização (Fase B), incluindo filtros por máquina
e revogação de credenciais de módulo como alternativa de login.

## Restrições

- `ANDON_CENTRAL_ACCESS_ENABLED` permanece **desligado** por padrão.
- Nenhuma migration, seed, reset ou alteração de banco produtivo neste PR.
- Não mudar o servidor Evergreen, Node-RED, mini PC, GPIO ou Máquina 37.
- Não ativar contas de kiosk no fluxo de pessoa nem usar login humano como identidade
  de serviço industrial.
- Não remover senhas antigas de ANDON/BI/Prioridades antes de homologar a autorização
  de todas as rotas no modo central e a compatibilidade com os consumidores industriais.

## Testes necessários

- Backend HTTPS com PostgreSQL isolado: campo usuário obrigatório, login inválido,
  escolha com maiúsculas normalizada, senha antiga incorreta e inicialização única.
- Fluxos existentes: senha provisória, primeira troca, reset e revogação de sessão.
- Interface: módulo ANDON/BI/Prioridades, sugestões aplicadas explicitamente e
  possibilidade de personalizar permissões.
- Interface PT/EN/ZH, responsividade, sessão e regressões.
- Não ativar modo central operacional no notebook até a Fase B estar concluída.
