# REFINE 7 — Restaurar menu operacional original (correcao 04/11/2026)

Esta revisao **substitui** a estrategia da opcao 15 e o desvio de runtime criado no PR #337.
O instalador nao deve selecionar rotinas operacionais alternativas a partir da mera
presenca de arquivos de homologacao.

## Contrato unico de operacao — Windows cliente e Windows Server

- **2 — Atualizar pela main:** atualizador oficial `update-andon-server.ps1`.
  Preserva banco/configuracao e executa sincronizacao, pipeline, migrations,
  build, tarefas e health, conforme ambiente. Nao muda transporte por conta propria.
- **4 — Iniciar ANDON:** `start-andon.ps1` -> `Start-AndonRuntime` ->
  watchdog oficial -> PostgreSQL -> API -> frontend -> kiosk (quando aplicavel).
  Se watchdog/API/frontend nao ficar pronto, **retorna codigo 1** e exibe falha.
- **5 — Parar ANDON:** `stop-andon.ps1` -> `Stop-AndonRuntime
  -PromptAutoStart`; controla tarefas boot/watchdog/kiosk, processos do ANDON
  e politica de reinicio temporario. Nao apaga banco.
- **6 — Verificar saude:** `health-check-andon.ps1` ->
  `Invoke-AndonHealthCheck -Full`, com banco, HTTPS/API, frontend, tarefas.
- **14 — Configurar HTTPS:** assistente existente com validacao e rollback.
  HTTPS e **persistido em `andon-config.json`**, e a opcao 4 respeita
  automaticamente `transportMode=http|https`. Certificados locais apenas
  para Windows cliente; no Server, usar certificado de rede confiavel.
- **15:** removida, nao deve retornar.

A escolha do modo HTTPS por 14 e pontual, nao precisa ser repetida a cada
reinicio. A opcao 4 nao usa banco isolado `55432` nem o script experimental
`Start-AndonHttpsHomologation.ps1`, mesmo que os arquivos antigos permaneçam
no diretorio `.andon-homologation`. Essa separacao previne acionamentos
silenciosos e preserva o banco operacional definido pela configuracao principal.

## Transicao de uma instalacao local com menu antigo PR #337

1. No menu **antigo**, a opcao 2 ainda pode entrar no atualizador local
   `ATUALIZAR_NOTEBOOK.ps1` se existir perfil HTTPS experimental anterior.
   Essa ultima execucao atualiza `main` e sincroniza menu, start, stop,
   health **e AndonInstaller.Runtime.ps1** em
   `C:\web-andon-industrial\installer`; preserva copias dos arquivos.
2. Fechar inteiramente o menu e abrir de novo. Confirmar a ausencia de
   opcao 15. O menu novo usa somente o atualizador oficial na opcao 2.
3. Se `Transporte configurado` mostrar HTTP legado, usar opcao **14 → 2
   (HTTPS LOCAL)** uma unica vez, somente no Windows cliente. Requer
   certificados mkcert confiaveis, sem liberar rede industrial.
4. Opcoes 5 e 4 voltam ao ciclo original. O teste de HTTPS local sera em
   `https://127.0.0.1:8080/hub` e
   `https://127.0.0.1:3001/health/ready`, caso HTTPS tenha sido
   configurado e a API/backend esteja saudavel.
5. Se o menu mostrar porta 5432 livre com `databaseMode=docker`, nao
   concluir que o watchdog esta saudavel: o container PostgreSQL da
   instalacao principal pode estar parado. O watchdog de 4 verifica e
   tenta iniciar o container oficial. Se Docker nao responder, o codigo
   de saida sera diferente de zero; conferir logs sem apagar volumes.
6. **A seguranca central pode continuar desligada** apos habilitar HTTPS:
   o assistente 14 deliberadamente nao habilita escrita central no piloto
   industrial. O mecanismo de login/permissoes exige habilitacao separada
   e homologacao isolada antes de qualquer aplicacao na Evergreen.

## Regressao e seguranca

O gate Windows testa comportamentalmente o runtime com mocks:
watchdog falho -> nao inicia; API sem readiness -> nao inicia kiosk; frontend
indisponivel -> nao inicia kiosk; sucesso -> segue ate kiosk; parada -> tarefas
oficiais de boot/watchdog/kiosk e politica de proximo boot preservadas.

As mudancas de `main` nao sao implantadas automaticamente na Evergreen.
Nao fazer reset de banco, reinstalacao limpa, troca de senha ou remocao
de certificados para contornar erros.
