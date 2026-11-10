# REFINE 12 — HML-H3 | Flags de homologação dos novos catálogos, sem herança de privilégios

Data: 10/11/2026. Base H2 #416 (inventário saneado) → #414 → #412 → #410 → #408 → #406 → #404 → E034 #385.

## Restrições
**Somente notebook Windows CLIENTE** e Docker Desktop local named pipe, PostgreSQL ISOLADO `andon_https_hml` em `127.0.0.1:55432`. Nunca usar servidor Windows Server da fábrica, `C:\web-andon-industrial\andon`, `andon_db`, máquina 37, CLP, GPIO ou Node-RED. Nenhum merge/deploy na fábrica.

O launcher anterior `homologation/https/Start-AndonHttpsHomologation.ps1` explicitamente desligava a lista de flags E034, mas não incluía as novas famílias R12 e poderia herdar suas variáveis de processo se alguém as tivesse definido no shell. Isso é perigoso para um instalador com dados operacionais.

## Implementação
- Novo switch **`-EnableRefine12CatalogWrites`**, opcional, OFF por padrão. Bloqueia uso quando não estiver simultaneamente em `-NotebookStandardPorts`, HTTPS frontend `8080`, API `3001`, PG `55432` e `-EnableCentralOperationalWrites`. O launcher já verifica `Get-CimInstance Win32_OperatingSystem.ProductType -eq 1` para notebook e rotinas isoladas do Docker.
- Whitelist **exata** de 7 flags:
  `ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED`,
  `ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED`,
  `ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED`,
  `ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED`,
  `ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED`,
  `ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED`,
  `ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED`.
- Todas são **sempre explicitamente zeradas** para novos processos quando o switch não é informado e **nunca herdadas** do shell. Antes/depois do launcher, cada uma das sete variáveis é salva/restaurada no ambiente do processo do próprio PowerShell, sem modificar o sistema/registro; os filhos API recebem valores exatos. Apenas com o switch e o perfil isolado recebem valor 1.
- O manifesto de processos HML contém `isolatedRefine12CatalogWrites` true/false para o atualizador verificar o que foi habilitado.
- Não modifica a lista de flags antigos E034, os controles de acesso de produção, nem libera `ANDON_CENTRAL_FAILURE_EVENTS_HTTP_ENABLED`, `ANDON_CENTRAL_DASHBOARD_SOUND_HTTP_ENABLED`, `ANDON_CENTRAL_LEGACY_CREDENTIALS_HTTP_ENABLED` ou comando físico.

## Testes
`homologation/https/Test-AndonHttpsHomologation.ps1` valida a lista **exata** contra whitelist, presença das medidas de segurança, prova dinâmica (com scripts PowerShell e sem Docker) de que `-EnableRefine12CatalogWrites` isolado ou combinado apenas com o switch operacional é bloqueado antes de qualquer efeito. CI Windows PowerShell 5.1 e Linux/PostgreSQL/backend/frontend/browser.
**Não declarar HML pronta antes de testar o atualizador com backup SHA256+restore em clone do banco HML e inspeção do commit pinado.** A HML anterior continua E034 #385 até execução voluntária do operador; PRs devem continuar DRAFT e sem merge/deploy.

## Homologação de interface
Quando houver pacote versionado/CI verde, testar primeiro login Hub e 10 abas com perfis Admin, Gerente, Líder, Manutenção, Produção, e checklist histórico/cancelamento/som/browser/cores/OS. Ainda pendente: seleção por nome #345 sob flag própria, áudio customizado IndexedDB por navegador, teste visual da página de máquina sem acesso indevido. O switch de catálogo NÃO habilita essas funções por transitividade.
