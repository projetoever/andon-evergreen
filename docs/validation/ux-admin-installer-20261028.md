# UX-01 — Refinamento visual da gestão de usuários e do assistente HTTPS

Data: 28/10/2026

## Objetivo e origem

Correções solicitadas após a homologação HTTPS em rede e verificação do cadastro
administrativo. O formulário de ativação de usuários apresentava rótulos e campos
visualmente próximos/sobrepostos em alguns tamanhos de tela. O instalador exibiu
a palavra `notebook` apesar de estar evoluindo para um produto instalável em
estações e servidores de diferentes clientes.

## Alterações incluídas

- Formulário de ativação do Admin reorganizado com cabeçalho, descrição e campos
  em blocos verticais com espaçamento explícito.
- Rótulos agora têm seus próprios elementos de texto e `leading` adequado,
  impedindo que a classe `space-y` dependa de nós de texto não-elementares.
- Entradas dimensionadas para toque, largura responsiva, senha pessoal descrita
  em contexto e botão responsivo.
- Termos comerciais do menu HTTPS adaptados a **ambiente de homologação em rede** e
  **estação de testes**, sem referência a equipamento específico.
- Documentação do assistente sincronizada com as alterações.
- Teste visual automatizado do primeiro cadastro do Admin em 1366×768 e 390×844:
  confirma separação vertical de rótulo/input, ausência de overflow e envio com sucesso.
- Regressão do PowerShell 5.1 proíbe o termo específico anterior.

## Preservação funcional

- Nenhuma alteração de schema, migrations, login, senha, token, API, CORS,
  certificados, host autorizado ou autenticação central.
- Os certificados de homologação continuam NÃO APROPRIADOS para servidor produtivo.
- Node-RED, mini PC, GPIO, máquina 37, watchdog e servidor Evergreen fora do escopo.

## Aceite antes de merge

1. CI: PowerShell Windows 5.1, backend, usuários HTTPS, frontend e testes de navegador.
2. Capturas desktop/mobile sem sobreposições e com espaço adequado para textos PT/EN/ZH.
3. Revisão de PR e ausência de regressões.
4. Aprovação explícita antes do merge. Atualização de notebook somente em etapa separada.

## Próximos PRs previstos

- UX-02: Central de certificados/DNS com exportação pública para TI e monitoramento.
- SEC-03: autorização operacional por usuário/máquina nas APIs e login único.
