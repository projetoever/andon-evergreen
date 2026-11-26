# M1-GLS-001 — Glossário normalizado do ANDON

**Revisão:** 0.1, DOC 1/M1 · **Status:** vocabulário de documentação; traduções finais dependem de comparação com o catálogo i18n do SHA homologado.

| Termo | Definição operacional |
|---|---|
| ANDON | Sistema de sinalização, chamado e acompanhamento de ocorrências por máquina/contexto. |
| Hub | Portal de entrada e navegação por módulos e permissões. |
| Workstation | Identidade persistida do navegador/terminal, sujeita a aprovação e restrição de acesso. |
| Usuário / Principal | Pessoa autenticada com grants, política de sessão e escopo. |
| Grant / Permissão | Capacidade atribuída para ação específica; não se presume do cargo exibido. |
| Escopo de máquina (`machineScope`) | Conjunto de máquinas cujo dado/recurso o usuário pode acessar. |
| Setor (`AndonCategory`) | Área técnica solicitada num chamado; pode ou não ter botão direto visível. |
| Grupo de chamados | Organização de setores para seleção de abertura em lote, sem substituir o setor. |
| Motivo / Opção | Catálogo versionado de abertura, com políticas de natureza e disposição BI. |
| Snapshot | Fotografia de descrição/revisão/ativo ou política no momento do fato; preserva histórico. |
| OS | Ordem de serviço, campo obrigatório quando política global ou máquina exigir. |
| Chamado aberto | Ocorrência ainda sem primeiro atendimento, status `open`. |
| Em atendimento | Ocorrência com fase ativa de atendimento `in_progress`. |
| Acompanhamento | Fase `post_maintenance` após conclusão do trabalho de manutenção. |
| Finalizado | Status `finished`; não equivale a cancelado. |
| Cancelado | Status `cancelled`, com justificativa e restrição de estado. |
| Retorno à manutenção | Nova fase técnica do mesmo chamado; não é automaticamente nova falha. |
| Técnico individual | Participante com sessão/período próprio; seu tempo não se soma como parada física. |
| Downtime físico | União temporal dos intervalos de parada por máquina. |
| Produção programada | Períodos planejados de operação; não decorrem do ranking P1..Pn. |
| Prioridade P1..Pn | Ordenação visual do sequenciamento. |
| MTTA | Tempo médio entre a abertura e o primeiro atendimento válido de uma coorte. |
| MTTR | No projeto, tempo médio de restabelecimento **físico corretivo elegível**, não horas-pessoa. |
| MTBF | Tempo operacional programado por início de episódio corretivo elegível; depende de cobertura causal. |
| Disponibilidade programada | Fração do tempo programado não perdida por paradas físicas válidas. |
| Taxa de retorno | Chamados concluídos elegíveis com 1+ retorno sobre total de concluídos elegíveis. |
| Reincidência | Novo chamado posterior com critério de correspondência histórica, distinto do retorno ao mesmo chamado. |
| Sem amostra | Não há denominador/episódio elegível para afirmar o indicador; não significa 0. |
| Zero observado | Medida válida e nula com população conhecida; ex.: retorno 0 de 1 = 0%. |
| Estimativa provisória | Valor parcial com causa/cobertura ainda inconclusiva e que pode mudar. |
| Auditoria transacional | Evento persistido da operação concluída ou decisão de acesso no backend. |
| Telemetria de interface | Navegação/clique reportado pelo cliente; não prova mutação bem-sucedida. |
| CAS / 409 | Controle de concorrência que impede sobrescrever alteração feita por outro usuário sem revisão. |
| 401 / 403 | Falta de autenticação / proibição por autorização ou estação, conforme endpoint. |
| CI | Execução automatizada de testes/build; não equivale a teste físico na linha. |
| HML | Homologação em ambiente isolado com versão, massa e evidência definidos. |
| SHA / commit | Identificador imutável de revisão de código-fonte no Git. |
| Manifest | Lista de versões, componentes e atributos do pacote; não confirma migrações aplicadas. |
| Rollback | Retorno controlado de código/configuração compatível, sem presumir reversão do banco. |
| Gate | Verificação formal que precisa ser concluída antes de aprovar a etapa seguinte. |
| GO / NO-GO | Decisão documentada de liberar ou bloquear determinada etapa de entrega. |

## Regras de tradução para manuais

As interfaces trabalham em português, inglês e chinês tradicional. Traduzir rótulos de navegação e mensagens conforme o catálogo do produto, não por tradução livre. **Não** traduzir automaticamente nomes cadastrados de máquinas, usuários, motivos, setores, OS ou histórico. Comparar termos e botões reais antes de publicar cada manual multilíngue.

## Siglas proibidas sem definição

Na primeira ocorrência em manual executivo, expandir MTTA, MTTR, MTBF, KPI, CI, HML, SLA, CAS, CSV e ACL. Não afirmar certificação de manutenção nem que disponibilidade isolada seja OEE.

[Contrato BI](../DOC1_CONTRATO_BI_20261125.md) · [Rastreabilidade](02_MATRIZ_RASTREABILIDADE.md) · [Manual operacional](10_MANUAL_OPERACAO_MANUTENCAO.md).
