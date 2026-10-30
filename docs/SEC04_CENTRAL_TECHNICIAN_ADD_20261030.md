# SEC-04/2M — Inclusão de mantenedores com autenticação central

Data: 30/10/2026. Continuação da issue #232, dependente do PR #281 (saída individual de mantenedor). PR **empilhado** sobre a branch de #281: **não integrar nem fazer deploy automaticamente**.

## Domínio e segurança
- Habilitar exclusivamente `POST /api/andon-calls/:id/technicians` em modo central, mediante `ANDON_CENTRAL_ACCESS_ENABLED=1` **e** `ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED=1`; OFF por padrão.
- Validar HTTPS, origem autorizada, cookie HttpOnly, anti-CSRF, conta e sessão, workstation aprovada, `andon.read`, permissão `calls.technicians.manage` e escopo real da máquina. Resolver proprietário pelo chamado no PostgreSQL, não pelo corpo.
- Admitir apenas lista `credentials` com um a seis pares PIN/RFID; nunca permitir que nomes, IDs, área, usuário ou permissões do navegador autorizem uma sessão.
- Revalidar PIN/RFID após os locks dos técnicos (ordem canônica usuário → workstation → máquina → técnico em ID crescente). Impedir conta inativa, área incompatível, duplicidade PIN+RFID, técnico já ativo no mesmo ou em outro chamado, chamados teste e chamadas fora dos estados `in_progress` ou `post_maintenance`. Limitar seis sessões técnicas simultâneas por chamado no caminho central.
- Compartilhar a transição persistente original de adição; fase `maintenance` ou `follow_up`, `cycleIndex`, workstation, tempos e participantes históricos são preservados. Sem criação se não há técnico novo.
- Auditoria única de `calls.technicians.add` por operação, contendo IDs verificados e fase, nunca credenciais. Mutação + auditoria na mesma transação: erro de gravação implica rollback.
- No cliente central transmitir somente credenciais verificáveis e CSRF. Modo legado mantém nomes e comportamento atual.

## Testes
- `test:auth` comprova flag dupla, rota exata, permissão, módulo e CSRF.
- `test:access:integration` executa PostgreSQL **exclusivamente `/andon_test`**: sem sessão, sem CSRF, payload adulterado, PIN inválido, duplicidade, escopo incorreto, chamado teste, concorrência e exclusividade entre chamados, adição no acompanhamento, auditoria com rollback, flag OFF e sessão revogada.
- Pipeline completo deve aprovar compilação backend, frontend, SSR, runtime HTTPS, testes e instalador Windows.

## Restrições
Não tocar Máquina 37, banco industrial, Node-RED, GPIO, HTTPS real ou implantação. PR #281 precisa ser concluído e revisado antes da integração deste pacote; homologação no notebook deve permanecer concentrada no conjunto final de 11 ajustes.
