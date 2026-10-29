# SEC-04/2D — atendimento central HTTP com PIN/RFID, opt-in

Atualização de 29/10/2026. Roadmap #232, item de autenticação e segurança.

## Implementação
- A rota existente `PATCH /api/andon-calls/:id/attend` passa a reutilizar, **somente em autenticação central e com flag específica**, o domínio compartilhado de atendimento com 1–6 técnicos, PIN/RFID, sessões exclusivas, checagens de setor e status, lock de usuário → workstation → máquina → técnicos e auditoria atômica.
- A ativação exige simultaneamente `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED=1`. Ambos fora do ambiente industrial até homologação; com a flag desligada, todos os writes centrais continuam rejeitados.
- Guard exige HTTPS, Origin, sessão central real, estação aprovada, `andon.read`, `calls.attend` e token anti-CSRF. Usuários com escopo limitado só atendem chamados cuja máquina está entre as autorizadas, revalidado no banco dentro de locks.
- A API web obtém CSRF através do cookie HttpOnly já autenticado, mantendo apenas o derivado em memória e verificando na rota. Não armazena PIN nem senha no navegador.
- O modo legado segue usando o handler existente, sem mudança na regra de finalização e sem alterações físicas da Máquina 37, Node-RED ou GPIO.

## Limites
Este PR **não habilita** abertura, cancelamento, retorno à manutenção, conclusão de manutenção, finalização de chamado ou gravação de Prioridades pelo login central. Esses endpoints continuam negados e precisam migração e testes próprios. Não habilitar a flag na fábrica, não migrar banco nem fazer deploy.

Testes incluem PostgreSQL real `/andon_test`, dois técnicos, PIN inválido, CSRF inválido, sessão ausente, replay e rollback/auditoria existentes.
