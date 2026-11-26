# DOC 1 — Plano guiado de homologação por módulo, perfil e evidência

**Documento:** DOC1-QA-001 · 25/11/2026 · revisão para o próximo baseline de release.  
**Ambiente:** notebook isolado; **não executar em fábrica**.  
**Objetivo:** transformar checklist genérico em roteiro reprodutível; nenhum resultado abaixo é pré-marcado como OK.

## 1. Condições para iniciar
- Aprovação explícita para atualizar o notebook; backup com **teste de restauração isolada**.
- Registrar `git SHA` de origem e destino, frontend/API SHA expostos, Node, PostgreSQL, data, navegador, viewport e migrações.
- Usar dados sintéticos e contas de laboratório representando Admin, gerente/líder, operador, técnico, leitura e acesso negado; não exportar credenciais.
- Quando um teste falhar, abrir issue com ID do caso, comportamento esperado/observado, browser, evidência sanitizada e versão.
- Diferenciar: `NOT_RUN`/não executado, `PASS`, `FAIL`, `BLOCKED`, `NOT_APPLICABLE`. Não presumir `PASS` com base em CI.

## 2. Matriz de cenários

| ID | Módulo | Passos nucleares / variável | Prova requerida |
|---|---|---|---|
| H01 | Hub | Login, logout, acesso direto, transição rápida e volta | Resolução do acesso sem flash falso nem sessão alheia |
| H02 | Hub/ACL | Perfil sem `andon.read` vs perfil autorizado; bloquear workstation | Ícone ausente e resposta 401/403 real |
| H03 | Operação | Abrir chamado direto com OS obrigatória, duplicada e sem OS | Uma chamada consistente, falhas de validação claras |
| H04 | Grupos | Abrir grupo multi-setor, tentar setor ocupado e vínculo repetido | Somente setores permitidos, sem duplicidade |
| H05 | Grupos | Setor oculto, chamado ativo, reload e segundo terminal | Visibilidade derivada temporária e histórico preservado |
| H06 | Atendimento | Primeiro técnico, segundo técnico, tempos individuais | Não somar duas sessões como parada única |
| H07 | Atendimento | Encerramento individual, último atendente, retorno/acompanhamento | Bloqueios corretos, histórico coerente |
| H08 | Operação | Falha produtiva e sem impacto; definição de parada | Intervalos físicos e decisão final auditados |
| H09 | Histórico | Filtrar por máquina/período/diagnóstico; mudar seleção | Lista/detalhe sincronizados, sem salto ou perda de filtro |
| H10 | Histórico | Abrir detalhe e evidências por técnico e episódio | Tempos, produção e elegibilidade BI distinguíveis |
| H11 | Histórico/ACL | URL direta sem `history.global.read` e scope restrito | 401/403 e nenhum vazamento nas consultas/exportações |
| H12 | Prioridades | Selecionar contagem 1, 5 e N; 14+ cards | Destaques P1..Pn e ordenação/paginação preservados |
| H13 | Prioridades | Duas estações editando ranking e número de destaques | CAS 409, sem gravação parcial ou overwrite |
| H14 | Programação | Badges editáveis/read-only; credencial one-shot | Programação muda somente com autorização e log |
| H15 | BI | Zero denominador e denominador válido com zero retornos | “Sem amostra” versus 0% com explicação |
| H16 | BI | Falha corretiva com 1 episódio válido e causas pendentes/mistas | Indicadores definitivos/provisórios corretamente rotulados |
| H17 | BI | Mesmos filtros nos gráficos e CSV/tabela/detalhe | Métricas idênticas; sem números fabricados |
| H18 | BI visual | Rosca, disco, barras, Pareto, linha/área; claro/escuro | Legendas, valores e tooltips legíveis |
| H19 | Hub Audit | Somente `audit.read`, somente export e ambos | Permissões independentes; export 403 sem leitura |
| H20 | Hub Audit | Mutação real, clique e navegação; CSV filtrado | Evento transacional distinguível de UI; sem segredo |
| H21 | Sessão | “Não expirar”, Firefox/Chrome, refresh, fechar/reabrir, suspensão | Persistência conforme política, revogação real funciona |
| H22 | Mobile | 320, 360, 390, 430 px; modais e teclado | Nenhum botão essencial invisível; scroll adequado |
| H23 | Mobile | Chrome Android e Safari iOS físicos, idioma e orientação | Compatibilidade/touch comprovados no aparelho |
| H24 | Internacionalização | PT-BR/EN/zh-TW e rótulos longos, desktop/mobile | Sem truncar controles ou strings internas visíveis |
| H25 | Resiliência | Simular 503/API fora e 401/403 | Retry limitado somente transitório; sem falsa autorização |
| H26 | Instalador | Backup, menu 2, menu 6, verificar SHAs/serviços | Runtime coerente; logs e transação íntegra |
| H27 | Recuperação | Restore isolado, migrações, rollback com versão anterior | Preservar dados, retorno reproduzível/limitado |
| H28 | Segurança | Testes de CSRF, escopo, usuário revogado e URL direta | Sem bypass de bloqueios por manipulação de interface |

A lista original H01..H12 do [marco](DOC1_MATRIZ_FUNCIONAL_20261125.md) continua válida como **macrocategorias**. Os H01..H28 acima são cenários expandidos e precisam do prefixo `DOC1-QA-Hnn` ao abrir issue, evitando colisão de IDs.

## 3. Critério de evidência

Para cada teste coletar: `case_id`, data-hora com offset, SHA de frontend e backend, perfil/capabilities (sem identificação pessoal), workstation sintética, máquina sintética, navegador e versão, viewport, período de BI quando aplicável, resultado, link de captura ou log redigido, issue associada e revisor.

**Privacy-by-design:** não anexar PIN, senhas, cookies, dados pessoais, prints com hostnames reais, IPs fabris, bancos ou mapas de rede. Guardar artefatos controlados no Drive com permissões adequadas, nunca em repositório público.

## 4. Gates de aprovação

- **P0:** H03–H08, H11, H13–H16, H19–H21, H25–H28 devem passar ou ter exceção formal com mitigação — exceções que impliquem vulnerabilidade ou corrupção de dados são NO-GO.
- **P1:** ajustes visuais/legibilidade, desde que não impeçam leitura ou ação essencial; problema essencial vira P0.
- **MOB 1:** qualquer corte de ação ou vazamento de permissão no aparelho real é NO-GO mobile.
- **Comercial:** exige pacote versionado, suporte, licenciamento, documentação aprovada e autorização explícita posterior.

## 5. Modelo de registro em execução

```text
ID: DOC1-QA-H__
SHA UI: ________     SHA API: ________     Migrations: ________
Ambiente: notebook isolado | Data-hora (UTC-3): ________
Papel/permissões sintéticas: ________ | Escopo: ________
Navegador/dispositivo: ________ | Tela: ________
Pré-condição e massa sintética: ________
Passos executados: ________
Esperado: ________ | Observado: ________
Resultado: PASS | FAIL | BLOCKED | NOT_RUN | N/A
Evidência sanitizada: ________ | Issue: ________
Responsável pela homologação: ________ | Revisão: ________
```

**Atenção:** não usar “lista de testes escrita” como evidência de testes executados.
