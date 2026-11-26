# M1-HML-001 — Runbook de homologação funcional e técnica

**Edição:** 0.1 · **Emissão:** 25/11/2026 · **Status:** planejamento, **nenhum teste marcado PASS**.  
**Versão de referência:** `1.0.0-pilot.3`; **baseline documental M1:** `main@630737c559cb93f6283eb77d9c1b77d66b731c54`. **SHA do software efetivamente instalado:** a preencher após leitura do notebook.

> Este plano NÃO autoriza alteração do notebook, ambiente industrial, certificados ou banco. Executar apenas após janela e autorização próprias. O código do marco foi aprovado por CI, mas não equivale a HML.

## 1. Objetivo e sequência

Gerar evidência reprodutível e auditável das 28 verificações `DOC1-QA-H01..H28` antes de classificar como homologado qualquer módulo e publicar manuais ilustrados.

| Gate | Atividades em ordem | Evidência exigida |
|---|---|---|
| HML-00 Preparação | Aprovação da sessão; identificar responsável, laboratório, massa sintética, perfis, janela e rollback | Ata de autorização, lista de contas sintéticas e escopo |
| HML-01 Congelamento | Ler SHA real dos arquivos/runtimes UI+API, versão instalador, banco e migrações efetivas; capturar status somente leitura | Manifesto HML com hashes e versão do Node/PostgreSQL |
| HML-02 Segurança dos dados | Criar backup autorizado; testar restauração em instância isolada; verificar volume e integridade | ID do backup, SHA-256 e relatório de RESTORE sem segredos |
| HML-03 Infra/HTTPS | Verificar TLS/SAN/CA e endpoints Health; diferenciar 401/403 de erro de API | Certificado não sensível, resultados por cliente e logs redigidos |
| HML-04 Operação | Usar casos de H01–H14 e H19–H21 em dois perfis e terminais | IDs sintéticos de chamados, mudanças e screenshots |
| HML-05 Dados e BI | Usar H15–H18 com coortes sintéticas, filtro idêntico e exportações | Tabelas de entrada/resultado esperado/observado |
| HML-06 Dispositivos | H22–H24 em 320/360/390/430 px, Firefox desktop, Android e iOS físicos | Evidência de aparelho real, SO/browser, idioma e orientação |
| HML-07 Falhas e recuperação | H25–H28 (rede, negação, instalador e backup/rollback) | Logs de erro/recuperação e assinaturas de TI/Sec |
| HML-08 Decisão | Triagem P0/P1/P2, testes repetidos, concordância dos aprovadores | Termo GO/NO-GO específico da etapa |

**Importante:** Gate HML-00 contém aprovação do *laboratório*. Aprovação de release comercial, transferência de código e deploy industrial continuam separadas.

## 2. Matriz de execução — 28 casos

Preencher resultado de **cada** teste com `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED` ou `N/A`. O valor padrão é `NOT_RUN`, jamais `PASS` só porque o fluxo existe.

| Casos | Grupo | Massa e evidências centrais | Aprovador |
|---|---|---|---|
| H01–H02 | Hub, autenticação e ACL | usuário com/sem acesso, URL direta, workstation bloqueada | TI / Admin |
| H03–H05 | Abertura, OS e grupos | duplicidade de OS, setores ocupados, grupos/ocultação | Operação / manutenção |
| H06–H08 | Múltiplos técnicos e parada | dois técnicos, último participante, retorno, parada física | Manutenção |
| H09–H11 | Histórico central/por máquina | filtro, timeline, exportação e escopo fora da máquina | Qualidade / TI |
| H12–H14 | P1..Pn e programação | contagem 1/5/N, alteração concorrente 409, credencial de programação | Liderança |
| H15–H18 | BI causal e visual | sem amostra, zero real, coorte parcial, gráficos e contraste | BI / qualidade |
| H19–H20 | Auditoria | leitura/exportação independentes, evento backend e `ui.click` sem segredos | Auditoria / TI |
| H21 | Sessão persistente | Chrome/Firefox, suspensão, logout/revogação, cookies/HTTPS | TI |
| H22–H23 | Mobile | resolução/touch, Chrome Android e Safari iOS físicos | Operação / TI |
| H24 | Internacionalização | PT-BR, inglês, chinês tradicional, textos longos, temas | Usuários de referência |
| H25 | Resiliência | 401/403 vs 503, navegação e retry controlado | TI |
| H26–H27 | Instalador e recuperação | atualização oficial, health read-only, restore isolado e rollback | Infraestrutura |
| H28 | Segurança negativa | CSRF, escopo, URL direta, revogação e bypass de interface | TI / Sec |

**Referência normativa de passos:** [DOC1-QA-H01..H28](../DOC1_HOMOLOGACAO_GUIADA_20261125.md). Esta tabela é uma fila de execução, não substitui os passos detalhados já aprovados editorialmente.

## 3. Massa sintética mínima e controles

