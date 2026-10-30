# SEC-04/2I — abertura múltipla de setores com uma única transação

30/10/2026 — etapa do fechamento dos 10 ajustes do ANDON.

A rota `POST /api/andon-calls/batch` passa a reconhecer a sessão central **somente com** `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED=1`. A segunda flag é desligada por padrão.

## Comportamento garantido
- O domínio legado é reutilizado dentro de uma transação PostgreSQL compartilhada com a autorização central.
- Permissão `calls.open` e leitura ANDON, escopo real da máquina, workstation ativa/aprovada, HTTPS/origem, cookie HttpOnly e anti-CSRF.
- Usuário não pode enviar `createdBy`, origem de sistema ou `isSystemTest`. A autoria é atribuída ao usuário validado.
- Lote de 1–20 setores únicos e ativos; nenhuma gravação parcial: erro em qualquer setor reverte todo o lote.
- Mesmo setor ativo não pode ser duplicado por corridas simultâneas; setores distintos podem coexistir.
- A primeira parada física tem um único evento responsável e um único intervalo inicial de downtime; demais setores herdam a condição de parada.
- Uma auditoria por chamado criado, no mesmo commit do lote; erro ao auditar cancela todas as gravações.
- UI envia token anti-CSRF em memória para chamadas em lote no login central. Modo legado não muda.

## Testes CI
PostgreSQL isolado `/andon_test`: lote com dois setores, race duplo, setor inválido/duplicado, OS obrigatória, escopo, token/CSRF, autoria, auditoria e intervalo único de parada.

Sem ativação ou deploy no servidor Evergreen/M37/Node-RED/GPIO. A finalização definitiva ainda exige integração própria, e o pacote de dez ajustes ainda depende de homologação no notebook.
