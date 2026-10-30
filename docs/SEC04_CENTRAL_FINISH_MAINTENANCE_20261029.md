# SEC-04/2F — Conclusão de manutenção pela sessão central, mantendo regras de workstation

**29/10/2026.** Integra a escrita central especificamente de `PATCH /api/andon-calls/:id/finish-maintenance`; não habilita finalização definitiva de chamados.

## Operação
- O domínio atual do modo legado foi extraído para **uma única função transacional compartilhada**: horários de manutenção, técnicos exclusivos, liberação/continuidade individual em acompanhamento, histórico de máquina e restrição para concluir na workstation que iniciou o atendimento.
- O controlador central usa usuário → workstation → máquina → técnicos como ordem de locks. Lê sessão por token hash, checa usuário, workstation aprovada, `andon.read`, `calls.finishMaintenance`, escopo real da máquina do chamado, estado `in_progress` e ausência de teste sistêmico. Revalida a sessão após o lock.
- O mesmo commit grava a transição, o(s) estado(s) de `technicianSession` e o registro de auditoria. Uma falha na auditoria resulta em rollback.
- O transporte HTTP exige HTTPS, Origin exata, cookie HttpOnly central, anti-CSRF e identificação real da workstation. O cliente mantém somente token CSRF em memória, não o cookie.
- A rota central só é habilitada com `ANDON_CENTRAL_ACCESS_ENABLED=1` **e** `ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED=1` (segunda flag OFF por padrão). Abertura, cancelamento, retorno e finalização definitiva seguem bloqueados nesse modo. As regras legadas são preservadas.

## Aceitação no CI
Teste end-to-end com PostgreSQL `/andon_test` sobre chamada criada e atendida por dois mantenedores PIN/RFID: falta de permissão, cookie, CSRF, escopo de máquina, outra workstation autenticada, payload inválido, rollback após falha de auditoria, flag desligada, conclusão com seleção de um técnico em acompanhamento, tempo persistido e duplo envio sem duplicar auditoria.

**Não fazer deploy, migração de banco ou alterações físicas na máquina 37, mini PC, Node-RED, GPIO, certificados e PostgreSQL industrial.** Não considerar os 10 ajustes homologados até concluir as demais rotas e os testes no notebook.
