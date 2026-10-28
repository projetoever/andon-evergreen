# HTTPS-2 — homologação no notebook Windows 11

Escopo desta entrega: integrar TLS ao runtime compilado e ao menu oficial sem alterar a Evergreen.
O modo inicial e de rollback continua sendo HTTP, e `ANDON_CENTRAL_ACCESS_ENABLED` permanece
desligado. Banco, credenciais, workstations, módulos, perfil do Chrome e portas existentes são
preservados.

## Atualizar e preparar o certificado

Somente depois do merge autorizado, no notebook com o ANDON parado:

1. Faça o backup habitual e execute `ABRIR_MENU_ANDON.bat` como Administrador.
2. Use **2 — Atualizar pela main**. A atualização não executa seed e preserva o banco/configuração.
3. Na opção 14, selecione **2 — HTTPS local assistido**. O ANDON solicita sua autorização
   antes de instalar/confiar numa CA local e gera automaticamente certificado e chave. Se `mkcert`
   não existir, oferece instalação via `winget`, com consentimento.
4. Para **HTTPS de rede**, selecione a opção **3** e forneça certificado confiável da
   empresa (nome/IP e par PEM). Não use a CA local do `mkcert` na Evergreen.
5. Para detalhes e limitações, veja `docs/HTTPS_ASSISTED_SETUP.md`.

## Ativar HTTPS

1. Confirme que o ANDON está parado com **5 — Parar ANDON temporariamente**.
2. Use **14 — Configurar HTTPS (assistente)** e escolha **2 — HTTPS local assistido**.
3. O assistente utiliza `127.0.0.1` e gera o certificado sem solicitar caminhos PEM.
   Manter o host usado pelo kiosk anterior ajuda a preservar a identidade da workstation.
4. O configurador valida período, host, par certificado/chave e cadeia confiável do Windows. Antes
   de copiar a chave, cria uma área transacional restrita exclusivamente a Administradores e SYSTEM
   e comprova essa ACL. O par anterior e as configurações permanecem preservados até a conclusão.
5. Use **4 — Iniciar ANDON**. API, frontend compilado, watchdog, health check e Chrome Kiosk passam
   a usar o mesmo esquema e host configurados.
6. Use **6 — Verificar saúde** e acesse Hub, ANDON, BI, Prioridades e Administração.

O frontend oficial não usa `vite dev` nem `vite preview`: `scripts/serve-frontend.mjs` serve os
artefatos `dist/client` e `dist/server`. Isso elimina a chamada incompatível
`res.setHeaders(...)` do Preview TanStack e continua reproduzível depois de `npm ci`.

## Rollback para HTTP

1. Pare o ANDON pela opção 5.
2. Abra a opção 14, selecione **HTTP legado** e confirme.
3. Inicie novamente pela opção 4 e execute o health check pela opção 6.

O rollback não remove certificado, banco nem dados; apenas volta as URLs, CORS, API, frontend,
watchdog e kiosk para HTTP. Os contratos de API não foram alterados. Clientes industriais reais
não devem ser apontados ao notebook HTTPS nesta homologação; a mudança de esquema exige validação
posterior específica antes de qualquer ativação na Evergreen.

Se qualquer gravação de configuração, rede, `.env`, ACL ou certificado falhar, a transação restaura
automaticamente o estado anterior. Pares TLS ativados com sucesso usam diretórios versionados; o
configurador nunca sobrescreve o certificado ou a chave que sustentavam a configuração anterior.

## Checklist manual de homologação

- certificado confiável sem aviso no Chrome e URL correspondente ao host configurado;
- iniciar, parar, reiniciar, health check e recuperação pelo watchdog;
- Hub, ANDON, BI, Prioridades e Administração;
- abertura, atendimento, acompanhamento e conclusão de chamado somente em banco isolado;
- cookies `Secure`, CORS/CSRF e origem inválida rejeitada;
- estação mantém seu UUID e permissões; autenticação central continua desligada;
- reinício do Windows recupera API, frontend e kiosk pelas tarefas existentes;
- rollback HTTP restaura o comportamento anterior sem perda de dados.

Não usar dados, certificados, credenciais ou endpoints da Evergreen nesta homologação.
