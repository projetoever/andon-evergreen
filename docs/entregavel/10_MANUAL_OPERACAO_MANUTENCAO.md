# MAN-OP-001 / MAN-MNT-001 — Guia de operação e manutenção do ANDON

**Revisão:** 0.1, M1, pré-entrega de 25/11/2026 · **Status:** minuta técnica, não homologada.  
**Público:** operadores de linha, mantenedores, apoio de processos e liderança.  
**Fonte:** `src/pages/DashboardPage.tsx`, `src/pages/MachineDetailPage.tsx`, `server/src/routes/andonCalls.ts`, `server/src/access/policy.ts` e [contrato operacional](../DOC1_FLUXOS_OPERACIONAIS_20261125.md).

> **Antes de operar:** estes passos são um roteiro editorial baseado no código. Rótulos finais, imagens, identidade de estação e regras específicas da instalação precisam ser conferidos no SHA instalado e aprovado em homologação. Não executar estes exercícios em linhas reais.

## 1. Objetivos de aprendizagem

Ao final, a pessoa deve conseguir identificar a máquina e seu estado, selecionar setor ou grupo, registrar OS quando exigida, entender o status do chamado, incluir técnicos autorizados, distinguir atendimento/acompanhamento/finalização e consultar histórico sem criar chamado indevido.

## 2. Entrar no ANDON

1. Abra a URL homologada da instalação e acesse o Hub `/hub`.
2. Faça a autenticação operacional quando exigida; confirme se o módulo **ANDON** está disponível ao perfil.
3. Abra `/andon`; o dashboard apresenta máquinas autorizadas, status e chamados.
4. Escolha a máquina e confirme o nome/identificação em `/machines/:machineId`.
5. Não use a URL direta para contornar uma função indisponível; o servidor deverá manter os bloqueios.
6. Se houver aviso de estação pendente, usuário revogado ou permissão negada, comunique o administrador. **Não** limpe cookies/IDs ou abra outro navegador para burlar o controle.

**Conferência:** a máquina escolhida e os eventos devem corresponder ao mesmo ID no card e no histórico. **Permissão fundamental:** `andon.read`.

## 3. Abrir chamado direto por setor

1. Verifique máquina correta, estado de produção e setor exibido.
2. Selecione o botão do setor/área técnica, respeitando bloqueio quando existir chamado ativo naquele contexto.
3. Escolha o motivo e a opção de abertura exibidos no modal, quando a configuração exigir.
4. Informe ordem de serviço (OS) quando a política global ou da máquina determinar; se o modo de OS duplicada estiver bloqueado, corrija o número antes de prosseguir.
5. Preencha campos operacionais obrigatórios sem utilizar senhas ou dados privados nas observações.
6. Confirme uma vez; aguarde o retorno do servidor e observe o novo chamado em estado **aberto**.
7. Em conexão lenta, consulte os chamados ativos antes de repetir, para não produzir uma duplicação.

**Conferência:** ID do chamado, máquina, setor, motivo e horário de abertura são persistidos. **Permissão:** `calls.open`; abertura não implica permissão de cancelamento ou fechamento.

## 4. Abrir chamado por grupo

Um grupo pode reunir setores diferentes na mesma interface de seleção. **Grupo não é um setor físico adicional nem um motivo automaticamente corretivo.**

1. Escolha a máquina e o botão do grupo configurado (exemplo sintético: `SETUP`).
2. Confira setores incluídos e selecione um ou vários permitidos.
3. O setor já ocupado por chamado ativo não pode ser duplicado por esse fluxo.
4. Informe motivo/opção de cada seleção, além de OS quando aplicável.
5. Confirme o lote e aguarde a resposta transacional.
6. Verifique quantos chamados foram efetivamente abertos. Um grupo multi-setor pode originar mais de um registro conforme a seleção; **não confundir lote com único chamado**.
7. Nos cards/históricos apropriados, confira a relação visual entre **setor solicitado** e **grupo**. A formatação final deve ser validada na versão instalada.

**Exceções:** revisão obsoleta do motivo/opção, concorrência entre duas workstations, setor já ocupado ou sessão inválida devem produzir erro claro e nenhuma abertura parcial indevida. O backend valida `reasonId`, `optionId` e revisões esperadas, não apenas texto do botão.

## 5. Setores ocultos e chamados ativos

Um setor pode ter a exibição direta desativada sem ser excluído do cadastro. Ao existir chamado ativo criado pelo grupo, o setor deve continuar acessível como contexto do atendimento onde o sistema prevê a exibição temporária. Não ative permanentemente um botão para “corrigir” a visualização sem autorização. Confirme o comportamento em reload, outra estação e encerramento. **Não** abrir novo chamado só porque o botão voltou a aparecer.

## 6. Iniciar atendimento

1. Abra o chamado `open` da máquina.
2. Selecione a ação de atendimento indicada na interface.
3. Identifique o mantenedor pelo método configurado (nome, PIN, TAG/RFID ou credencial conforme modo da instalação).
4. Confirme a entrada; o backend registra o primeiro atendimento e a fase `in_progress`.
5. Verifique técnico, área e horário do evento no painel.
6. Caso outra pessoa já esteja atendendo ou haja conflito de identificação, siga o aviso; não ignore o bloqueio de sessão exclusiva.

**Permissão:** `calls.attend` e verificações de identidade. **MTTA** decorre da abertura até o **primeiro** atendimento válido, não de cada técnico.

## 7. Dois ou mais mantenedores

