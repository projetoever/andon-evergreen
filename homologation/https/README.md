# Homologação HTTPS local no Windows

Este perfil inicia frontend e API com TLS confiável e um PostgreSQL Docker exclusivo. Ele não usa
o banco, as credenciais, o launcher, o watchdog ou os serviços do piloto. Os segredos e a chave
privada ficam em `.andon-homologation/`, ignorado pelo Git.

## Pré-requisitos

- Windows 10/11 com PowerShell 5.1 ou superior;
- Node.js 22 e dependências do repositório instaladas;
- Docker Desktop em execução;
- `mkcert`, instalável com `winget install FiloSottile.mkcert`.

Feche navegadores que usem uma instância anterior e execute na raiz do repositório:

```powershell
.\homologation\https\Start-AndonHttpsHomologation.ps1
```

Abra `https://localhost:8443/hub` no próprio notebook. A instalação inicia **sem qualquer senha Admin padrão**. Na primeira abertura, configure a senha Admin global (8–128 caracteres, recomendado 12+). Depois, identifique a workstation e cadastre a conta Admin central conforme o roteiro de migração. A senha global temporariamente atende somente os recursos legados. Em seguida,
é possível cadastrar usuários, testar a troca obrigatória de senha e aprovar ou rejeitar estações.
O certificado é validado pelo navegador porque o `mkcert` instala uma CA local; não aceite alertas
de certificado e não use opções para ignorar erros TLS.

## Teste operacional consolidado dos 11 ajustes (opt-in)

**Padrão seguro:** o comando acima habilita somente o login central. Todas as 15 flags de escrita específica permanecem `0`, mesmo que o PowerShell de origem tenha valores antigos. O objetivo é permitir cadastrar a conta Admin e verificar que operações centralizadas não são liberadas inadvertidamente.

Para testar os fluxos centrais migrados em um **notebook de homologação exclusivamente local**, depois de confirmar a ausência de serviços de produção nesse computador, inicie a instância isolada com a opção explícita:

```powershell
.\homologation\https\Start-AndonHttpsHomologation.ps1 -EnableCentralOperationalWrites
```

A opção aciona somente 15 guardas centrais já implementadas para a API isolada: classificação, abertura de chamado, atendimento, múltiplos mantenedores, conclusão, cancelamento, diagnóstico histórico, preferências da própria estação, identificação PIN/RFID, prioridades e configurações operacionais de Admin. **Não libera** edição de catálogos antigos, eventos físicos de parada, sirene/mute global ou credenciais legadas. É necessário autenticar o usuário, aprovar a workstation e possuir permissões de cada ação; a flag, sozinha, não autoriza ninguém. Não usar a opção na máquina da fábrica, em servidor da Evergreen ou em processos que se comuniquem com Node-RED, PLC ou GPIO.

## UX-12 — Homologação independente da paleta global

A personalização de cores possui autorização **separada** das 15 operações centrais. O launcher força `ANDON_CENTRAL_VISUAL_PALETTE_HTTP_ENABLED=0` tanto no modo padrão quanto no modo `-EnableCentralOperationalWrites`, independentemente do valor herdado do PowerShell. Ao finalizar, a variável de ambiente anterior é restaurada.

Para testar **somente no notebook isolado**, com banco, certificados e dados de teste, use ambos os switches:

```powershell
.\homologation\https\Start-AndonHttpsHomologation.ps1 -EnableCentralOperationalWrites -EnableGlobalPaletteWrites
```

A flag da paleta sozinha é recusada antes da inicialização, bem como qualquer porta produtiva ou duplicada. Os dados globais só poderão ser alterados pelo Admin principal autenticado, com workstation aprovada, HTTPS, Origin permitido, CSRF, escopo completo, validação da revisão, auditoria e transação com rollback. **Não transportar a opção para o servidor industrial.**

Roteiro de verificação: confirmar opção indisponível com flag OFF; salvar com Admin principal; atualizar duas workstations com temas independentes (até 30 segundos); rejeitar gravação com papel menor, token revogado, CSRF ausente e revisão antiga; restaurar o padrão mediante confirmação; verificar que status de parada, cores de emergência e sons permanecem inalterados.

O modo com escritas é rejeitado nas portas produtivas `8080`, `3001`, `5432` e em portas duplicadas ou inválidas. Este script conecta-se exclusivamente ao Docker de teste `andon-https-hml-postgres`, com banco `andon_https_hml`, PostgreSQL em `127.0.0.1`; não recebe endereço de banco remoto nem importa credenciais da fábrica.

Para desativar as flags, encerre a instância e inicie novamente **sem** `-EnableCentralOperationalWrites`. O script restaura todas as variáveis anteriores no PowerShell chamador, inclusive em falhas de inicialização. O log `.andon-homologation/processes.json` registra apenas o estado booleano do perfil, não senhas.

Siga o [roteiro de homologação dos 11 cenários](../../docs/SEC04_NOTEBOOK_HOMOLOGATION_11_CHECKLIST_20261030.md).

Para encerrar sem perder o banco isolado:

```powershell
.\homologation\https\Stop-AndonHttpsHomologation.ps1
```

Para apagar deliberadamente apenas o container e os arquivos locais dessa homologação:

```powershell
.\homologation\https\Stop-AndonHttpsHomologation.ps1 -RemoveData
```

## Diagnóstico: container de homologação ausente ou renomeado

O launcher e o encerramento consultam a lista de **nomes exatos** dos containers. A ausência de `andon-https-hml-postgres` (por exemplo, depois de renomeá-lo para backup) não é mais tratada como erro `No such container` no Windows PowerShell 5.1. Falhas reais ao consultar o Docker Desktop continuam bloqueando a inicialização.

Se um container antigo existir **sem** `.andon-homologation/config.json`, **não é possível presumir que a senha anterior é recuperável**. Preserve-o, confirme a identidade, e só então renomeie como backup se for realmente o banco local sintético de homologação. Nunca use `-RemoveData`, `docker rm` ou limpeza de volumes para corrigir esse problema sem autorização específica.

Depois de `git pull --ff-only origin main`, repita `Test-AndonHttpsHomologation.ps1` e `Start-AndonHttpsHomologation.ps1`; o novo container de homologação será criado separadamente do backup. O script de testes simula container ausente, somente backup renomeado, nome exato existente e falha real do daemon sem acessar dados industriais.

## Controles aplicados

- API Fastify usa TLS nativo em `https://localhost:3443`;
- frontend Vite usa TLS em `https://localhost:8443`;
- CORS e `ANDON_ACCESS_ORIGIN` aceitam somente a origem exata do frontend;
- cookies de acesso continuam `HttpOnly`, `Secure` e `SameSite=Strict`, com CSRF nas mutações;
- `ANDON_CENTRAL_ACCESS_ENABLED=1` existe somente nos processos iniciados por este script;
- o PostgreSQL escuta apenas em `127.0.0.1:55432` e possui senha aleatória local;
- HTTP legado não é alterado: fora deste perfil, a flag central e o TLS seguem a configuração normal.

Use dados fictícios. A homologação não autoriza copiar credenciais ou dados da Evergreen.
