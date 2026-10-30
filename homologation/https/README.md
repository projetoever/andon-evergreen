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

Abra `https://localhost:8443/hub`. No primeiro acesso, identifique a workstation, use a senha Admin
legada **de teste** `123456` apenas para habilitar a gestão central isolada e crie uma senha pessoal de **8 a 128 caracteres** (12 ou mais recomendados). A senha legada de teste e a nova conta Admin central são credenciais diferentes. Em seguida,
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

## Controles aplicados

- API Fastify usa TLS nativo em `https://localhost:3443`;
- frontend Vite usa TLS em `https://localhost:8443`;
- CORS e `ANDON_ACCESS_ORIGIN` aceitam somente a origem exata do frontend;
- cookies de acesso continuam `HttpOnly`, `Secure` e `SameSite=Strict`, com CSRF nas mutações;
- `ANDON_CENTRAL_ACCESS_ENABLED=1` existe somente nos processos iniciados por este script;
- o PostgreSQL escuta apenas em `127.0.0.1:55432` e possui senha aleatória local;
- HTTP legado não é alterado: fora deste perfil, a flag central e o TLS seguem a configuração normal.

Use dados fictícios. A homologação não autoriza copiar credenciais ou dados da Evergreen.
