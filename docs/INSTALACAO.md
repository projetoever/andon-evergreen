# Instalação, atualização e recuperação — ANDON Web Industrial

**Revisão documental:** DOC 1, 25/11/2026.  
**Instalador:** `1.0.0-pilot.3` (conferir `release-manifest.json`).  
**Escopo:** orientação de homologação e controle de implantação; **não executar no servidor fabril sem mudança aprovada**.

## 1. Não confundir ambientes

| Destino | Finalidade | Fonte de configuração | Observação |
|---|---|---|---|
| Desenvolvimento isolado | Código, testes, alterações locais | `package.json`, `server/package.json`, `docker-compose.yml` | Compose contém imagem PostgreSQL 16 e credenciais de laboratório; não é especificação industrial |
| Notebook de homologação | Validação do instalador, módulos, navegador e dados sintéticos | Menu oficial + `andon-config.json` + SHA instalado | Atividades autorizadas em laboratório, sob backup e registro |
| Servidor industrial | Operação real, redes e banco corporativos | Ambiente gerenciado pela TI/produção | Exige janela, aprovação, política de backup/rollback e rede/certificados próprios |

As portas usuais do instalador são frontend 8080 e API 3001; PostgreSQL depende do modo e da configuração local. Não assumir que porta, IP, CA, imagem Docker ou credenciais são iguais entre laboratório e fábrica.

## 2. Pré-condições obrigatórias de uma atualização

1. Identificar ambiente/destino e obter autorização específica; não trocar a pasta correta por outra instalação.
2. Confirmar a revisão pretendida na `main` ou tag de release, registrar SHA exato de origem e versão do instalador.
3. Fazer inventário seguro da configuração: modo do banco, porta, versão, certificado, estado dos serviços e políticas de acesso. Nunca copiar segredo no relatório.
4. Gerar **backup e testar restaurabilidade em ambiente isolado** antes de migração; uma cópia não validada não é prova de recuperação.
5. Conferir migrações pendentes via mecanismo do instalador; `server/prisma/migrations/20261125173000_priority_highlight_count` adiciona `priorityHighlightCount` com padrão 5. **Não aplicar SQL manual à fábrica.**
6. Garantir plano de rollback da versão de código e compatibilidade do esquema com o banco restaurado. Migração de banco não deve ser considerada reversível por suposição.

## 3. Contrato das opções do menu do piloto

| Opção | Contrato operacional documentado |
|---|---|
| 2 — Atualizar pela main | Validar estado local, backup, dependências, Prisma, migração e serviços; aplicar somente no alvo autorizado; registrar SHA vivo |
| 4 — Iniciar ANDON | Iniciar serviços exclusivos do ANDON e conferir prontidão |
| 5 — Parar ANDON | Encerrar somente os componentes ANDON, preservando banco/volume |
| 6 — Verificar saúde | Diagnóstico **somente leitura**, sem criar dados de teste nem iniciar/parar recursos automaticamente |
| 14 — Configurar HTTPS | Escolher HTTP legado (quando permitido), HTTPS local ou HTTPS de rede; exigir confiança e SAN adequados |

O menu 14 e os fluxos TLS possuem requisitos de segurança adicionais em [Assistente HTTPS](HTTPS_ASSISTED_SETUP.md). Certificado `mkcert` confiável no notebook **não** significa confiança em smartphone ou aptidão para rede corporativa. Nunca desabilitar validação TLS nem expor banco para contornar o acesso.

## 4. Fluxo controlado de atualização do notebook

1. Registrar SHA instalado **antes** da mudança, revisar backup e executar menu 2 pelo instalador **do notebook de teste**.
2. Guardar logs e confirmar que a execução não apagou banco, sessões ou histórico. Não usar instalação limpa para corrigir falha de update.
3. Executar opção 6 e verificar separadamente API, frontend, banco e acesso HTTPS; confirmar SHA apresentado no runtime e no código selecionado.
4. Abrir `/hub`, navegar por ANDON, Prioridades, Histórico Global, BI e Admin somente com perfis sintéticos autorizados.
5. Validar permissões negadas, grupos de chamados, múltiplos técnicos, programação, mudanças simultâneas, dados do BI e auditoria.
6. Executar a [matriz DOC1-H01..H12](DOC1_HOMOLOGACAO_GUIADA_20261125.md), registrar evidências e anomalias com link de issue.
7. Se falhar, preservar logs, restabelecer serviço conforme procedimento oficial e acionar rollback autorizado; **não** trocar certificados, firewall ou banco de produção como reação improvisada.

O script `ATUALIZAR_NOTEBOOK.ps1` é um fluxo de laboratório separado: não pressupor que `git pull` isolado inicia serviços ou aplica mudanças. Conferir o procedimento específico usado antes de descrever um SHA como “instalado”.

## 5. Evidência e aceite

O pacote de evidências de cada instalação precisa de data, responsável, destino **abstrato** (sem IP interno divulgado), versão e SHAs dos serviços, banco/migration, hash do backup e teste de restauração, CI, Health, resultados HML e aprovação/NO-GO. O uso industrial exige aceite de TI, operação e segurança; a integração à `main` não autoriza atualização fabril.

## 6. Referências

- [Marcos e status](DOC1_MARCO_20261125.md)
- [Plano de homologação](DOC1_HOMOLOGACAO_GUIADA_20261125.md)
- [Assistente HTTPS](HTTPS_ASSISTED_SETUP.md)
- [Critérios de instalador e segurança](REFINE15_PRODUCT_GRADE_INSTALLER_HTTPS_GATES_20261112.md)
- `installer/`, `release-manifest.json`, `scripts/serve-frontend.mjs`, `server/prisma/migrations/`
