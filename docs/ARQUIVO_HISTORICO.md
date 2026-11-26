# Índice de preservação dos documentos anteriores

A raiz de `docs/` contém registros de decisões e ciclos de engenharia. **Não** renomeamos em massa nem movemos esses registros: centenas de referências em PRs, issues, mensagens e entregas anteriores apontam para esses arquivos e a mudança quebraria a rastreabilidade.

## Famílias por prefixo (documentos históricos)

| Prefixo | Função documental | Como interpretar |
|---|---|---|
| `SEC04_` / `SECURITY_` | Autorização central, segurança, sessões e endpoints | Evidência da etapa original; revisar política vigente em `server/src/access/` |
| `REFINE*` | Iterações do piloto, configuração, UX, permissões e instalador | Decisões históricas por data e PR |
| `PENTE*` | Revisão fina de BI, Prioridades, Dashboard, Histórico e Hub | Pode ter trechos pré-merge; conferir SHA final |
| `MOB1_*` | Responsividade mobile e critérios de aceite | Implementação não equivale a Android/iOS físico homologado |
| `UX*` / `HUB*` | Design, navegação, identidade e temas | Referência de implementação e decisões |
| `DOC1_*` | Consolidado documental transversal | Preferir índice [DOC 1](README.md) |
| `architecture/` / `validation/` | Referências arquiteturais e de validação preexistentes | Reusar sem duplicar conceitos normativos |

Documentos com título/estado `previsto`, `PR em revisão`, `não homologado` ou versões antigas são **registros do momento em que foram escritos**, não autorização vigente. Para informações operacionais atuais, começar no [Índice oficial](README.md), depois confirmar [Estado Atual](ESTADO_ATUAL.md), política real do backend e commit fixo.

## Política de arquivamento

- **Não quebrar links:** novos documentos são indexados; itens antigos não são deletados por estética.
- **Não reescrever histórico:** quando um documento antigo traz status ultrapassado, adicionar nota de referência atual em vez de apagar evidência.
- **Evitar duplicidade normativa:** dicionário de dados, ACL e regras BI do DOC 1 são fontes concentradoras; manuais apontam para elas.
- **Antes de futura migração estrutural:** criar mapa de links de entrada/saída, redirects quando possíveis, PR própria e revisão dos mantenedores.
