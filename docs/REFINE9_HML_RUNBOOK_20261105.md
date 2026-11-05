# REFINE 9 — Preparação e homologação HTTPS HML (somente laboratório)

**Data-base:** 05/11/2026. **Estado:** procedimento preparado; **NÃO executado no notebook**. Não há homologação manual, merge, deploy, alteração no original ou na fábrica.

## Proveniência e isolamento

- Base UX/ACL: PR #342, `8e93f8252fb1d18c3aaebad634a02ee91579081c` (draft).
- Hotfix launcher: PR #341, `1bb3319ceef9cb1faf20ded25c486da4c9632ea1` (draft). Integrar somente os dois arquivos `homologation/https/Start-AndonHttpsHomologation.ps1` e `homologation/https/Test-AndonHttpsHomologation.ps1`.
- Branch candidata: `refine9/hml-ux-342-https341-20261105` — **cópia de integração para HML, NÃO main e NÃO release**.
- LAB: `C:\web-andon-refine8-hml\andon`; frontend `https://localhost:8080/hub`, API `https://localhost:3001`; banco `andon_https_hml` em Docker HML (`127.0.0.1:55432`).
- **PROIBIDO** executar em `C:\web-andon-industrial\andon`, `andon_db`, Windows Server da fábrica, Máquina 37, GPIO, PLC ou Node-RED. Não fazer merge nem deploy sem autorização.
- A correção da PR #341 atribui `$env:PORT = "$FrontendPort"` **depois** do `Start-Process` da API e **antes** do `Start-Process` do frontend. O teste PowerShell confere essa ordem.

## Gate A — leitura e pré-checagens, sem alterar nada

Usar somente Windows PowerShell local (não Windows Server). Antes de qualquer comando que altere o HML, conferir:

```powershell
$Lab = 'C:\web-andon-refine8-hml\andon'
$Original = 'C:\web-andon-industrial\andon'
$ExpectedSource = '8e93f8252fb1d18c3aaebad634a02ee91579081c'
$ExpectedCandidate = '<PREENCHER_COM_SHA_DO_COMMIT_COMBINADO>'
if (!(Test-Path $Lab -PathType Container)) { throw 'HML não encontrado' }
$Root = (Resolve-Path $Lab).Path.TrimEnd('\')
$OriginalRoot = (Resolve-Path $Original -ErrorAction SilentlyContinue)
if ($OriginalRoot -and [string]::Equals($Root, $OriginalRoot.Path.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'ALVO OPERACIONAL PROIBIDO' }
if ((git -C $Lab rev-parse --show-toplevel).TrimEnd('/') -replace '/', '\' -ne ($Root -replace '/', '\')) { throw 'Raiz Git não corresponde ao LAB' }
git -C $Lab rev-parse HEAD
git -C $Lab branch --show-current
git -C $Lab status --porcelain
Get-NetTCPConnection -LocalPort 8080,3001 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
docker ps -a --filter 'name=^/andon-https-hml-postgres$' --format '{{.Names}}  {{.Ports}}  {{.Status}}'
```

**BLOQUEAR a atualização se:** há alterações locais não rastreadas/relevantes, `processes.json` HML ativo, portas 8080/3001 ocupadas por processo desconhecido, container com outro nome/portas, serviço da instalação original em execução nessas portas, indisponibilidade de backup ou discrepância de SHA. Não executar `taskkill`, `git reset --hard`, `docker rm`, `Stop-... -RemoveData` ou automação que pare processos por porta.

## Gate B — backup verificável antes de migrations

