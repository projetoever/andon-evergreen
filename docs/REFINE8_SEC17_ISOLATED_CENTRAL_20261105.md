# REFINE 8 / SEC-17 — Ativação central isolada, sem inicializador paralelo

Base: PR #338 / commit `1c459711564403e83b4da086b7201fa5c07d6319`.

## Fato observado no notebook (04/11/2026)

- Git HEAD: `1c459711...` (main sincronizada)
- Frontend compilado: `2e2a9f608...` (obsoleto)
- `andon-config.json.installedCommit`: `2e2a9f608...` (obsoleto)
- HTTPS acessível e `/health/ready` respondeu, mas não prova identidade do binário API
- `centralAccessEnabled=false` por desenho da opção 14
- banco operacional: `andon_db`, PostgreSQL Docker na porta 5432

**Não modificar a flag do notebook existente.** Refazer a atualização sem uma cópia validada do banco é proibido, pois o updater oficial executa migrações. O HEAD em dia não confirma conclusão da aplicação; o SHA de frontend é a evidência do build.

## Escopo deste pacote

`installer/configure-andon-central-hml.ps1` **não é inicializador de aplicação**. É um configurador de segurança para uma VM Windows cliente **separada**, usando o mesmo menu oficial 2/4/5/6/14, a mesma estrutura C:\web-andon-industrial e **outro** banco/container/volume Docker.

O configurador tem `Check` (somente leitura), `Enable` (com backup e confirmação) e `Restore` (volta configuração central OFF). Nunca cria tabelas, não instala Docker, não inicia runtime, não chama watchdog, não edita hardware e não faz deploy.

**Pré-condições verificadas no código:**
- Windows cliente, não Windows Server;
- HTTPS `localhost`/`127.0.0.1`, certificado e chave existentes;
- `databaseName=andon_https_hml`, Docker `127.0.0.1:55432`, container e volume próprios de homologação;
- volume verificado via Docker inspect, sem reutilizar `andon-postgres` ou `andon-postgres-data`;
- HEAD Git igual ao `installedCommit` declarado e ambos os builds encontrados;
- portas 3001/8080 sem serviço ouvindo antes da mudança;
- confirmação explícita `-ConfirmIsolated`.

Na ativação, cria diretório de backup com ACL de SYSTEM e Administradores, copia configuração com SHA256 e faz `pg_dump -Fc` do banco **isolado** dentro do container. Valida o índice do dump com `pg_restore -l`, copia arquivo binário com `docker cp` e só então troca `centralAccessEnabled=true` atomicamente. Falha antes do commit de configuração mantém OFF; falha na validação após o commit restaura a configuração salva.

## Roteiro de execução na VM (não no notebook principal)

1. Provisionar a VM e PostgreSQL Docker em volume próprio. Usar a instalação oficial e configurar HTTPS **local** pelo procedimento existente. Nunca copiar dados de produção sem anonimização e autorização.
2. Verificar no menu da VM a opção 2 completamente concluída, e comparar Git HEAD, `installedCommit`, SHA do frontend compilado e API por evidência. `Check` compara HEAD e `installedCommit`; **não prova** a identidade do processo API nem a origem do build frontend.
3. Executar, inicialmente apenas como leitura:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\configure-andon-central-hml.ps1 -Action Check
   ```
4. Com VM isolada, backups e plano de retorno conferidos, usar a opção **5** do menu oficial para parar o runtime e executar:
   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\configure-andon-central-hml.ps1 -Action Enable -ConfirmIsolated
   ```
5. Iniciar apenas pela opção **4** do menu oficial na VM e homologar Admin central, migração assistida (instalação existente), recuperação, step-up, sessão, permissões, segundo terminal e 401/403. Operações centrais de escrita ainda dependem das próprias flags opt-in e da ACL.
6. Para voltar a OFF, parar o runtime com opção **5** e usar `-Action Restore -RestoreFrom <caminho_do_backup_da_configuracao> -ConfirmIsolated`. Essa restauração recupera **configuração**, não sobrescreve banco. A recuperação de dados deve ser feita separadamente, na VM, com dump e verificação; nunca em `andon_db`.

## Riscos restantes / critérios que impedem merge/deploy

- Teste Windows CI valida parser, guardas, recusa de arquivo não autorizado. Não substitui ensaio real de Docker, `pg_dump`/`pg_restore` e recuperação.
- A API atual não expõe identidade imutável do binário compilado; requer evidência independente antes do aceite completo SEC-25.
- A instalação existente exige a senha Admin global **uma vez** em `/api/access/initialize`. Aposentadoria do hash legado é ação explícita posterior, com recuperação central configurada; **não** se deve apagar o hash durante o primeiro teste.
- HTTPS local restringe o primeiro cadastro; teste com segundo dispositivo é pacote posterior com SAN/CA adequados e sem acesso físico.
- A opção 14 persiste `centralAccessEnabled=false`; reconfigurar HTTPS na VM exige refazer a verificação central. Isso não é bug do configurador.
- Não executar o configurador no notebook apontando para `andon_db`, Windows Server Evergreen ou Máquina 37. Sem merge, deploy, alterações no ambiente real, no Node-RED ou GPIO.
