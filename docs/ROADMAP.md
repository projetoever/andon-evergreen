# Roadmap governado — ANDON Web Industrial

**Atualização:** 25/11/2026. O histórico antigo de marcos `v1.15` até `v2.0` representa planejamento de arquitetura e **não versões atuais do instalador**. A fonte de versão é `release-manifest.json`; o piloto segue `1.0.0-pilot.3`.

## Situação por horizonte
| Horizonte | Foco | Critério de término |
|---|---|---|
| Marco DOC 1 (atual) | Documentar `main@6018335c...` com matriz, rastreabilidade e pendências; recuperar contexto de REFINE23/PENTEs/MOB1. | Documentação em Drive e PR de docs revisadas |
| Homologação da candidata | Fluxos de chamados e grupos, Histórico, Prioridades P1..Pn, BI, auditoria, sessões, responsividade, segurança e instalador. | Casos [DOC1-H01..H12](DOC1_MATRIZ_FUNCIONAL_20261125.md) com evidência, bugs triados |
| Congelamento de release | Tag/SHA, checksum, backup/restauração, migrações e checklist de atualização/reversão. | CI no SHA final + aceite técnico; nenhuma implantação automática |
| Documentação do produto | Guias por perfil/módulo, tutoriais com telas reais, referência técnica, pacote editável/PDF e treinamento. | Revisão funcional/editorial e aprovações |
| Entregável controlado | Código-fonte versionado, instalador, manuais, suporte, direitos de uso/licenciamento e identidade neutra por cliente. | Aprovação comercial, segurança e termos |
| Evolução futura | SDK/IT-OT, equipamentos, CLPs, Node-RED e conectores opcionais, em ensaios separados. | Gated testing industrial por integração e autorização |

## Governança do backlog
- PR com **CI verde** ainda requer teste funcional; merge não habilita implantação na fábrica.
- Números de piloto observados em print não constituem prova de ganho financeiro ou produtividade.
- Preferir correções rastreadas por issue e testes sem refatorar componentes estáveis sem necessidade.
- Mudanças de cálculo BI exigem dataset controlado, metodologia e regressão; melhorias visuais não devem alterar amostras.
- Tratar versões históricas do roadmap antigo como histórico Git, mantendo o estado atual nos documentos [DOC 1](DOC1_MARCO_20261125.md) e [Plano editorial](DOC1_PLANO_ENTREGAVEL_20261125.md).
