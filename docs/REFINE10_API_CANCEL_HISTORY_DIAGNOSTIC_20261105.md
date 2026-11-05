# REFINE 10 — Diagnóstico seguro de cancelamento e histórico (EV-019)
Data: 05/11/2026
Referências: #351 (R10-01) e #352 (R10-02).
Banco permitido: somente PostgreSQL `andon_https_hml` isolado, porta 55432.
Código LAB: `C:\web-andon-refine8-hml\andon`.
**PROIBIDO**: instalar/testar em `C:\web-andon-industrial\andon`, `andon_db`, fábrica, GPIO, PLC ou Node-RED. Sem merge/deploy.

## Estado verificável no repositório
- PR #349: código R9.3, CI verde, usuário informou testes recentes OK; permanece draft/sem merge.
- PR #354: botão «Esqueci a senha» no login central, CI run 42100142538 verde; HML do novo link pendente.
- PR #355 (filha de #354): trata exclusivamente um subcaso determinístico de #351: resposta PATCH de cancelamento confirmada pelo servidor, mas GET posterior de refresh falha. Nunca reexecutar PATCH; não alterar ACL, máquina ou KPI no cliente. CI/HML independentes.
- Esta etapa de #352: testes reais no PostgreSQL de histórico de chamados antigos criados como kiosk e cancelados, `history.read`, escopo SQL de máquina, retorno 403/200 e ausência de escrita no histórico durante leitura. A aprovação destes cenários não comprova que a falha específica do navegador foi reproduzida.

## Verificação manual pelo usuário — somente LAB
1. Concluir atualização HML com verificação do SHA instalado, backup HML, isolamento e portas. Não executar `git pull` ou `git fetch origin` de um remoto apontando para a instalação original.
2. Abra DevTools (`F12`), guia Network/Rede e filtro `Fetch/XHR`. Marque `Preserve log` se necessário.
3. Para **histórico**, clique uma vez em Histórico; registre a *primeira requisição HTTP falha*, inclusive método, pathname, status e corpo de resposta. Diferencie `GET /api/andon-calls`, `GET /api/failure-events`, `GET /api/failure-classifications`, `GET /api/andon-calls/history` e `GET /health`. Não assumir que o histórico usa necessariamente o endpoint `/history`.
4. Para **cancelamento**, numa ocorrência aberta autorizada, registre separadamente:
   - resposta da `PATCH /api/andon-calls/<id>/cancel` (200/400/401/403/409/500);
   - respostas GET subsequentes, se houver;
   - estado do chamado após erro (aberto/cancelado);
   - perfil logado, se é o criador do chamado, e se ele precede a migração central;
   - request ID e linhas correspondentes de `api.log`/`api-error.log` apenas sem segredos.
5. Antes de repetir qualquer cancelamento após erro visual, confira por leitura se o PATCH anterior foi confirmado; não duplicar eventos, indicadores ou auditorias.
6. **Nunca enviar** cookies, `Authorization`, `x-andon-csrf`, token, hash, código de recuperação, senha, PIN, UUID completo, informações pessoais ou backup bruto. Oculte todos os segredos em capturas/respostas.

## Matriz de diagnóstico (não inferir causa sem HTTP)
| Condição observada | Interpretação a verificar | Tratamento |
|---|---|---|
| PATCH cancel 200 + GET falha | Mutação pode estar confirmada; frontend antigo pode mostrar erro | Verificar status, evitar novo PATCH, testar #355 |
| PATCH cancel 403 | Escopo, módulo, workstation, `calls.cancel.own` vs `.any` ou CSRF | Inspecionar código de resposta e registro do usuário; nunca afrouxar ACL |
| PATCH cancel 409 | Estado alterado ou chamado já atendido/cancelado | Recarregar registro antes de nova tentativa |
| GET histórico 403 | `history.read`, sessão, escopo ou módulo | Verificar principal e workstation sem liberar acesso indevido |
| GET histórico 500 | Servidor/Prisma/dados históricos | Correlacionar request ID e stack sanitizada; reproduzir no PG HML |
| GET /failure-events ou /andon-calls falha | Snapshot compartilhado do ANDON; pode impedir histórico | Diagnóstico da rota efetiva, não do título da página |

## Gates obrigatórios
- Proposta → implementação em branch → CI → HML pelo usuário → merge autorizado → implantação autorizada.
- #351 e #352 permanecem abertos até reproduzir as falhas relatadas e comprovar correção específica, preservando KPI e auditoria.
- #345 seleção por nome pendente; #350 agente opcional para workstations fixas continua adiado; mobile web não recebe agente.
