# UX-04 — Capa administrativa útil e credenciais diferenciadas

Data: 28/10/2026 — fase de produto/UX do plano #232.

## Problema
A Visão Geral do Hub mostrava apenas três estados pouco informativos (Hub ligado, sessão legada e sessão central independente). No primeiro cadastro de usuários, a interface sugeria que o Admin teria de criar uma nova senha cada vez que quisesse cadastrar alguém.

## Entrega
- A Visão Geral passa a consultar os registros reais de workstations, exibindo **registradas, aguardando aprovação, bloqueadas e vistas nos últimos 30 minutos**.
- Um heartbeat recente **não é** interpretado como dispositivo conectado, tela ANDON aberta, kiosk executando ou permissão efetiva. Essas funções demandam telemetria explícita em fase futura.
- Identifica workstations sem nome, pendências de aprovação e estações bloqueadas; fornece atalhos para Workstations, Usuários e Segurança, com atualização manual.
- Dados não disponíveis são `—` com aviso, nunca contagem fabricada. Hub e estações falham independentemente, sem ocultar o restante do painel.
- O acesso a essa página continua exigindo uma sessão Admin legado previamente validada; não adiciona endpoints nem autorizações.
- O primeiro cadastro do Admin central esclarece que a senha existente comprova o controle legado e uma **senha central pessoal, separada, é criada uma única vez** para a conta Admin central. Novos colaboradores têm suas próprias credenciais.
- A aba Segurança distingue as duas contas e deixa explícito que ali é alterada somente a senha Admin legada, não a central.
- Textos traduzidos para PT, EN e ZH tradicional, incluindo novos avisos e estados.
- Navegação e layout preservados para desktop e mobile.

## Segurança e limites
- Não unifica senhas nem modifica sua validação; isso depende da migração de endpoints de escrita para autorização central.
- Não apresenta política de senha expirada ou estado de presença online, pois ainda não existem sinais confiáveis para afirmá-los.
- Não altera módulos, senhas cadastradas, PostgreSQL, API, identidade UUID das workstations, Node-RED, GPIO ou TLS.
- Nenhum deploy no servidor piloto. Gestão central operacional permanece desativada.

## Homologação visual
CI com navegador em 1366x768 e 390x844: cards com 3 máquinas de teste (uma pendente, uma bloqueada, duas vistas recentemente), aviso sobre telemetria, botão de atualização, atalhos de navegação e distinção de senhas em Segurança e inicialização do Admin central. Teste sintético, sem consulta ao servidor Evergreen.
