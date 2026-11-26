# M1-ACC-001 — Homologação, termo de aceite e transferência

**Revisão:** 0.1 · Marco `M1-DOC1-20261125`. **Estado inicial:** `NOT_RUN` para todos os ensaios de destino.  
**Finalidade:** formulário controlado para autorizar, ao final de ciclos de teste e revisão, a publicação do ANDON Web Industrial como entregável. Não assinar “GO” sem evidência.

## 1. Resumo do congelamento

| Campo | Valor a verificar no momento de execução |
|---|---|
| Produto | ANDON Web Industrial |
| Versão do pacote/instalador | `1.0.0-pilot.3` como referência, confirmar |
| SHA da candidata `main` ou release tag | A PREENCHER |
| SHA compilado UI / API | A PREENCHER individualmente |
| Schema Prisma/migrations aplicadas | A PREENCHER após leitura do destino |
| Ambiente de HML | Notebook/base isolada, identificador abstrato |
| Navegadores móveis e desktop | Versões/dispositivos testados, a preencher |
| Backup e hash SHA-256 | A PREENCHER após criação e verificação |
| Restore de prova | A PREENCHER resultado e evidência |
| Contrato de HTTPS e rede | A PREENCHER aprovação da TI |
| Direitos/licenças de distribuição | A PREENCHER parecer |
| Revisor responsável por cada domínio | A PREENCHER |
| Parecer final | **NO-GO até a execução dos gates** |

## 2. Roteiro de aceitação por família

| Gate | Casos do DOC1-QA | Evidência mandatória | Estado inicial |
|---|---|---|---|
| Acesso central/Hub | H01,H02,H19,H20,H21,H28 | Teste 401/403, grant/estação, log sem segredo, sessão revogada | NOT_RUN |
| Operação, grupos e técnicos | H03–H08 | OS única, lote, técnico individual, tempos, fechamento e impacto | NOT_RUN |
| Histórico | H09–H11 | Lista/detalhe, CSV/escopo, participação e parada | NOT_RUN |
| Prioridades e programação | H12–H14 | Ranking 1/5/N, CAS 409, alteração autenticada de programação | NOT_RUN |
| BI | H15–H18 | Denominadores e coortes testados, 0%/null, gráficos e export | NOT_RUN |
| Mobile e traduções | H22–H24 | Capturas aparelho real, campos, toque, tema, idiomas | NOT_RUN |
| Instalação/recuperação | H25–H27 | Health, backup/restore isolado, migrações, rollback | NOT_RUN |
| Segurança transversal | H28 e negativos em todos | Sem bypass por URL, mudança de perfil, CSRF e sessão | NOT_RUN |

Além dos IDs acima, conferir a matriz de rastreabilidade [M1-TRC-001](02_MATRIZ_RASTREABILIDADE.md). **Não** associar um teste “PASS” a outra versão ou a evidência produzida em ambiente diferente sem justificativa de equivalência.

## 3. Registro por caso — copiar uma ficha por execução

```text
ID DO TESTE: DOC1-QA-H__         Execução n.: _______
DATA-HORA/FUSO: _______         RESPONSÁVEL: _______
AMBIENTE: notebook HML / aparelho real / outro autorizado: _______
VERSÃO: _______ SHA UI: _______ SHA API: _______
MIGRATIONS: _______            BANCO DE TESTE: _______
PERFIL SINTÉTICO: _______      GRANTS: _______     ESCOPO: _______
WORKSTATION FICTÍCIA: _______
DISPOSITIVO/NAVEGADOR: _______ RESOLUÇÃO: _______
CENÁRIO E PRÉ-CONDIÇÕES: __________________________________
PASSOS EXECUTADOS: ________________________________________
ESPERADO: ________________________________________________
OBSERVADO: _______________________________________________
RESULTADO: [ ] PASS [ ] FAIL [ ] BLOCKED [ ] NOT_RUN [ ] N/A
ID DA EVIDÊNCIA PRIVADA: _______
ISSUE/PR DE CORREÇÃO: _______
REVISÃO APÓS CORREÇÃO: _______
APROVAÇÃO DO TESTADOR: _______
```