1. No chamado em atendimento, acione a inclusão de técnico quando disponível.
2. Cada pessoa se identifica de acordo com a política configurada; a UI não deve emprestar sessão de outro usuário.
3. O sistema armazena períodos por técnico, inclusive atividades simultâneas.
4. Para concluir a participação de alguém, utilize a ação de encerramento individual quando autorizada; confirme o técnico correto.
5. Se for o último técnico, observe a regra especial de conclusão, evitando deixar chamado ativo inconsistente.
6. Veja os tempos individuais no histórico, mantendo diferença entre “horas-pessoa” e “parada de máquina”.

**Permissão:** `calls.technicians.manage`. **Não** somar dois períodos simultâneos como dois períodos de indisponibilidade física.

## 8. Concluir manutenção, acompanhar e retornar

O fluxo de manutenção é distinto da conclusão do chamado.

1. Quando o serviço técnico estiver efetivamente concluído, utilize **Concluir manutenção**, se disponível.
2. O chamado de manutenção muda de `in_progress` para `post_maintenance`, iniciando acompanhamento/validação.
3. Se o defeito persistir e houver necessidade de retomada, utilize **Retornar à manutenção** com justificativa se exigida.
4. Uma transição de retorno efetivada incrementa `maintenanceReturnCount`; múltiplos retornos do mesmo chamado **não** são novos chamados.
5. Após conclusão do trabalho, retorne à fase de acompanhamento e finalize o chamado sob as condições exigidas.
6. Não use finalização direta de manutenção real a partir de `in_progress`, pois o backend exige passagem por `post_maintenance`. Chamados de produção possuem regra específica, não intercambiável.

**Permissões distintas:** `calls.finishMaintenance`, `calls.returnToMaintenance`, `calls.finish`. A fase visual não confere automaticamente todos os grants.

## 9. Finalizar o chamado e informar parada física

1. Confira a máquina, a OS, o tipo de atendimento e os técnicos relacionados.
2. Registre diagnóstico, classificação e descrição obrigatória conforme o motivo de abertura.
3. Quando a máquina esteve parada, confira se o episódio físico e o impacto produtivo foram corretamente informados, sem inventar horários.
4. Se houver chamados simultâneos, respeite a regra de atribuição de impacto e a decisão exigida ao encerrar o último responsável pela parada.
5. Se o conjunto/subconjunto confirmado divergir do informado na abertura, explique a alteração conforme a política de confirmação.
6. Confirme finalização apenas após a validação. Busque o registro `finished` no histórico.
7. Se o servidor responder erro, **não** considere finalizado; atualize o registro antes de nova tentativa.

**Definições:** `attendanceMinutes` é tempo do fluxo de atendimento, `postMaintenanceMinutes` é acompanhamento; `machineStoppedMinutes` representa impacto físico calculado; `totalCallMinutes` é duração total do chamado. **Não** somar valores incompatíveis.

## 10. Cancelar um chamado

- Cancelamento depende de justificativa e regra de propriedade/permissão: `calls.cancel.own` e `calls.cancel.any` podem ter autoridades diferentes.
- O handler valida que o chamado ainda está `open` e sem atendimento registrado, inclusive sob transação; um chamado já atendido não pode ser cancelado pelo fluxo comum.
- O cancelamento fica registrado como `cancelled`; **não** é equivalente a exclusão física de histórico.
- Nunca use cancelamento para apagar registro real de manutenção; nesse caso, seguir correção/diagnóstico autorizados.

## 11. Consultar histórico e confirmar resultado

No módulo de histórico por máquina, filtre pelo período e ID do chamado. Em acesso central, o Histórico Global em `/history` apresenta lista e detalhe, com escopo e permissões próprias. Confirmar: abertura, primeiro atendimento, técnicos, mudanças de fase, atribuição de parada, diagnóstico, conclusão ou cancelamento. Sem permissão, solicitar acesso específico; não compartilhar login.

## 12. Mensagens, incidentes e recuperação

| Situação | Ação correta | O que evitar |
|---|---|---|
| 401 — sessão inválida | Autenticar novamente pelo Hub, conforme política | Repetir mutação sem validar o estado |
| 403 — sem permissão/estação | Solicitar análise do administrador | Testar outro link ou desativar segurança |
| 409 — concorrência | Recarregar e revisar alteração de outro operador | Sobrescrever alteração silenciosamente |
| 400 — regra inválida | Corrigir OS/campo/fluxo conforme mensagem | Insistir com dados falsos |
| Timeout/503 | Verificar conectividade e se a operação já foi concluída | Duplicar abertura, atendimento ou fechamento |
| Indicador “Sem amostra” | Abrir qualidade de dados e conferir elegibilidade | Digitar zero ou modificar diagnóstico para obter KPI |

## 13. Treinamento com dados sintéticos

**Exercício A:** máquina fictícia, setor Elétrica, OS exigida. Abrir um chamado, testar OS repetida, identificar-se, concluir manutenção, finalizar, localizar em histórico. Evidências: ID, fases, tempos, permissão e resultado `DOC1-QA-H03/H06/H07`.

**Exercício B:** grupo SETUP com dois setores, um deles ocupado. Selecionar o grupo, observar bloqueio e confirmar ausência de abertura duplicada. Validar restauração visual após encerramento (`DOC1-QA-H04/H05`).

**Exercício C:** dois técnicos sobrepostos e parada real registrada. Comparar tempos de pessoa e downtime físico, sem duplicação (`DOC1-QA-H06/H08`).

**Controle:** cada exercício exige SHA, browser, perfil de teste, captura sanitizada, resultado e revisor. Sem evidência, status é `NOT_RUN`.

## 14. Referências e aprovação

[Fluxos técnicos](../DOC1_FLUXOS_OPERACIONAIS_20261125.md) · [Rastreabilidade](02_MATRIZ_RASTREABILIDADE.md) · [Homologação](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).  
**Screenshots homologados:** pendentes. **Revisão por Produção e Manutenção:** pendente. **Autorização de uso fabril:** pendente.
