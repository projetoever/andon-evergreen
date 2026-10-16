# ANDON BI — detalhamento, gestão e entrega

Planejamento de 16/10/2026 para `1.0.0-pilot.3`. Base: main `81c9b41`. Este documento separa a implementação candidata desta revisão das próximas etapas. Publicar um PR não atualiza a instalação da empresa.

## Situação atual e sequência

| Etapa | Conteúdo | Situação nesta revisão |
| --- | --- | --- |
| 1 — detalhamento | Janelas dos KPIs, gráficos ampliados, dados paginados e contexto da consulta | Implementado na candidata; depende de aprovação e atualização |
| 2 — central de relatórios | Presets persistentes, geração pelo servidor, agenda e notificações internas | Planejado |
| 3 — recursos de gestão | Metas, alertas contextualizados, responsáveis e acompanhamento de ações | Planejado |
| 4 — revisão e entrega | Regressão do ecossistema, homologação do piloto e documentação final | Planejado |

O produto já possui Machine 360, investigação de qualidade, detalhamento de máquinas/classificações/setores e impressão de relatório executivo ou individual em PDF. A etapa 1 reutiliza essas capacidades.

## Etapa 1 — janelas do tópico

O ícone de expansão nos cartões e cabeçalhos abre uma janela modal mantendo o estilo do ANDON. A janela mostra o instante de geração, o intervalo efetivamente observado, o fuso, os filtros aplicados e a versão da definição analítica.

| Área | Tópicos com expansão |
| --- | --- |
| Visão geral | Disponibilidade, MTBF, MTTA, MTTR, tempo de parada e taxa de retorno |
| Gráficos da visão geral | Disponibilidade por dia, parada por dia e máquinas com maior parada |
| Confiabilidade | Intervalo por calendário, episódios físicos, parada média por episódio, duração média do chamado, finalizados e cobertura de diagnóstico |
| Classificações e setores | Ranking de diagnósticos concluídos e demanda por setor solicitado |

Há 17 entradas. Os indicadores abrem na **Base do indicador**, com definição, expressão do cálculo e entradas efetivamente disponíveis na resposta. Os gráficos abrem ampliados, com opção **Dados** para a tabela paginada. No ranking de máquinas e nas distribuições, selecionar o nome abre a investigação de registros já existente. Isso não transforma um registro de chamado em prova de causa de um episódio físico.

Regras desta implementação:

- Valores são lidos do mesmo objeto `AnalyticsOverview` mostrado no painel. Não há nova fórmula operacional no navegador nem consulta a um relógio local para redefinir o período.
- `null` continua indisponível; zero permanece zero. Ausência de programação verificável e filtro incompatível são explicitados.
- MTTR mantém a amostra de episódios físicos de manutenção; atendimento técnico continua separado. A janela não deduz amostra ou somatório que a API não fornece.
- A tabela contém todas as linhas retornadas naquele agregado. Não promete catálogo completo ou exportação ilimitada de ocorrências. A investigação existente continua com limite de 20 itens por consulta.
- A janela fecha com Esc e devolve foco ao controle de abertura. O foco permanece dentro da janela enquanto aberta. Trocar filtros, aba ou atualizar encerra o detalhe anterior.
- Os três idiomas se aplicam à interface nova; nomes cadastrados e demais conteúdo de usuário são preservados.
- A paginação reduz a densidade; em telas muito pequenas ou com zoom alto, apenas o conteúdo interno pode precisar de rolagem.
- Contratos de API, schema, migrations, cálculos, identidade de workstation e permissões permanecem os mesmos nesta etapa.

As novas expansões não incluem uma lista individual de todos os elementos de cada denominador. Para uma auditoria completa por episódio do MTTR/MTBF, uma futura API deve devolver exatamente a coorte causal usada no cálculo, com paginação e reconciliação. Não reutilizar a lista genérica de chamados como se fosse essa coorte.

### Evidência e aceite da candidata

Typecheck e builds frontend/backend passaram, assim como 268 testes de interface e 57 testes analíticos. Cinco testes novos verificam a passagem de resultados analíticos reais para o modelo de apresentação, separação de restabelecimento e atendimento técnico, indisponível versus zero, preservação de nomes/IDs, datas operacionais, tradução e ausência de mutação do resultado original. Os arquivos TypeScript alterados passaram no lint direcionado. O lint global ainda falha por dívida anterior de formatação e quatro erros de regras de código fora desta mudança; não é anunciado como aprovado.

