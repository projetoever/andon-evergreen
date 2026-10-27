# Identidade de serviços industriais — Etapa 3C.1

Esta etapa adiciona autenticação backend para clientes sem interação humana. Ela não altera o
mini PC, Node-RED, GPIO, payloads 7–12 nem ativa o acesso central na Evergreen.

## Contratos preservados

Os formatos existentes permanecem inalterados. Com `ANDON_CENTRAL_ACCESS_ENABLED=1`, uma sessão
de serviço pode acessar somente as leituras explicitamente concedidas:

| Escopo          | Método e rota                    |
| --------------- | -------------------------------- |
| `machines.read` | `GET /api/machines`              |
| `calls.read`    | `GET /api/andon-calls`           |
| `sound.read`    | `GET /api/dashboard-sound-state` |

Outros métodos, subrotas, histórico, analytics e rotas administrativas são negados. IP, UUID ou
ausência de `Origin` não concedem acesso. O modo central exige HTTPS. Navegadores continuam usando
cookies, CSRF, workstation e permissões de usuário; o token técnico é aceito somente sem `Origin`.

Com `ANDON_CENTRAL_ACCESS_ENABLED=0`, os fluxos legados permanecem iguais aos da release anterior.
As rotas de serviço não criam uma autorização alternativa nesse modo.

## Ciclo da credencial

O Admin principal com autenticação recente usa as rotas HTTPS sob `/api/access/service-identities`
para listar, emitir, rotacionar e revogar identidades. O segredo é exibido somente na resposta de
emissão ou rotação e o banco armazena apenas seu hash forte. Rotação e revogação invalidam todas as
sessões anteriores e geram eventos de auditoria.

O cliente troca `clientId` e `clientSecret` em `POST /api/service-auth/token`. A resposta contém um
token Bearer de oito horas. Como o segredo de cliente é persistente, o processo pode solicitar
outro token automaticamente após reinício ou expiração da sessão. A validade do segredo é definida
na emissão (1 a 365 dias) e sua rotação deve ocorrer antes do vencimento.

## Exemplo sem segredo versionado

Injete as credenciais pelo cofre de credenciais do Node-RED ou por variáveis de ambiente do serviço:

```powershell
$body = @{
  clientId = $env:ANDON_SERVICE_CLIENT_ID
  clientSecret = $env:ANDON_SERVICE_CLIENT_SECRET
} | ConvertTo-Json

$session = Invoke-RestMethod -Method Post `
  -Uri "https://SERVIDOR:3001/api/service-auth/token" `
  -ContentType "application/json" -Body $body

Invoke-RestMethod -Method Get `
  -Uri "https://SERVIDOR:3001/api/machines" `
  -Headers @{ Authorization = "Bearer $($session.accessToken)" }
```

O cliente deve manter o token apenas em memória, renová-lo quando receber HTTP 401 e nunca enviar o
segredo em URL, logs, flow exportado ou repositório. O cliente físico da Evergreen não está presente
neste repositório; a homologação e a configuração real ficam para a Etapa 3C.2.
