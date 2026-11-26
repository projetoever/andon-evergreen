# M1-GOV-001 — Protocolo formal do marco técnico do ANDON

**Identificação:** `M1-DOC1-20261125` · **Edição:** 0.1 · **Nome:** ANDON Web Industrial — Pré-entrega do piloto  
**Destinatário:** liderança do projeto, operação, TI, qualidade e manutenção.  
**Situação:** preparação documental; **NÃO é termo de homologação, publicação comercial ou autorização para atualização do servidor**.

## Declaração do marco

O marco M1 registra um patamar de **consolidação de código e documentação** após REFINE 23, PENTE 1–6 e MOB 1. A intenção é transformar um sistema operacional em uma solução replicável e auditável, com regras verificáveis por módulo, manuais, instalação controlada e evidências de aceite. A declaração **não comprova** por si só a precisão dos indicadores na base industrial, a disponibilidade do ambiente, a resistência a falhas reais ou a conformidade regulatória.

## Identificadores de verdade

| Item | Identificação / condição |
|---|---|
| Repositório | `projetoever/andon-evergreen` (`main`) |
| Baseline funcional do fechamento REFINE/PENTE/MOB | `6018335c6f085757a0fd35faed8a2893f4f03e0a` |
| DOC 1 / documentação fase 1 | PR #654, squash `9d7cbb8f3d85f2528f1df574e82989bedce5f03b` |
| DOC 1 / documentação fase 2 | PR #656, squash `c7c7837b77be4ce9e1d817913ff921e3f38413d4` |
| DOC 1 / documentação fase 3 + M1 | PR documental em revisão; verificar HEAD e CI antes de eventual merge |
| Versão de instalador | `1.0.0-pilot.3` conforme `release-manifest.json` |
| Node do runtime | `22.23.2`, conforme manifesto |
| Banco | PostgreSQL no piloto; **versão e migrações do destino precisam de inventário real** |
| CI da versão funcional | PR #653 foi aprovada; executar CI do SHA documental final |
| Notebook / celulares / servidor industrial | **Sem aceite comprovado neste pacote** |
| Licença e permissão de distribuição | **Em revisão; não presumir direito de redistribuir código** |

## Regra de congelamento da candidata

A release candidata deve ter **SHA de frontend e API, commit de fonte, revisão do instalador, conjunto de migrations, perfil HTTPS, configuração e massa isolada** identificados numa ata. É inválido congelar apenas uma palavra como “pilot.3”, pois a mesma versão de manifesto pode conter SHAs distintos. Mudanças posteriores alteram o baseline; reabrir os testes afetados e atualizar manuais e screenshots.

## Escopo em preparação para entrega

- Hub: entrada, sessões, usuários, permissões e workstations.
- Dashboard: cards, estados, atalhos e prioridade visual.
- Operação: abertura por setor e grupos, OS, atendimentos, múltiplos técnicos, impacto e fechamento.
- Prioridades: P1..Pn, histórico de alteração e produção programada independente.
- Históricos: detalhe por máquina e Global, filtros, tempos e exportações autorizadas.
- BI: Visão Geral, Confiabilidade, Falhas, Manutenção, Qualidade de Dados e detalhamentos.
- Administração: catálogos, configurações, i18n, temas, auditoria/CSV.
- Mobile: responsividade e paridade de funções.
- Instalação e suporte: runtimes, migração/backup, Health, TLS e contingência.

**Fora do escopo de homologação por presunção:** rede fabril, CLP/ESP32/Node-RED, indicadores industriais reais, SLA contratado, integração ERP/CMMS, certificações, venda, licença e implantação externa. Cada item depende de um aceite próprio.

## Gates obrigatórios e resultado atual

| Gate | Critério de saída | Estado neste documento |
|---|---|---|
| G0 — Código/escopo | SHA e PRs de funcionalidades identificados, histórico preservado | Base identificada |
| G1 — Documentação | Pacote de manuais, arquitetura e matriz rastreável revisado | Em preparação |
| G2 — CI | Workflow Linux/PostgreSQL/Windows do SHA final verde | Verificar no SHA da PR documental |
| G3 — Dados | Backup, restauração isolada, migrations e massa controlada | Não executado aqui |
| G4 — HML funcional | `DOC1-QA-H01..H28`, segurança, prioridades, grupos e BI | Não executado aqui |
| G5 — HML dispositivos | Android real, iOS real, Firefox e kiosk | Não executado aqui |
| G6 — TI/Sec | HTTPS confiável, acessos, testes negativos e plano de rollback | Aprovação pendente |
| G7 — Comercial/legal | Licenças, suporte, direitos, marca, termo e código versionado | Aprovação pendente |
| G8 — Implantação | Janela aprovada, SHA vivo e checklist pós-deploy | Não autorizada |

**Decisão provisória:** `NO-GO` para entrega comercial/produção até G2–G8. O material é uma **pré-entrega técnica revisável**; declarar “MARCO DOCUMENTAL” é aceitável, declarar “release homologada” não.

## Responsáveis e aprovações (campos para preenchimento)

| Papel | Atribuição | Aprovação |
|---|---|---|
| Responsável técnico do projeto | Congelamento de SHA, escopo e revisão de arquitetura | Pendente |
| TI/infraestrutura | Backup, segurança, rede, TLS, restore/rollback | Pendente |
| Produção/liderança | Funcionamento da operação e prioridades | Pendente |
| Manutenção | Grupos, atendimento, dados e impacto físico | Pendente |
| BI/qualidade | Auditoria de coortes, indicadores e qualidade de dados | Pendente |
| Jurídico/comercial | Titularidade, licença de fonte e termos de entrega | Pendente |

## Registro de não conformidade

Toda ocorrência aberta após o congelamento deve registrar ID, severidade P0/P1/P2, efeito, ambiente, SHA, reprodução, evidência sanitizada, correção/PR, regressão e revalidação. Um P0 em segurança, integridade ou perdas operacionais impede GO. A exceção formal de P1 deve indicar responsável, mitigação e prazo; a ausência de resultado é `NOT_RUN`, não aprovação.

## Referências

[Contrato de homologação](20_ACEITE_TERMO_E_FORMULARIOS.md) · [Rastreabilidade](02_MATRIZ_RASTREABILIDADE.md) · [Manifesto e direitos](03_INVENTARIO_DIREITOS.md) · [DOC1-QA](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).