Não houve homologação visual nesta execução: o Chromium de QA foi impedido de inicializar seu socket interno (`Operation not permitted`) antes de abrir a página. Assim, foco, transição para a investigação e responsividade têm implementação e revisão de código, mas ainda precisam de teste em navegador. Não houve migração, execução sobre o banco da empresa ou teste físico de Node-RED/GPIO.

Roteiro de aceite visual em modo API:

1. Abrir as nove expansões da visão geral, as seis de confiabilidade e as duas de classificações/setores. Conferir valor, fórmula, período, filtros e amostra contra o painel.
2. Alternar Base/Gráfico/Dados, paginar e abrir uma linha de máquina, classificação ou setor. Conferir que o nome cadastrado e a chave de consulta original são mantidos.
3. Fechar por Esc e pelo ícone; navegar com Tab e Shift+Tab. Conferir que o foco fica na janela e retorna ao botão de expansão ao fechar.
4. Repetir em Português, English e 繁體中文, com filtros e sem programação verificável. Zero e indisponível devem continuar diferentes.
5. Conferir pelo menos 1366×768 e 1280×704, além de uma janela estreita/zoom alto. Validar que os controles permanecem alcançáveis e a página externa não ganha rolagem horizontal.

## Etapa 2 — central de relatórios proposta

### Experiência e modelos

Uma central dentro do BI reúne relatórios disponíveis, agendas e notificações de geração. O gestor salva um modelo com nome, idioma, filtros, seções e intervalo. Modelos iniciais propostos: resumo executivo, perdas por responsabilidade, máquinas prioritárias, participação técnica e qualidade dos dados. A criação de modelos não altera registros operacionais.

Agenda proposta:

| Frequência | Recorte padrão proposto | Exemplo de execução |
| --- | --- | --- |
| Diária | Dia operacional anterior completo | 07h no fuso da instalação |
| Semanal | Semana anterior completa, segunda a domingo | Segunda, 07h |
| Mensal | Mês anterior completo | Dia 1, 07h |
| Manual | Recorte explicitamente escolhido | Sob demanda |

Os exemplos não são agendas já ativadas. O fuso é persistido; horário de envio e recorte do relatório são campos separados. Períodos móveis devem ser identificados como tais, com dias parciais explícitos. Não anunciar fechamento de turno sem um calendário de turnos confiável associado à exposição.

### Execução independente do navegador

O servidor executará a agenda e gravará configurações, execuções e notificações em PostgreSQL por migrations aditivas. O agendador terá ciclo de vida associado à API, limite de concorrência e encerramento controlado. Não dependerá de aba aberta, LocalStorage, timer do navegador ou de um agendamento pessoal do ChatGPT.

Cada execução terá identificador, versão do modelo, período resolvido, filtros, idioma, definição de indicadores, geração, status e erro sanitizado. O resultado deverá congelar os dados usados para que um relatório enviado não mude silenciosamente após edição de diagnóstico. Uma nova geração produz outra versão.

Requisitos de consistência:

- Consulta das seções em um snapshot transacional coerente, aplicando a mesma política de elegibilidade de todos os endpoints analíticos.
- Chave única de agenda + ocorrência programada para impedir duas execuções da mesma ocorrência; trava com prazo de expiração para múltiplos processos e recuperação após falha.
- Separar estado de geração de estado de entrega: pronto, falha de geração, entrega pendente, entregue ou falha de entrega não são equivalentes.
- Retentativas limitadas com espera progressiva; repetir a entrega sem recalcular o relatório. SMTP não garante entrega exatamente uma vez: registrar tentativa e identificador para diagnóstico e reduzir duplicações.
- Após indisponibilidade, consolidar a recuperação em uma geração pendente conforme política explícita, sem disparar uma avalanche de relatórios antigos.
- Exibir última e próxima execução, erro, tentativas e pausa/retomada. Um envio falho não deve aparecer como sucesso.
- Definir retenção de arquivos e execuções, preservando metadados de auditoria e limites de armazenamento.

### Notificações e entrega externa

