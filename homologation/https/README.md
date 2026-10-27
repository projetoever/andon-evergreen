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
legada `123456` apenas para habilitar a gestão central isolada e crie uma frase pessoal. Em seguida,
é possível cadastrar usuários, testar a troca obrigatória de senha e aprovar ou rejeitar estações.
O certificado é validado pelo navegador porque o `mkcert` instala uma CA local; não aceite alertas
de certificado e não use opções para ignorar erros TLS.

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
