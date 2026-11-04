# REFINE 5 S6 — Backup e ensaio de restauração do notebook HTTPS

**Data:** 04/11/2026 · **Ambiente autorizado:** somente o PostgreSQL Docker **isolado** do script `homologation/https/Start-AndonHttpsHomologation.ps1`.

Este procedimento **não faz backup da fábrica**. Não executa comandos no Windows Server da Evergreen, PostgreSQL produtivo, Node-RED, mini PC GPIO, Máquina 37 ou outros containers. Não é um procedimento de implantação.

## Pré-requisitos

- Notebook Windows com **PowerShell 5.1**, **Docker Desktop local** apontando para uma *named pipe* e repositório atualizado em branch autorizada.
- A instalação HTTPS do notebook já deve existir, com `.andon-homologation/config.json` marcado como inicializado e um container exato `andon-https-hml-postgres` criado pelo launcher. O script confere `POSTGRES_DB=andon_https_hml`, `POSTGRES_USER=andon_hml` e publicação exclusivamente em `127.0.0.1` na porta do próprio arquivo de configuração.
- Dados **fictícios**. O dump é uma cópia integral do banco; pode conter hashes de senhas, usuários e histórico dos testes. **Não compartilhe os arquivos de dump**, mesmo quando originados do notebook.
- Não usar `Stop-AndonHttpsHomologation.ps1 -RemoveData`. Esse comando apaga o banco de homologação; o ensaio de backup não precisa dele.

## Instruções no PowerShell, a partir da raiz do repositório

**1. Encerrar os serviços da homologação, preservando dados:**

```powershell
.\homologation\https\Stop-AndonHttpsHomologation.ps1
```

**2. Executar a rotina de backup e restauração:**

```powershell
.\homologation\https\Test-AndonHttpsBackupRestore.ps1
```

**3. Conferir as evidências:** em caso de sucesso a rotina imprime `BACKUP E RESTORE ISOLADOS VALIDADOS`, o caminho do dump `.dump`, SHA-256 e o manifesto `.manifest.json`. Os arquivos ficam em `.andon-homologation/backups/`, com ACL restritiva de usuário. O banco original não é restaurado nem substituído. Um clone de nome aleatório `andon_hml_restore_<aleatório>` é criado para teste e eliminado em seguida.

**4. Retomar a homologação, preservando o mesmo banco:**

```powershell
.\homologation\https\Start-AndonHttpsHomologation.ps1
```

O launcher retorna `https://localhost:8443/hub` no padrão atual. Não execute `-EnableCentralOperationalWrites` antes de concluir os testes somente leitura e de autenticação; ele habilita gravações **somente no notebook**.

## O que a rotina comprova

1. Verifica que o launcher não está rodando, que o container e o banco têm identidade **exatamente** correspondente à homologação e que o Docker não está apontando para outro servidor.
2. Usa `pg_dump --format=custom` **dentro do container**; evita redirecionar o binário por pipelines do Windows PowerShell 5.1.
3. Copia o arquivo para o notebook, compara seu SHA-256 com o original no Docker e o envia de volta ao container **para restaurar a cópia realmente exportada**.
4. Restaura apenas numa base nova com nome aleatório e `pg_restore --exit-on-error`. Não existe parâmetro que aceite outro banco ou hostname.
5. Compara contagem de registros e hash determinístico de conteúdo de **13 tabelas**, incluindo configurações, máquinas, workstations, chamados, sessões e alocações de técnicos, eventos de falha, intervalos de impacto, programação da produção, classificações, usuários, sessões de acesso e auditoria.
6. Compara os **KPIs usando as funções oficiais do BI** nos dois bancos, na mesma janela UTC fixa de 30 dias: MTTA, MTTR, downtime, MTBF estimado, MTBF programado e disponibilidade programada, além da cobertura, exclusões e distribuição temporal. Um resultado diferente aborta a aprovação. Produz manifesto sem segredos em claro e elimina a base temporária e os arquivos temporários do container, preservando o backup local.
7. Se alguma etapa de verificação falhar, encerra com erro; **não** altera o conteúdo do banco original. Se a remoção da base temporária falhar, o terminal emite um alerta com seu nome exato para remoção **após análise**.

## Limites e aceite

- A **CI do GitHub** valida sintaxe e controles do script Windows e executa o comparador real do BI em PostgreSQL de testes, mas **não** executa dump/restore reais no notebook. O manifesto do notebook separa `kpi_parity_pass` de `kpi_parity_empty_cohort` para impedir aprovação funcional quando não houver eventos representativos.
- Para dar S6-02 como completo é necessário executar a rotina de verdade no notebook, usar chamados sintéticos representativos (incluindo episódios físicos de manutenção, chamadas de teste e programação de produção) e confirmar visualmente o BI e os métodos de exclusão. **Paridade de dois cálculos não prova que os registros de programação refletem a fábrica.**
- O arquivo gerado é um **backup do notebook**, não uma cópia de produção, não um plano automático de recuperação do Windows Server e não uma autorização para atualizar a Evergreen.
- Em caso de falha, preserve o erro (sem senha ou conteúdo sensível) e o manifesto. **Não** tente compensar executando `prisma migrate reset`, `pg_restore` manual sobre o banco original ou `Stop-... -RemoveData`.

## Checklist de evidências para registrar na homologação

| Critério | Evidência |
|---|---|
| Container Docker e porta local verificadas | Terminal sem falhas de identidade ou exposição |
| Dump e SHA-256 | Caminho `.dump` e valor SHA-256 |
| Restore em clone descartável | Saída `BACKUP E RESTORE ISOLADOS VALIDADOS` |
| Conteúdo restaurado | Manifesto com 13 assinaturas de tabelas e KPIs iguais |
| Base original preservada | Relação de workstations/chamados e autenticação igual antes e depois |
| Comparação BI | Manifesto `biParity` com os cálculos reais repetidos após o restore. Se `hasData=false`, não há amostra suficiente e a validação funcional permanece pendente |
| Testes Node-RED/GPIO e deploy | **Pendentes de validação física e autorização específica** |
