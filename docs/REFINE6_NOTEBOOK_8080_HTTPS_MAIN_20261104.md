# REFINE 7 — Fluxo normal do Menu ANDON com HTTPS

Data: 04/11/2026. Atualiza o roteiro anterior REFINE 6. **A opcao 15 foi eliminada.** O ambiente local de testes usa o mesmo menu cotidiano da instalacao industrial: 2 atualiza, 4 inicia, 5 para, 6 verifica a saude. Nenhum perfil HTTPS de testes e ativado no Windows Server da Evergreen.

## Computador local de homologacao (Windows cliente)

- **2 — Atualizar pela main:** valida origem Git e working tree, atualiza com fast-forward, para somente o perfil local identificado e sincroniza menu/start/stop/health instalados em `C:\web-andon-industrial\installer` com verificacao SHA-256 e backups. A opcao 2 nao inicia uma segunda instancia; apos atualizacao, **feche e abra novamente o menu** para carregar os scripts novos.
- **4 — Iniciar ANDON:** se o perfil HTTPS local isolado ja estiver configurado (arquivos `.andon-homologation/config.json` e certificados locais validos), usa `https://localhost:8080/hub` e `https://localhost:3001/health`. Caso contrario, usa o transporte que estiver em `andon-config.json` (nao ativa HTTPS automaticamente).
- **5 — Parar ANDON:** encerra o perfil ativo sem apagar bancos/certificados, ou usa o fluxo tradicional se o perfil de homologacao nao existir.
- **6 — Verificar saude:** exige resposta do Hub e da API HTTPS. Nao declara sucesso apenas por um processo ter iniciado.
- **14 — Configurar HTTPS:** assistente existente para a instalacao habitual. Nao cria chaves de CA corporativa nem modifica o DNS.

O perfil local isolado e **sempre** Windows cliente e usa PostgreSQL `andon_https_hml` em `127.0.0.1:55432`, Node compilado, loopback para API/frontend e certificado local mkcert. O proprio perfil ativa as operacoes centrais e paleta somente no banco de homologacao; nao conecta hardware nem habilita integracao fisica PLC/Node-RED/GPIO. O banco da instalacao anterior nao e substituido e seus dados nao migram automaticamente.

Para nao repetir o problema de que a opcao 15 retornava sucesso mas nao deixava nada acessivel, o launcher foi alterado: `npm run build` gera a API e o frontend, **processos node.exe compilados** ficam rastreados individualmente, a inicializacao valida as duas URLs duas vezes e nao declara sucesso se API/frontend morrerem logo apos subir. Falha de bind, TLS, migracoes ou build nao e mascarada; consultar `.andon-homologation\api-error.log` e `frontend-error.log`.

## Servidor industrial Evergreen (Windows Server)

- **2** preserva o atualizador industrial existente; possui backup, sincronizacao, build, migrations controladas, reinicio, health e regras proprias.
- **14** configura HTTPS de rede com certificado que os clientes de fabrica confiem, host/IP validado, TLS e transacao de rollback. Credenciais admin/Node-RED/GPIO devem ser homologadas separadamente antes da ativacao central industrial.
- **4** ja usa `transportMode=http|https` da configuracao industrial e inicia pelo watchdog oficial (API e frontend compilados), sem usar o banco de testes local.
- **5 e 6** preservam a parada e verificacao oficiais.

**Nao ha deploy automatico.** Nenhum dado, workstation, Maquina 37, mini PC, Node-RED, GPIO, CLP ou servico na fabrica foi alterado.

## Aceite rapido no Windows cliente

1. Opcao 2, conferir SHA da main e copia dos scripts, sair completamente do menu e abri-lo de novo. Opcao 15 deve desaparecer.
2. Opcao 4, aguardar compilacao e checks HTTPS, entrar em `https://localhost:8080/hub`, verificar `https://localhost:3001/health`.
3. Opcao 6: ambas as URLs prontas; opcao 5 para; opcao 4 reinicia sem Git pull.
4. Autenticacao central, usuarios e acessos, workstations, integracoes API de leitura, dashboard, BI, i18n e perfis visuais. Confirmar que nao ha chamadas/BI em banco de fabrica.

Se a opcao 4 falhar, **nao** executar instalacao limpa, reset Prisma, `taskkill` generico ou sobrescrever `andon-config.json`; usar as mensagens do launcher e logs para uma correcao cirurgica.
