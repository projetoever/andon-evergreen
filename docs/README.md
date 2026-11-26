# Documentação oficial — ANDON Web Industrial

**Entrada recomendada para documentação.** Esta página organiza a consulta sem alterar a localização de 190+ registros históricos, preservando links de issues e PRs. O estado corrente do produto é confirmado pelo SHA da `main`, não pelo nome de um arquivo antigo.

## 1. Primeira leitura — base vigente

| Documento | Uso |
|---|---|
| [Estado Atual](ESTADO_ATUAL.md) | Contexto geral, baseline e limites |
| [Marco DOC 1](DOC1_MARCO_20261125.md) | Rastreabilidade dos refinamentos |
| [Arquitetura](ARQUITETURA.md) | Frontend, API, dados e perfis de implantação |
| [Instalação](INSTALACAO.md) | Procedimentos controlados; proteger base industrial |
| [Matriz de homologação](DOC1_HOMOLOGACAO_GUIADA_20261125.md) | 28 casos com evidência por SHA e perfil |
| [Biblioteca de pré-entrega M1](entregavel/README.md) | Índice de documentos, manuais e controles editoriais |

## 2. Referência técnica DOC 1

| Domínio | Referência |
|---|---|
| Modelo de dados | [36 modelos, snapshots e tempos](DOC1_DICIONARIO_DADOS_20261125.md) |
| Operação | [Abertura, grupos, técnicos e estados](DOC1_FLUXOS_OPERACIONAIS_20261125.md) |
| Navegação | [Rotas, telas, desktop e mobile](DOC1_MAPA_TELAS_NAVEGACAO_20261125.md) |
| Indicadores | [Origem de dados, amostras e critérios BI](DOC1_CONTRATO_BI_20261125.md) |
| Acesso | [Grants, perfis, escopo e auditoria](DOC1_AUTORIZACAO_MODULOS_20261125.md) |
| BI profundo | [Metodologia e qualidade de dados](BI_METODOLOGIA_E_QUALIDADE.md) |
| UX mobile | [Critérios MOB 1](MOB1_RESPONSIVE_ACCEPTANCE_20261125.md) |
| Entrega | [Plano de documentação e direitos](DOC1_PLANO_ENTREGAVEL_20261125.md) |

## 3. Manuais de pré-entrega e modelos futuros

A biblioteca [`entregavel/`](entregavel/README.md) contém governança, notas de versão, matriz de requisitos, manuais-base, suporte, glossário e termo de aceite. O [padrão editorial](entregavel/PADRAO_EDITORIAL_M1.md) define hierarquia, tamanho de fontes, composição de páginas e revisão de PDF/DOCX. Use os [modelos Markdown](entregavel/modelos/README.md) como ponto inicial, em vez de copiar formatação de documentos antigos.

**Estado:** o dossiê M1 e os manuais atuais são material de pré-entrega; não comprovaram testes físicos em notebook, browsers reais, dispositivo móvel ou instalação industrial. CI de uma PR é prova de automação, não homologação de produto.

## 4. Preparação de homologação e transição para entrega

A Fase 4 reúne o [runbook de HML](entregavel/30_RUNBOOK_HML_EVIDENCIAS.md), a [matriz de capturas e treinamento](entregavel/31_PLANO_CAPTURAS_E_TREINAMENTO.md) e o [checklist de transferência e release](entregavel/32_CHECKLIST_TRANSFERENCIA_E_RELEASE.md). Os **28 casos** continuam dependentes de ambiente autorizado e provas de execução; a documentação não instala software ou autoriza liberação de produto.

## 5. Relatórios e histórico

- [Registros anteriores e política de preservação](ARQUIVO_HISTORICO.md): índices REFINE, SEC04, PENTE, MOB, UX e outros registros cronológicos.
- [Roadmap](ROADMAP.md) e [plano do entregável](DOC1_PLANO_ENTREGAVEL_20261125.md).
- [Issue de governança DOC 1/M1 #655](https://github.com/projetoever/andon-evergreen/issues/655).

## 6. Regra de mudanças e publicação

1. Escrever em branch `docs/` + PR, sem editar runtime ou migrations apenas para atualizar manual.
2. Referenciar o SHA de origem, a revisão documental, a data e o perfil. Conferir links locais.
3. Não renomear/mover um registro histórico sem identificar seus links externos. Preferir índice canônico com referências cruzadas.
4. Validar acentuação, títulos, contraste, versionamento e fonte suficiente para leitura; gerar PDF e DOCX a partir de uma fonte controlada.
5. Registrar hash de cada artefato **após** revisão final e atualizar o índice oficial no Drive.
6. Não publicar credenciais, chaves, certificados, IPs/hosts industriais, backups ou dados reais em GitHub.
7. **Merge da documentação não autoriza deploy industrial** nem licença/redistribuição de código.

**Padrão de nomes:** códigos de documento `M1-[ÁREA]-NNN` ou `MAN-[PAPEL]-NNN`; arquivos preferencialmente `NN_TEMA.md` sob `entregavel/`; `docs/` mantém os documentos de engenharia e os históricos com seus nomes de origem.