Primeiro canal proposto: central interna do BI, com relatório pronto, execução com falha e agenda pausada. Não depender de notificações do sistema operacional. Preferências e leitura devem ser persistentes; a granularidade pessoal exige identidade de usuário, ainda não equivalente à identidade de workstation.

E-mail é a extensão seguinte, configurada com o serviço corporativo e destinatários aprovados. Antes de ativar, definir remetente, autenticação SMTP, destinatários, tamanho máximo, política de anexos/links e testes no ambiente da empresa. Segredos ficam na configuração protegida do servidor; nunca em payloads de consulta, histórico de agenda ou logs. Nenhuma mensagem externa foi enviada por esta etapa.

O PDF atual usa a impressão do navegador. Geração automática de PDF requer um renderizador no servidor, com fontes locais e operação offline homologadas no Windows Server 2016. Escolher e validar essa dependência é parte da etapa 2; não tratar a função de impressão atual como um serviço de PDF automático.

### Autoridade e permissões

O Hub continua responsável por workstations, liberação de módulos e credenciais. Modelos, filtros, seções e agendas pertencem ao domínio BI. A API deve verificar autorização em criar/editar/pausar, gerar, listar e baixar. Guardar o ID de uma workstation no navegador não basta para autorizar download.

Configurar uma agenda deve exigir autorização administrativa apropriada. Consulta gerencial deve respeitar a permissão do módulo e o escopo configurado. Revogação precisa bloquear novas consultas e entregas pendentes. Destinatários externos e acesso direto a arquivos não podem contornar essa revogação. Usuários corporativos individuais/SSO continuam um trabalho distinto da autenticação atual de módulo.

## Etapa 3 — funções para gestores propostas

1. **Visões salvas**: filtros e relatórios favoritos com comparação equivalente e qualidade da amostra visível.
2. **Metas contextualizadas**: disponibilidade, resposta e restabelecimento, com vigência, população e autor da configuração. Ausência de dados não vira cumprimento de meta.
3. **Alertas**: perda acima do limite, causa pendente e reincidência; quantidade mínima de amostra, tolerância, janela de avaliação e intervalo entre avisos. Sem ranking de produtividade individual baseado apenas em tempo técnico.
4. **Acompanhamento**: ação gerencial, responsável, prazo, situação e evidência, vinculados à análise. Reconhecer um alerta não reclassifica chamados nem altera tempos.
5. **Responsabilidade da perda**: manutenção, operação, processos, qualidade, liderança, outros e pendente, conservando a soma da parada total. Tempo de apoio técnico continua contabilizado mesmo com causa fora da manutenção.

Esses itens dependem de persistência, autorização e auditoria próprias; não são botões simulados na etapa 1.

## Etapa 4 — revisão do ecossistema e pacote de entrega

| Fluxo | Evidência de aceite pretendida |
| --- | --- |
| Hub e entrada 8080 | Módulos visíveis conforme permissão, senha, bloqueio e aprovação de nova workstation |
| ANDON operacional | Abrir/atender/finalizar/cancelar, múltiplos chamados, todas as credenciais e turnos, restrição de conclusão e sessão técnica correta |
| Máquina e dashboard | Estado físico separado do chamado, responsividade, idioma e som com múltiplos setores |
| BI | Reconciliar chamados, união de parada, responsabilidade, amostras, programação, exclusões, relatórios e nova agenda |
| Prioridades | Permissões, ordenação, navegação e isolamento da operação |
| Integrações | Contratos HTTP usados pelo Node-RED e GPIO comparados; sirene e mini PC testados fisicamente na empresa |
| Instalação e recuperação | Atualização preserva configuração/dados; backup e restauração testados em cópia, incluindo os novos arquivos de relatórios quando existirem |

Pacote final previsto: guia rápido do operador e mantenedor, manual do gestor/BI, manual do administrador do Hub, catálogo de indicadores com fórmulas/amostras/exclusões, arquitetura e mapa de contratos, instalação/atualização/recuperação, roteiro de homologação, limitações conhecidas e registro de versão entregue.

Antes da expansão após o piloto de dois meses, registrar no aceite: versão realmente instalada, revisão dos diagnósticos legados relevantes, conferência manual de uma amostra de perdas, cobertura de programação, incidentes e pendências abertas. Documentos finais devem refletir o código e os testes da versão homologada, e não apenas este planejamento.
