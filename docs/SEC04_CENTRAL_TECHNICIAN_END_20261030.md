# SEC-04/2L — Saída individual de mantenedor com login central

Data: 30/10/2026. Continuidade da issue #232 e do ajuste #11 (último técnico).

## Alteração específica
- Integrar somente `PATCH /api/andon-calls/:id/technicians/end` ao login central, com `ANDON_CENTRAL_ACCESS_ENABLED=1` e flag própria `ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED=1`. Ambas permanecem **desligadas na instalação industrial**.
- **Não** liberar a rota de encerramento por nome `/:technicianName/end`, criação de participante, configurações legadas ou qualquer outra mutação central por herança.
- Exigir HTTPS/origem, cookie central HttpOnly, sessão ativa, workstation aprovada, `andon.read`, `calls.technicians.manage`, escopo real da máquina e anti-CSRF. Não confiar em ID/nome de usuário ou técnico vindo do navegador.
- Receber PIN/RFID somente no corpo da operação; identificar técnico ativo por hashes existentes, adquirir lock técnico e revalidar a credencial após lock. Não salvar PIN/tag em log.
- Ordem de locks: usuário → workstation → máquina → técnico. Compartilhar a função de encerramento legado já corrigida no ajuste #11, que bloqueia 1→0 em `in_progress`; no acompanhamento (`post_maintenance`), saída final continua permitida.
- Registrar `calls.technicians.end` com identidade central e ID técnico confirmado na mesma transação; falha de auditoria desfaz encerramento. Resposta/erros preservam o contrato anterior.
- Cliente central suprime `technicianName` no corpo e envia CSRF; modo legado continua enviando nome quando apropriado.

## Validação
- Testes de flag desligada, método/caminho exatos, permissões, módulo e CSRF em `test:auth`.
- PostgreSQL isolado `/andon_test`: falha de credencial, spoof de nome, requisições concorrentes de 2 técnicos, último técnico bloqueado, saída no acompanhamento, replay, rollback de auditoria, flag OFF.
- Regressão completa do CI: backend, PostgreSQL, HTTPS, frontend, instalador Windows e testes existentes.

## Limites e homologação
Este PR não altera o servidor Evergreen, Máquina 37, Node-RED, GPIO, banco ou certificados de produção. A migração central de adicionar técnicos e demais rotas precisa de trabalhos separados, teste consolidado em notebook, backup e autorização específica. **Não fazer merge/deploy sem aprovação.**