1. Registre SHA/branch atual do diretório HML e copie `.andon-homologation` para uma pasta privada **fora do Git**, preservando ACL. Esse diretório contém configurações e pode conter credenciais; não anexar seus arquivos a PRs/logs.
2. Verifique a identidade exata do container `andon-https-hml-postgres`, o database `andon_https_hml`, o usuário `andon_hml` e a publicação **somente** em `127.0.0.1:55432`.
3. Faça `pg_dump -Fc` **dentro do container** (evite redirecionar bytes binários com PowerShell 5.1), copie o arquivo com `docker cp` para uma pasta de backups HML privada, valide arquivo não vazio e calcule SHA256 com `Get-FileHash -Algorithm SHA256`.
4. Valide o dump com `pg_restore --list` e, idealmente, restaure para **outro banco descartável, diferente de `andon_https_hml` e `andon_db`**. Registre contagem de tabelas e integridade. Nunca restaurar sobre o banco original.
5. Registre o caminho e hash do backup em evidência local sem expor senhas, tokens, cookies ou chaves. Se qualquer etapa falhar, **não atualizar código nem schema**.

## Gate C — troca somente da cópia HML

1. Encerre **apenas** runtime já identificado como LAB pelo script `homologation\https\Stop-AndonHttpsHomologation.ps1` **sem `-RemoveData`**, após validar PIDs e diretório de origem. Nunca pare processo desconhecido nas portas.
2. Com `git status --porcelain` vazio, faça `git -C $Lab fetch origin --no-tags`; confira `origin/refine9/hml-ux-342-https341-20261105` e o SHA candidato publicado. Não use `git pull main` nem menu atualizador operacional.
3. Salve o HEAD e a branch anteriores no registro HML. Faça `git -C $Lab switch --detach $ExpectedCandidate` apenas após conferir hash e árvore. Se a troca falhar, pare e restaure o checkout anterior sem forçar resets.
4. Execute o teste de sintaxe/regressão `& "$Lab\homologation\https\Test-AndonHttpsHomologation.ps1"`. Pare se falhar. Confirme no código a atribuição específica de `PORT` do frontend e as flags físicas `PLC_INTEGRATION_ENABLED=0`, `PLC_ADAPTER=mock`.
5. Inicie exclusivamente a cópia LAB com:

```powershell
Set-Location 'C:\web-andon-refine8-hml\andon'
& '.\homologation\https\Start-AndonHttpsHomologation.ps1' -NotebookStandardPorts -FrontendPort 8080 -ApiPort 3001 -PostgresPort 55432 -EnableCentralOperationalWrites
```

**Atenção:** `-NotebookStandardPorts` exige `-EnableCentralOperationalWrites` no launcher atual; esse opt-in liga as flags de escritas centrais **do banco HML** para ensaios, mas o script mantém PLC mock e loopback. NÃO habilite `-EnableGlobalPaletteWrites` no ensaio inicial. Nunca usar estas flags no operacional.
6. Conferir `https://localhost:3001/health` e `https://localhost:8080/hub`, certificado TLS confiável e ausência de `EADDRINUSE`; registrar os PIDs exclusivamente da cópia HML, versão, logs sem segredos e screenshot.

## Gate D — matriz R9-01 a R9-04 (preencher com evidências reais)

| Caso | Usuário/estação | Resultado esperado |
|---|---|---|
| Módulos visíveis | Qualquer perfil autenticado e workstation aprovada | ANDON, BI, Prioridades sempre presentes; negado = esmaecido/cadeado/sem clique; indisponível distinto de negado |
| Admin principal | `isPrimaryAdmin=true`, terminal aprovado | Todos os módulos e configurações; reautenticação e CSRF/ACL para ações críticas |
| Admin falso | Outro usuário apenas com `roleLabel=Admin` | NÃO herda Admin principal |
| Manutenção/Produção | Contas fictícias com grants distintos | Somente módulos concedidos; abrir URL/API negada retorna bloqueio (401/403 conforme estado) |
| Gerente/Líder | Contas fictícias com grants distintos | Concessões por usuário, não pela workstation; nenhuma autorização indevida de escrita |
| Workstations | Dois navegadores/perfis aprovados | Aprovação/bloqueio por terminal; flags legadas não concedem módulos no central ON |
| Configurações | Admin no dashboard ANDON | Painel operacional restaurado (aparência, sons, categorias, máquinas, mantenedores); ações não migradas bloqueadas |
| Hub | Admin | Segurança, contas, workstations, integrações e configurações gerais do Hub; sem duplicar painel operacional |
| Configurações parciais | Não Admin com grant `andon.settings.open` | Acessa somente as áreas/escritas expressamente autorizadas |
| Idiomas/layout | PT/EN/ZH tradicional; desktop/TV/mobile | Mensagens de bloqueio, modais, nomes e responsividade corretos |
| Regressão | Chamados/BI em dados sintéticos | Nenhuma escrita física, perda de histórico, duplicidade ou alteração de KPI indevida |

