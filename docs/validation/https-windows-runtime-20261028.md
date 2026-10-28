# HTTPS-2 — homologação no notebook Windows 11

Escopo desta entrega: integrar TLS ao runtime compilado e ao menu oficial sem alterar a Evergreen.
O modo inicial e de rollback continua sendo HTTP, e `ANDON_CENTRAL_ACCESS_ENABLED` permanece
desligado. Banco, credenciais, workstations, módulos, perfil do Chrome e portas existentes são
preservados.

## Atualizar e preparar o certificado

Somente depois do merge autorizado, no notebook com o ANDON parado:

1. Faça o backup habitual e execute `ABRIR_MENU_ANDON.bat` como Administrador.
2. Use **2 — Atualizar pela main**. A atualização não executa seed e preserva o banco/configuração.
3. Gere ou selecione manualmente um certificado confiável para o nome que será aberto no Chrome.
   Para homologação local, uma opção é instalar `mkcert`, executar manualmente `mkcert -install` e
   gerar certificado para `localhost`, `127.0.0.1` e `::1`. O ANDON não cria nem confia em uma CA.
4. Mantenha os arquivos PEM fora do repositório.

## Ativar HTTPS

1. Confirme que o ANDON está parado com **5 — Parar ANDON temporariamente**.
2. Use **14 — Configurar transporte HTTP/HTTPS** e selecione HTTPS.
3. Informe `127.0.0.1` como host no notebook (também incluído no certificado), o certificado PEM
   e a chave privada PEM. Manter o mesmo host usado pelo kiosk HTTP permite transportar o cookie
   canônico e preservar o UUID da workstation na mudança de esquema.
4. O configurador valida período, host, par certificado/chave e cadeia confiável do Windows. Depois
   copia o par para `C:\web-andon-industrial\tls` com acesso restrito a Administradores e SYSTEM.
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