Usar exclusivamente ambiente isolado, banco não produtivo e máquinas fictícias. Criar condições que permitam testar:
- máquina com OS obrigatória global/local, máquina sem OS obrigatória; dois números de OS distintos e tentativa repetida;
- setores diretos, setor oculto, grupo com dois setores, um setor já ocupado;
- chamado de manutenção `open → in_progress → post_maintenance → finished`; retorno do mesmo chamado a `in_progress`; situação de cancelamento antes de atendimento;
- dois técnicos com sessões sobrepostas e encerramento individual, sem somar períodos simultâneos como downtime;
- máquina com produção programada conhecida, uma com lacuna de cobertura e outra fora de produção;
- período BI **sem** chamados concluídos e outro com chamados concluídos sem retorno (esperar “Sem amostra” versus 0%);
- episódios de falha com causa confirmada, causa pendente e múltiplos chamados no mesmo intervalo físico;
- 14 máquinas fictícias ativas para faixa 1/5/N e alteração concorrente de prioridades;
- contas de laboratório `Admin`, operação, manutenção, líder, BI, auditor somente-leitura e usuário negado; dispositivos/estações de laboratório;
- nenhuma senha, PIN, cookie, token ou identificador fabril no conteúdo publicado.

IDs de chamados de teste e evidência pertencem ao **ambiente isolado**. Registrar início/fim de cada teste com fuso, evitar reuso de dados de outra instalação e restaurar o estado inicial conforme protocolo aprovado.

## 4. Formulário mínimo por execução

```text
EVIDENCE_ID: M1-HML-YYYYMMDD-<CASO>-<EXEC>
CASE_ID: DOC1-QA-H__
RESULT: NOT_RUN | PASS | FAIL | BLOCKED | N/A
EXECUTION_DATE_TIME_OFFSET: __________
ENVIRONMENT: notebook HML isolado / aparelho físico / outro autorizado
SOURCE_SHA: __________ UI_SHA: __________ API_SHA: __________
INSTALLER_VERSION: __________ NODE_VERSION: __________
DB_ENGINE_VERSION: __________ APPLIED_MIGRATIONS: __________
BROWSER_SO_DEVICE: __________ VIEWPORT: __________
LOCALE_THEME: __________ TEST_USER_ROLE_GRANTS_SCOPE: __________
TEST_MACHINE_ID_SYNTHETIC: __________
PRECONDITION_SYNTHETIC: __________
STEPS_PERFORMED: __________
EXPECTED: __________ OBSERVED: __________
DATABASE_OR_EXPORT_EVIDENCE_REDACTED: __________
SCREENSHOT_ID: __________
ISSUE_PR: __________
EXECUTOR: __________ REVIEWER: __________
DATE_SIGNED: __________
```

Guardar provas completas em repositório de evidências **restrito** no Drive, separado de PDF comercial e GitHub público. No GitHub referenciar somente ID de caso/PR e texto sanitizado.

## 5. Regras de aceite, reprovação e repetição

1. **P0 / NO-GO:** perda ou duplicação de chamado, corrupção de histórico, erro de parada/BI material, bypass de ACL, exportação de segredo, falha de backup/restore ou ausência de ação essencial mobile.
2. Falha P0 exige issue, isolamento de causa, correção com SHA, CI do novo commit e reexecução dos testes impactados antes de alterar o estado para PASS.
3. P1 de visual pode ser exceção documentada **apenas** quando a informação e ação permanecem plenamente utilizáveis; qualquer truncamento que impeça operar passa a P0.
4. `BLOCKED` ou `NOT_RUN` em gate obrigatório impede GO; não converter para `N/A` para melhorar o percentual de conclusão.
5. **CI é evidência auxiliar:** confirmar software compilado e versão do runtime instalada na HML; não confundir `main` remota e instalação antiga.
6. A própria execução pode mudar o banco de laboratório; exportações e backups precisam ser associados à janela e ao cenário para não alterar a interpretação dos KPIs.
7. O parecer final deve distinguir `GO HML`, `GO documentação`, `GO comercial` e `GO deploy`.

## 6. Resumo executivo após a sessão — modelo

| Métrica | Como preencher |
|---|---|
| Executados | Número de casos com PASS, FAIL ou N/A justificado |
| PASS | Contagem com prova e assinatura |
| FAIL | Contagem com issue associada |
| BLOCKED | Contagem + dependência |
| NOT_RUN | Contagem não executada; **não omitida** |
| P0 abertos | Total e risco de dado/segurança/operação |
| SHA aceito | Hash exato UI + API + schema |
| Decisão | Uma das quatro autorizações (HML, editorial, comercial, deploy) |

**Estado de publicação deste runbook:** planejamento / NOT_RUN. Próxima operação demanda autorização própria para instalar/ensaiar o notebook; jamais executar contra o servidor fabril automaticamente.

[Termo oficial de aceite](20_ACEITE_TERMO_E_FORMULARIOS.md) · [Matriz de rastreabilidade](02_MATRIZ_RASTREABILIDADE.md) · [Suporte](15_MANUAL_TI_SUPORTE.md) · [Padrão editorial](PADRAO_EDITORIAL_M1.md).
