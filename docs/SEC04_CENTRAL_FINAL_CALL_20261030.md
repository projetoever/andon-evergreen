# SEC-04/2J — finalização definitiva auditável pela sessão central

**30/10/2026.** A rota `PATCH /api/andon-calls/:id/finish` usa o mesmo domínio operacional de encerramento do legado, dentro da transação PostgreSQL que contém a autorização e o log central.

## Requisitos e integridade
- HTTPS, origem, cookie HttpOnly e token anti-CSRF; workstation ativa/aprovada e `andon.read` + `calls.finish` para a máquina real do chamado.
- O servidor recarrega usuário, sessão e estação sob locks usuário → workstation → máquina, impedindo revogação ou troca de escopo durante a operação.
- Diagnóstico específico e descrição são obrigatórios, classificação ativa e responsabilidade/disposição do BI vêm do catálogo confiável. Classificações genéricas e testes sistêmicos não são finalizados pelo login humano.
- Conclusão de manutenção precede finalização da chamada de manutenção; produção exige `in_progress`.
- Confirma conjunto/subconjunto quando exigidos, preserva snapshots e motivo de alteração. Transfere, fecha ou mantém intervalo de parada física entre chamados ativos conforme seleção do operador e regras existentes.
- Calcula tempo total, espera, manutenção, acompanhamento e downtime pelo domínio legado. Encerra as sessões dos técnicos. Auditoria `calls.finish` entra na mesma transação e seu erro causa rollback.
- Somente ativo com `ANDON_CENTRAL_ACCESS_ENABLED=1` **e** `ANDON_CENTRAL_FINISH_CALL_HTTP_ENABLED=1`, segunda flag **OFF por padrão**. Editar diagnóstico depois de encerrado e cancelar chamados são operações separadas.

## Testes
E2E PostgreSQL isolado `/andon_test`: dois técnicos, manutenção → acompanhamento → retorno → nova conclusão → encerramento com diagnóstico; nega sem `calls.finish`, CSRF/cookie inválidos, descrições ou classificações inválidas, IDs de impacto inexistentes, dupla finalização e flag desligada. Testa auditoria atômica forçando falha de IP em campo com limite no banco.

**Sem deploy, sem migração de banco, sem alterações no servidor industrial/M37/Node-RED/GPIO.** Não considerar os 10 ajustes prontos para teste no notebook até revisão e integração geral.
