# M1-REL-002 — Checklist de release candidata, código e transferência técnica

**Marco:** `M1-DOC1-20261125` · **Edição:** 0.1 · **Status:** modelo de transferência, não ata assinada.  
**Referência documental:** `main@630737c559cb93f6283eb77d9c1b77d66b731c54`, merge da PR #657. O SHA técnico da **versão efetivamente instalada** deve ser medido separadamente.

## 1. Etapas sem equivalência automática

| Etapa | Entregável | Critério |
|---|---|---|
| Fonte documental | Markdown, modelo DOCX e dossiê em Drive/GitHub | Revisão editorial e links funcionais |
| Release candidata técnica | Tag/SHA imutável, manifest, dependências, migrations e build reproduzível | CI verde no commit congelado |
| Homologação laboratório | 28 casos com evidência, dados sintéticos, restore e mobilidade real | GO HML assinado |
| Pacote para cliente | Binários/fonte conforme direitos, manuais revisados, licença e suporte | GO comercial e juridicamente autorizado |
| Deploy industrial | Mudança aprovada, janela, backup, rollback, responsável e aceite | GO industrial independente |

**Não criar** tag `v1.0.0` ou chamar `1.0.0-pilot.3` de release comercial apenas porque a documentação foi mesclada.

## 2. Manifesto formal de entrega (campos obrigatórios)

```json
{
  "deliverable_id": "M1-DOC1-20261125",
  "package_status": "CANDIDATE_PENDING_APPROVAL",
  "product": "ANDON Web Industrial",
  "client_or_environment_code": "LAB_SYNTHETIC_ONLY",
  "manifest_version": "1.0.0-pilot.3",
  "source_commit": "SHA_TO_RECORD",
  "frontend_build_sha256": "SHA256_TO_GENERATE",
  "backend_build_sha256": "SHA256_TO_GENERATE",
  "windows_installer_sha256": "SHA256_TO_GENERATE",
  "database_engine_version": "TO_VERIFY",
  "prisma_migrations_applied": [],
  "release_notes_revision": "M1-REL-001",
  "documentation_revision": "M1-EDI-001-r0.2",
  "documentation_sha256_manifest": "TO_GENERATE_AFTER_APPROVAL",
  "software_license_approval_id": null,
  "hml_approval_id": null,
  "industrial_deployment_approval_id": null,
  "rollback_procedure_evidence_id": null
}
```

Um campo `TO_VERIFY` é pendência, não um valor ausente a ser omitido do registro de controle. Não gerar hashes por texto simulado nem preencher valores de produção a partir de memória.

## 3. Inventário de engenharia para transferir

| Conjunto | Deve existir na revisão de release | Risco a checar |
|---|---|---|
| Frontend e roteamento | fontes, lockfile, CI, build e mapas de telas | ações sem permissão em URL direta |
| Backend/API | fontes, rotas, políticas, testes, logs e Health | contratos divergentes de manuais |
| Banco/Prisma | schema, migrations, plano upgrade e restore | versionamento e compatibilidade |
| Windows installer | script, runtime Node fixo, PowerShell compatível e log | falha parcial e restauração |
| HTTPS | procedimento CA/certificado confiável e rede restrita | downgrade, navegador móvel |
| BI | fórmulas, elegibilidade, diagnóstico e amostra | números sem causalidade |
| Auditoria/retensão | grants read/export, CSV, volume e privacidade | registro de segredo / acúmulo |
| Segurança | acesso, estações, sessões, PIN e CSRF | bypass por cliente |
| Operação | abertura/grupo/OS/técnicos/impacto/fechamento | duplicação e perda de histórico |
| Suporte | incidentes, monitoramento, backup, restore, escalonamento | indisponibilidade e dependência de pessoa |

## 4. Revisão jurídica e de distribuição

1. Identificar titulares de software, códigos de terceiros, documentação e material gráfico.
2. Verificar contratos de trabalho/cessão, limitações de redistribuição e autorização de uso de marca Ever Green.
3. Gerar inventário de licenças **reais** de dependências diretas/transitivas e notices a partir do SHA congelado; conferir assets, ícones e fontes.
4. Especificar o que é fornecido: execução, código-fonte, acesso ao repositório, garantia, atualização, correção e suporte. Não presumir que GitHub acessível concede direitos comerciais irrestritos.
5. Revisar eventuais obrigações de LGPL/GPL/Apache/MIT/BSD e dependências conforme parecer de responsável jurídico.
6. Remover segredos, bancos, cookies, rede industrial, certificados privados e logs sensíveis do pacote público antes de gerar checksums.
7. Definir responsáveis pelo atendimento, continuidade, infraestrutura, dados, privacidade e incidentes.

**Licença de software não foi aprovada nem escolhida por este documento.**

## 5. Manual de operação e sustentação (handover)

A transferência formal deve incluir: identificação do administrador funcional e substituto; quem aprova workstations; responsável por revisar coortes de BI; como localizar falhas no log/Health; rotina de backup, teste periódico de restore, janela de atualização, indicadores de disponibilidade do serviço, inventário de hardware/software e processo de escalação.

Evitar nomes pessoais, telefones internos ou senhas no GitHub público. Guardar contatos operacionais em documento restrito do cliente, com campo de responsável e atualização definida.

### Ficha de handover

| Item | Responsável | Evidência | Estado |
|---|---|---|---|
| Titularidade/contrato/licença | Jurídico e gestão | Parecer formal | PENDENTE |
| Versão congelada e rebuild | Engenharia | SHA, artefatos e hash | PENDENTE |
| Backup e restauração | TI/infra | Relatório de restore isolado | PENDENTE |
| Segurança e credenciais | TI/Sec | Matriz ACL e TLS | PENDENTE |
| Operação e treinamento | Produção/manutenção | Casos executados e registro de participação | PENDENTE |
| Indicadores e qualidade | BI/qualidade | Reconciliação e explicação de amostra | PENDENTE |
| Plano de contingência | TI | Rollback provado e escalonamento | PENDENTE |
| Assinatura de aceite | Comitê responsável | Termo formal | PENDENTE |

## 6. Gatilhos de atualização da documentação

Qualquer mudança na rota de UI/API, grants, schema, fórmula BI, tradução funcional, estado de chamado, regra de OS, prioridade, instalador, validação de SSL/TLS ou fluxo de produção exige análise de impacto dos documentos M1 relacionados. Antes de publicar, revisar `DOC1-QA-Hxx`, screenshots afetados, versão do manuscrito e revisão editorial.

**Padrão de compromisso:** atualização de `main` não atualiza sozinha a instalação; software instalado não comprova direito comercial; teste automatizado não substitui evidência física; prazo e SLA só podem ser divulgados após contrato.

[Inventário M1 de direitos](03_INVENTARIO_DIREITOS.md) · [Runbook HML](30_RUNBOOK_HML_EVIDENCIAS.md) · [Termo de aceite](20_ACEITE_TERMO_E_FORMULARIOS.md) · [Padrão editorial](PADRAO_EDITORIAL_M1.md).
