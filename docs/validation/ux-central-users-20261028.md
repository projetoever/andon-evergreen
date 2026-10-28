# UX-02 — Clareza do primeiro acesso e painel de colaboradores (28/10/2026)

## Diagnóstico
A tela "Habilitar gestão de usuários" é a etapa de inicialização **única**
do administrador central, não o cadastro de colaboradores. O CRUD já existe
em `UsersAccessSettings` (PR #211, aprimorado pelo #218). Com a sessão do
Admin principal autenticada em HTTPS, o painel exibe listagem, pesquisa,
cadastramento e edição, máquinas, módulos e permissões.

## Refinamento desta etapa
- Explicita "Etapa 1 de 2 — Configuração do administrador" e antecipa o
  cadastro de colaboradores como passo seguinte.
- Diferencia a ação de criar o administrador da troca de senha de um usuário.
- Mostra título/explicação do painel de colaboradores após autenticação.
- Inibe abertura do cadastro antes do carregamento do catálogo de permissões
  (sem alterar requisitos ou chamadas de backend).
- PT/EN/ZH e regressão em navegador real para 1366x768 e 390x844.
- Mantém o controle de acesso atual, inicialização única, CSRF, HTTPS, senha
  administrativa existente e sessão autenticada.

## Atenção
- A criação do Admin não habilita `ANDON_CENTRAL_ACCESS_ENABLED`.
- O cadastro de usuários **não** significa autorização operacional de ações
  enquanto a Fase B ainda estiver incompleta.
- Nenhum merge, deploy, migration, seed, banco de produção, mudança em
  certificados/firewall, Node-RED, mini PC, GPIO ou Máquina 37.
- Testes automatizados (incluindo CI) e homologação manual em ambiente de
  ensaio devem preceder qualquer integração.
