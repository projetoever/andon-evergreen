# REFINE 12 / R12-02B2 — seleção por nome declarada na interface (08/11/2026)

Esta branch parte de #388 e #386, que partem de E034 #385. Não compõe o pacote HML E034 já liberado ao operador.

## Implementado
- O GET de `/api/system-settings` retorna `centralDeclaredNameAttendanceEnabled` somente como *capacidade runtime* read-only, sem gravar flag no PostgreSQL ou confiar em permissões do browser.
- `PATCH /api/system-settings` aceita `attendanceMode=name` SOMENTE quando a flag `ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED=1` e acesso central estão ativos. Ainda exige opt-in `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED=1`, grant, CSRF, origem HTTPS, workstation e auditoria da configuração; sem flags, falha fechada.
- A configuração da tela exibe a alternativa por nome somente com capacidade explícita do servidor; informa que nome é declaração do operador, jamais autenticação PIN/RFID.
- O modal de atendimento inicial oferece nomes somente na fase `start` e com flag retornada do servidor. O frontend faz `PATCH /api/andon-calls/:id/attend-declared` com `technicianNames` (sem campos `identityVerified` nem credenciais). O cliente adiciona CSRF à nova rota. Operações com PIN/RFID continuam usando a rota antiga.
- A adição de técnicos em chamado ativo/a acompanhamento continua usando PIN/RFID (poupa falsa promessa de funcionalidade ainda não implantada).
- Os defaults existentes/instalação industrial permanecem com a flag OFF; o launcher HML da E034 NÃO permite a flag nova.

## PENDÊNCIAS ANTES DA PR SER ATIVÁVEL
- CI Windows, backend, PG, frontend/browser da branch combinada E034+R12-02A/B1/B2.
- Testes exclusivos de 2 clientes concorrendo pelo mesmo técnico com autenticação de ator e auditoria declarativa, reversão ao falhar audit, revogação de workstation, timeouts, sessão de técnico legado.
- Revisar traduções explícitas PT/EN/ZH (novas mensagens) e testes visuais da seleção por nome.
- Adição de técnico por nome em acompanhamento ainda NÃO implementada. Este lote apenas inicia atendimento.
- Atualização HML em ambiente isolado com opt-in posterior e autorização independente; NÃO misturar com a E034 entregue para testes no notebook.
- Preservar C:\\web-andon-industrial\\andon, `andon_db`, CLP, GPIO, Node-RED e fábrica.

## Procedimento atual do usuário
User já autorizou somente atualização HML E034 SHA `92debbe57d96f452cc2d72082e3fd6787294b246` para testar histórico, cancelar, som, permissões e cadastro. Esta branch B2 não altera aquele commit nem deve ser mesclada/deployada.
