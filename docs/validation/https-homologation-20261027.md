# HTTPS-1 — homologação isolada

Perfil local para Windows em `homologation/https`, sem alteração do instalador ou runtime produtivo.

## Evidências automatizadas

| Controle | Evidência executada na CI |
| --- | --- |
| TLS efetivamente validado | API real aceita a CA de teste e rejeita cliente sem confiança; HTTP na porta TLS falha. |
| Origem, cookie e CSRF | Origem exata é aceita; origem divergente é negada e não recebe CORS. O fluxo de usuários valida cookies `HttpOnly`, `Secure`, `SameSite=Strict` e CSRF. |
| Usuários | Cadastro, pesquisa, permissões, escopo de máquinas, senha provisória, primeiro acesso, troca, reset, inativação e auditoria usam PostgreSQL isolado. |
| Workstations | Solicitação, aprovação, rejeição, interseção de módulos, UUID, expiração e bloqueio usam PostgreSQL isolado. |
| Compatibilidade | Um segundo runtime real confirma `/health` por HTTP com `ANDON_CENTRAL_ACCESS_ENABLED=0`. |
| Interface | `hubUsers.mjs` captura listagem/cadastro em 1366×768 e 390×844; `workstationAdmission.mjs` e `hubAdminNavigation.mjs` validam admissão e navegação. |

As capturas são publicadas como artefatos do workflow (`hub-users-https-visual-evidence`,
`workstation-admission-visual-evidence` e `hub-admin-navigation-visual-evidence`). Certificados e
senhas do teste são efêmeros ou locais e não são versionados.

## Limitação deliberada

A CI Linux usa uma CA isolada para provar a validação de TLS. A confiança no Windows é preparada
por `mkcert -install` e precisa ser confirmada no notebook alvo antes da homologação manual. Nenhum
certificado, banco ou configuração da Evergreen é acessado por esta entrega.