Para cada caso registrar: data/hora UTC, **SHA em execução**, usuário fictício/perfil, workstation, navegador, rota/API, expectativa, resposta observada, captura redigida, logs sem segredos e status **PASSOU / FALHOU / NÃO TESTADO**. CI verde não substitui aprovação manual.

## Gate E — rollback da HML (não aplicar sem necessidade)

- Se o launcher falhar, pare somente os processos LAB identificados, sem `-RemoveData`; preserve logs/backup; retorne `git switch` ao ref anterior salvo. Não usar `git reset --hard`.
- Como a inicialização executa migrations, **voltar o código não reverte automaticamente o banco**. Para rollback completo, valide a restauração do dump em banco HML descartável e planeje troca/recuperação do banco isolado apenas com inspeção do estado e aprovação. Nunca tocar `andon_db`.
- Registre diagnóstico, SHA, plano executado e evidência; não marcar homologado até repetir testes.

## Controle do status

- G0: CI verde na PR #342 e PR #341 **separadamente**. A branch combinada exige CI própria.
- G1: homologação manual HML **PENDENTE**.
- R9-01 a R9-04: código em PR draft, teste automatizado executado; **NÃO homologado**.
- R9-05 a R9-08: **NÃO IMPLEMENTADO** — em PR própria posterior com backend, migrations/flags somente HML, expiração, rotação/revogação, reinícios, concorrência e dois dispositivos.
- R9-09: **FUTURO, fora do escopo**.
- Sem merge, deploy, alteração no original ou na fábrica.

**Fontes:** [PR #342](https://github.com/projetoever/andon-evergreen/pull/342), [PR #341](https://github.com/projetoever/andon-evergreen/pull/341), [REFINE9_BACKLOG_HML_KIOSK_ACL_20261105.md](https://github.com/projetoever/andon-evergreen/blob/refine8/pilot-hub-andon-panel-ux-20261105/docs/REFINE9_BACKLOG_HML_KIOSK_ACL_20261105.md).

## Ajustes adicionais REFINE 9 — preparando G1

- A UX do Hub lista ANDON, BI e Prioridades também antes do login central e quando o catálogo está indisponível. Sem permissão explícita do servidor, os três cards continuam bloqueados, sem navegação.
- O `allowed` de `/api/modules/access` representa grant do **usuário** e não se confunde com `machineScope="selected"`. Os endpoints continuam obrigados a filtrar as consultas por máquina ou negar a operação.
- `GET /api/failure-events` agora valida o contexto central e filtra IDs autorizados em SQL antes de `ORDER BY` e `LIMIT`; consulta de máquina fora do escopo retorna vazio.
- Somente leituras de catálogos `GET /api/andon-categories` e `GET /api/technicians` disponíveis para perfis com `andon.read`; POST/PATCH/DELETE não foram liberados.
- Testar no LAB: três cards antes de login, Admin, Gerente, Líder, Manutenção, Produção escopo selected (uma máquina) e escopo all; URL/API diretas, GET failure-events dentro/fora do escopo, português/inglês/chinês e responsividade.
- Quaisquer rotas de leitura não cobertas por filtro por máquina permanecem fail-closed; não aceitar R9-04 até confirmar toda a jornada de chamados.
- O workflow .github/workflows/pr-validate.yml executa no evento PR com base em `main`; PR #343 precisa CI combinada, ainda em **draft**, sem merge/deploy.
