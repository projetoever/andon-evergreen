# DOC 1 — Caderno editorial dos manuais e tutoriais do ANDON

**Etapa:** especificação controlada da fase de autoria, ainda sem screenshots e sem aceite de release.  
**Públicos:** operação, manutenção, liderança, administrador funcional, TI/suporte e auditor autorizado.

## 1. Biblioteca de entregáveis por módulo

| Código previsto | Guia | Resultado que o leitor deve conseguir demonstrar |
|---|---|---|
| MAN-OP-001 | Operador — Dashboard e abertura | Encontrar máquina, setor ou grupo; abrir chamado e OS correta; acompanhar status |
| MAN-MNT-001 | Mantenedor — Atendimento completo | Identificar-se, assumir/compartilhar trabalho, registrar fases e finalizar sem perder trilha |
| MAN-LID-001 | Liderança — Supervisão | Ler cards, prioridades, estados, tempos e histórico sem interpretar contador como meta validada |
| MAN-PRI-001 | Prioridades e programação | Entender P1..Pn, ranking versus produção programada, salvar com permissão e resolver conflito |
| MAN-HIS-001 | Histórico por máquina e Global | Pesquisar, filtrar, ler timeline e exportar somente o permitido |
| MAN-BI-001 | BI e qualidade de dados | Interpretar disponibilidade/MTTA/MTTR/MTBF/downtime/retorno, N/A e limites causais |
| MAN-HUB-001 | Hub, usuários e perfis | Navegar, administrar grants e estação, revisar acessos sem confundir UI e servidor |
| MAN-AUD-001 | Auditoria e rastreabilidade | Filtrar eventos, distinguir clique de mutação e exportar CSV com controle |
| MAN-ADM-001 | Configuração ANDON | Manter máquinas, setores/grupos, motivos, classificações, técnicos, turnos e regras |
| MAN-MOB-001 | Uso mobile | Executar os mesmos fluxos essenciais por toque e navegação responsiva |
| MAN-INS-001 | Implantação e atualização | Registrar versão, instalar/atualizar corretamente em alvo autorizado e verificar Health |
| MAN-SUP-001 | Suporte, contingência e recuperação | Diagnosticar falhas, proteger dados e documentar backup/restore/rollback |

Os códigos são **identificadores editoriais propostos**, não nomes de arquivos já publicados.

## Padrão visual obrigatório a partir do M1 v0.2

Adotar o [Padrão Editorial M1](entregavel/PADRAO_EDITORIAL_M1.md) em toda nova geração DOCX/PDF: corpo **11,5 pt**, tabelas **10,8 pt**, H1 **19 pt**, H2 **14,2 pt**, A4, margens laterais **1,85 cm**, cabeçalhos repetidos e sem quebras artificiais por seção. Os [modelos reutilizáveis](entregavel/modelos/README.md) definem metadados, procedimentos, tabelas, evidências e revisão. PDF final sempre renderizado e verificado, com DOCX editável e hashes. Não reprocessar manual homologado silenciosamente; criar nova edição.

## 2. Contrato de cada página de manual

1. **Título, revisão, SHA e status** (“prévia”, “homologada” ou “obsoleta”).
2. Objetivo, quando usar, pré-requisitos e perfil necessário.
3. Nome do botão atual e caminho de navegação na interface, com equivalência PT/EN/zh-TW quando relevante.
4. Screenshot **real do SHA homologado**, recortado com contraste, sem dados pessoais ou internos sensíveis.
5. Procedimento numerado (ação → resposta esperada → como confirmar no histórico/indicador).
6. Alertas de segurança e bloqueios, como 401/403/409, OS e configuração de grupos.
7. Casos de exceção e recuperação sem perder registro.
8. Exercício de treinamento com dados sintéticos, perguntas de verificação e resultado esperado.
9. Links para os critérios `DOC1-QA-Hxx`, código, PR, issue, revisor, data e aprovação.

## 3. Conteúdo mínimo especialmente sensível

**Grupos:** “setor” é catálogo e “grupo” é forma configurável de seleção; o operador deve ver o setor e nome do grupo no card/histórico. Setor oculto em botão direto ainda pode estar visível durante chamado ativo sem virar nova abertura.

**Atendimento múltiplo:** tempos por técnico e parada física da máquina são medidas diferentes; instruir quem pode encerrar individualmente, quem define impacto e quais campos são obrigatórios.

**Prioridades:** o rank não liga/desliga programação. Destacar P1..Pn apenas até N configurado, limitado ao número de máquinas ativas; alteração precisa ser salva e pode receber 409.

**BI:** “Sem amostra” não é 0. 0% de retorno exige ao menos um atendimento concluído elegível; MTTR/MTBF podem não ter amostra mesmo com chamados abertos/atendidos. Evitar prometer eficiência ou economia sem baseline.

**Auditoria:** UI click e UI route são informação de navegação; a mutação confirmada pelo backend é a fonte de prova da operação. Não apresentar cobertura universal de todos os cliques.

**Mobile:** mesmo conteúdo e mesmas permissões do desktop; screenshots de emulador não substituem homologação em Android/iOS reais.

## 4. Roteiro de produção editorial

Fase A — consolidar os textos normativos e inventariar todas as telas e permissões.  
Fase B — homologar os casos e obter capturas por módulo no SHA escolhido.  
Fase C — redigir guias de Operador, Mantenedor e Liderança primeiro; depois Admin, Prioridades, BI, Histórico, Auditoria, Mobile e TI.  
Fase D — revisão técnica cruzada em PT-BR; traduzir conforme terminologia do sistema, sem forçar tradução de dados cadastrados.  
Fase E — gerar DOCX editável + PDF/A quando pertinente + pacote de arquivos, links e checksums; revisar direitos e obter aceite.

## Referências de autoria da Fase 3

Para escrever procedimentos sem suposições, usar o [dicionário de dados](DOC1_DICIONARIO_DADOS_20261125.md), o [fluxo de chamados](DOC1_FLUXOS_OPERACIONAIS_20261125.md), o [inventário de telas](DOC1_MAPA_TELAS_NAVEGACAO_20261125.md) e o [contrato BI](DOC1_CONTRATO_BI_20261125.md). Nenhum screenshot antigo pode substituir o ato de testar a versão definida.

## 5. Referências

- [Biblioteca/documentos do entregável](DOC1_PLANO_ENTREGAVEL_20261125.md)
- [Roteiro de homologação](DOC1_HOMOLOGACAO_GUIADA_20261125.md)
- [Matriz funcional](DOC1_MATRIZ_FUNCIONAL_20261125.md)
- [Direitos, maturidade e marco](DOC1_MARCO_20261125.md)

**Regra:** elaborar e validar conteúdo antes de declarar pronto o manual. Nenhuma imagem de protótipo, print de versão antiga ou captura de ambiente sensível deve ser tratada como tela final.
