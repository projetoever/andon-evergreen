# ANDON Web Industrial — Biblioteca de pré-entrega M1

**Marco em preparação:** `M1-DOC1-20261125` · **Status: PRÉ-ENTREGA INTERNA / NÃO HOMOLOGADA**  
**Canal do produto:** piloto `1.0.0-pilot.3`. **Código funcional da fotografia:** `6018335c6f085757a0fd35faed8a2893f4f03e0a`; documentação posteriormente adicionada à `main` via PR #654 e #656.  
**Referência à evolução corrente:** [Issue #655](https://github.com/projetoever/andon-evergreen/issues/655) e [DOC 1](../DOC1_MARCO_20261125.md).

Este diretório reúne os documentos **editáveis em Markdown** necessários para converter o piloto em um entregável verificável. Ele não contém credenciais, dados fabris, licença presumida, exportações de produção ou artefatos executáveis. A versão industrial **não está liberada** por esta biblioteca.

## Padrão de diagramação, revisão e modelos

Os materiais desta edição usam o [Padrão Editorial M1, revisão 0.2](PADRAO_EDITORIAL_M1.md): corpo 11,5 pt, tabelas 10,8 pt (11 pt cabeçalho), H1 19 pt, H2 14,2 pt, margem A4 1,85 cm lateral, contrastes preservados e **sem paginação artificial de uma seção por folha**. Os arquivos Markdown permanecem a fonte de conteúdo; PDFs/DOCX finais só após QA de renderização e versão identificada.

Para peças futuras, copiar o [Modelo de Manual](modelos/MODELO_MANUAL.md) ou [Modelo de Relatório](modelos/MODELO_RELATORIO.md); há também um modelo DOCX editável versão 0.2 no pacote Drive. Para a documentação técnica fora do M1, consulte o [Índice oficial](../README.md). Documentos REFINE/PENTE/SEC04 históricos não foram renomeados, pois são referenciados por PRs e issues.

## Inventário da biblioteca

| Código | Documento | Público | Propósito |
|---|---|---|---|
| M1-GOV-001 | [Marco e governança](00_MARCO_GOVERNANCA.md) | Gestores, engenharia, TI | Escopo, status de maturidade, critérios de congelamento e assinatura |
| M1-REL-001 | [Notas de versão consolidada](01_RELEASE_NOTES.md) | Todos | Mudanças REFINE/PENTE/MOB, rastreabilidade e limitações |
| M1-TRC-001 | [Rastreabilidade produto → teste → manual](02_MATRIZ_RASTREABILIDADE.md) | Qualidade | Funções, origem, grants e evidência exigida |
| M1-BOM-001 | [Inventário, direitos e entrega de código](03_INVENTARIO_DIREITOS.md) | Engenharia, jurídico, TI | Itens do pacote, propriedade, licenças e checklist de entrega |
| MAN-OP-001 / MAN-MNT-001 | [Operador e mantenedor](10_MANUAL_OPERACAO_MANUTENCAO.md) | Produção e manutenção | Fluxos de abertura, setores/grupos, OS, atendimento múltiplo e encerramento |
| MAN-PRI-001 / MAN-LID-001 | [Prioridades e liderança](11_MANUAL_PRIORIDADES_LIDERANCA.md) | Liderança | Ranking, produção programada, permissões e dashboard |
| MAN-HIS-001 / MAN-BI-001 | [Histórico e BI](12_MANUAL_HISTORICO_BI.md) | Liderança, analistas | Filtros, indicadores, coortes e qualidade |
| MAN-HUB-001 / MAN-ADM-001 / MAN-AUD-001 | [Hub, Admin e Auditoria](13_MANUAL_HUB_ADMIN_AUDITORIA.md) | Administradores | Contas, workstations, grants, cadastro e log |
| MAN-MOB-001 | [Mobile](14_MANUAL_MOBILE.md) | Operadores móveis | Navegação por toque, limitações e protocolo de ensaio |
| MAN-INS-001 / MAN-SUP-001 | [TI, instalação e suporte](15_MANUAL_TI_SUPORTE.md) | Suporte/infra | Backup, atualização, testes, TLS e incidentes |
| M1-ACC-001 | [Aceite e evidências](20_ACEITE_TERMO_E_FORMULARIOS.md) | Homologadores | Checklist, registro por caso e Termo GO/NO-GO |
| M1-GLS-001 | [Glossário operacional](21_GLOSSARIO.md) | Todos | Vocabulário padronizado PT-BR, BI e ACL |

## Leituras obrigatórias antes da entrega

- [Arquitetura atual](../ARQUITETURA.md), [dicionário de dados](../DOC1_DICIONARIO_DADOS_20261125.md), [fluxos](../DOC1_FLUXOS_OPERACIONAIS_20261125.md), [telas](../DOC1_MAPA_TELAS_NAVEGACAO_20261125.md) e [contrato BI](../DOC1_CONTRATO_BI_20261125.md).
- [Homologação guiada DOC1-QA-H01..H28](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).
- [Instalação](../INSTALACAO.md), [README do backend](../../server/README.md), `release-manifest.json` e esquema Prisma.
- **Documentos anteriores** do Drive são registros históricos. Nunca sobrescrever PDFs gerenciais aprovados com uma revisão ainda sem aceite.

## Regra de status: não prometer mais do que foi comprovado

1. `IMPLEMENTADO` = arquivo/PR mesclados, confirmado no repositório;
2. `CI_APROVADA` = workflow verde no SHA indicado;
3. `HML_APROVADA` = ensaio real em notebook/banco isolado, evidências anexadas;
4. `DISPOSITIVO_APROVADO` = Chrome Android/Safari iOS e Firefox testados em dispositivo/estação reais;
5. `INSTALADO` = verificação do SHA efetivo do runtime de destino, com autorização;
6. `LIBERADO_COMERCIALMENTE` = licença, segurança, suporte, direitos, termo e versão aprovada.

A passagem entre estados **não é automática**. Mesmo CI aprovada e código completo não representam aceite. **O marco M1 ainda está no estágio de preparação editorial.**

## Critério editorial para converter para DOCX/PDF

Cada manual precisa do SHA instalado no ambiente homologado, capturas reais sanitizadas por idioma/tema, revisor técnico, treinamento por perfil, registro de revisão, teste `DOC1-QA-Hxx` executado e assinatura. As versões em Markdown são **minutas de uso interno**, não uma instrução operacional autorizada para a fábrica.