Não anexar senhas, PIN, hostname/IP fabril, cookie, SQL com dados pessoais, chave privada ou logs não redigidos em repositório público.

## 4. Critérios objetivos de GO/NO-GO

**NO-GO imediato:** possibilidade de perda/corrupção de chamados; permissão burlada por URL; falha transacional não recuperável; auditoria contendo segredo; cálculo causal de BI materialmente incorreto; fechamento indevido ou impacto físico adulterado; ausência de restore comprovado; API insegura ou TLS indevido; ação essencial mobile inacessível; ausência de licença necessária à distribuição.

**GO condicional de laboratório:** nenhum P0 aberto; testes P0 executados com sucesso; P1 residuais com responsável, mitigação e aceite; release candidata única com SHA fixo; migrations/backups/restore comprovados; manuais em revisão final; parecer técnico assinado.

**GO de distribuição comercial/industrial:** exige adicionalmente aprovação TI/Sec, operação, manutenção, liderança, contrato de suporte, direitos/licenças/terceiros, inventário de hashes, documentação revisada e autorização da janela/deploy. Nem um GO de laboratório concede permissão para atualizar a fábrica.

## 5. Ata de decisão (não preencher antecipadamente)

```text
MARCO: M1-DOC1-20261125
VERSÃO E SHA APROVADOS: ___________________________________
PACOTE/ARQUIVOS E CHECKSUMS: ______________________________
GATES APROVADOS (IDs E EVIDÊNCIAS): _______________________
FALHAS ABERTAS E MITIGAÇÕES: _____________________________
DECISÃO: [ ] GO HML   [ ] NO-GO HML
        [ ] GO ENTREGA INTERNA   [ ] NO-GO ENTREGA INTERNA
        [ ] GO DISTRIBUIÇÃO      [ ] NO-GO DISTRIBUIÇÃO
        [ ] GO DEPLOY INDUSTRIAL [ ] NO-GO DEPLOY INDUSTRIAL
JUSTIFICATIVA: ___________________________________________
APROVAÇÕES COM NOME, DATA E MEIO: ________________________
CONTROLE DE MUDANÇA / JANELA: ____________________________
```

## 6. Conferência do pacote técnico

- [ ] Índice e notas de versão apontam para o SHA correto.
- [ ] Todos os manuais têm edição, aprovador, imagens reais, exercício e exceções.
- [ ] PDF e DOCX conferidos quanto à legibilidade e hyperlinks.
- [ ] SHA-256 calculados **depois** da geração dos arquivos finais.
- [ ] Código/artefatos removem segredos, dados e conteúdo sem direito de distribuição.
- [ ] Lockfiles/SBOM/licenças/avisos estão anexados e aprovados.
- [ ] Testes reproduzidos em instalação limpa e atualização de base isolada.
- [ ] Backups e restore comprovados, sem ação manual destrutiva na fábrica.
- [ ] TLS confiável, workstations e sessão revogável homologados.
- [ ] Exercícios treinados por perfil e FAQ/contatos de suporte aprovados.
- [ ] Responsáveis assinaram o termo e foram informados dos limites restantes.

## 7. Transferência e revisão futura

A entrega deverá indicar quem administra usuários, quem revisa BI, quem aprova novas workstations, quem responde incidentes, como atualizar a documentação, onde guardar evidências e o procedimento para solicitar correções via issue/PR. Evitar criar dependência de uma única conta pessoal sem governança.

[Protocolo M1](00_MARCO_GOVERNANCA.md) · [Inventário de direitos](03_INVENTARIO_DIREITOS.md) · [DOC1-QA](../DOC1_HOMOLOGACAO_GUIADA_20261125.md).
