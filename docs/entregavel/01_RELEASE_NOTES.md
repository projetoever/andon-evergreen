# M1-REL-001 — Notas consolidadas da candidata documental

**Corte:** 25/11/2026 · **Escopo:** alterações de código **integradas** até o baseline funcional `6018335...` e documentação evolutiva M1.  
**Importante:** os itens abaixo são descrições de implementação confirmadas por PRs, **não** declaração de teste fabril.

## Marcos funcionais

| Bloco | Principais melhorias | Referências |
|---|---|---|
| Hub | Central de módulos, navegação autorizada, painel administrativo e proteção de acesso | #613, #634, #651 |
| Operação ANDON | Refinamento de grupos multissetor, seleção contextual, chamados, OS e gestão de técnicos | REFINE 23, #632 |
| Dashboard | Identificação setor/grupo, cards, nome de máquina legível e P1..Pn | #632, #646, #648 |
| Prioridades | Visão geral funcional, histórico por permissão, intervalo 1..N, CAS/409, produção programada e diálogos | #619, #620, #628, #646, #650, #652 |
| Histórico Global | Lista/detalhe, tempos por técnico, informações de parada, disposição BI, layouts | #627, #629, #630 |
| BI / conceitos | MTTR/MTBF causal, elegibilidade, população, retorno, saúde de dados | #636, #638, #639 |
| BI / visual | Cinco áreas, gráficos exploráveis, organização e contraste | #611, #612, #641–644, #649 |
| Segurança e auditoria | Ícone do Hub, audit.read/export, CSV, log de navegação/clique, traduções e transições resilientes | #651 |
| Mobile | Adaptação de pages/modals/drawer/cards com manutenção de acesso | #653 |
| DOC 1 | Registro da arquitetura, API, permissões, critérios de homologação e manuais planejados | #654, #656 e PR documental seguinte |

## Compatibilidade e limitações conhecidas

- O instalador mantém nome `1.0.0-pilot.3`; isso **não** garante que duas instalações possuam o mesmo SHA. Verificar em status e arquivos de configuração.
- Existe migration aditiva `20261125173000_priority_highlight_count`, não presumir aplicação em qualquer banco só porque consta na branch.
- `docker-compose.yml` da raiz possui configuração de desenvolvimento com PostgreSQL 16, diferente do ambiente piloto registrado anteriormente como PostgreSQL 17; a documentação do destino precisa confirmar versão e topologia.
- A opção de auditoria de cliques é de melhor esforço e não substitui eventos transacionais do backend.
- Os dashboards não atestam, isoladamente, desempenho produtivo industrial real nem certificações.
- Testes físicos com Safari iOS, Chrome Android, Firefox persistente e certificados confiáveis necessitam anexos de execução.
- Este documento não modifica a política de acesso nem oferece permissão para atualizar a infraestrutura fabril.

## Mudanças com potencial de migração/reteste

| Mudança | Risco | Gate |
|---|---|---|
| Número de destaques P1..Pn | Migration/configuração global | Backup/restore isolado, defaults, 1/5/N e CAS |
| Política de autorização central | 401/403; workstations e sessões | Matriz por perfil, URL direta, revogação |
| Auditoria de UI e CSV | Volume, retenção e privacidade | Limite 20.000 registros, payload redigido, filtros |
| BI causal | Denominador, classificação e programação | Amostras 0/N, null, parcial e reconciliação |
| Mobile | Controle oculto, teclado virtual e interação | Emulação + teste físico, PT/EN/zh-TW |
| HTTPS/instalador | Cadeia de confiança, backup, recuperação | Protocolo REFINE 15 / DOC1-QA |

## Regra de publicação

Na data de cada exportação oficial, preencher: versão de produto, SHA Git, SHA frontend, SHA API, revisão de documentação, lista de migrations aplicadas, arquivos/checksums, CI e parecer de HML. A distribuição de fonte/código compilado depende de titularidade, licenças e política de entrega aprovada.

**O marco M1 é uma foto de engenharia em elaboração, não a release comercial.**
