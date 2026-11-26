# M1-BOM-001 — Inventário do pacote, código e direitos

**Estado:** checklist técnico para uma distribuição futura; **não** é um arquivo de release pronto, manifesto criptográfico já calculado ou parecer de licenciamento.

## 1. Estrutura de entrega pretendida

```text
ANDON_M1_<VERSAO>_<SHA_CURTO>/
  00_COMECE_AQUI/
    LEIA-ME.pdf
    INDICE_DOCUMENTAL.pdf
    NOTAS_DE_VERSAO.pdf
    DECLARACAO_DE_ESCOPO_E_LIMITES.pdf
  01_APRESENTACAO/
    VISAO_EXECUTIVA.pdf
    ARQUITETURA_LOGICA.pdf
  02_MANUAIS/
    OPERADOR.pdf
    MANTENEDOR.pdf
    LIDERANCA_PRIORIDADES.pdf
    HISTORICO_BI.pdf
    HUB_ADMIN_AUDITORIA.pdf
    MOBILE.pdf
    [edicoes DOCX correspondentes]
  03_SUPORTE/
    INSTALACAO_E_ATUALIZACAO.pdf
    BACKUP_RESTORE_ROLLBACK.pdf
    TROUBLESHOOTING.pdf
  04_CODIGO/
    fonte_<SHA>.zip            [somente apos validar titularidade]
    instrucoes_build.md
    migration_inventory.txt
    arquivos_hashes.sha256
  05_EVIDENCIAS/
    relatorio_CI.pdf
    plano_HML_assinado.pdf
    evidencias_sanitizadas/    [compartilhamento restrito]
  90_CONTROLE/
    MARCO_M1.pdf
    TERMO_ACEITE_ASSINADO.pdf
    inventario_de_licencas/
    manifest_entrega.json
```

Itens em colchetes são **condicionados à aprovação**. Não gerar um ZIP do código a partir de uma branch mutável nem entregar dados/certificados fabris.

## 2. Artefatos e fonte de verdade

| Item | Fonte | Verificação necessária |
|---|---|---|
| Frontend | `src/`, `package.json`, `vite.config.ts` | `npm ci`, build e checksums |
| Backend | `server/src/`, `server/package.json` | Build, testes e endpoint Health |
| Modelo e migrações | `server/prisma/schema.prisma`, `server/prisma/migrations` | Inventário de migrations, compatibilidade com destino, backup |
| Windows installer | `installer/`, `install-tools/`, scripts de entrada | Testes PowerShell, assinatura/checksum, Windows compatível |
| Runtime Node | `release-manifest.json` | Versão, fonte de binário e hash informado no manifesto |
| Suporte/HTTPS | `docs/HTTPS_ASSISTED_SETUP.md`, `docs/INSTALACAO.md` | Certificado corporativo, confiança cliente e pré-condições |
| Configuração | `andon-config.json` no destino | Referenciar **campos**, jamais copiar valores/segredos |
| Banco | PostgreSQL em cada ambiente | `_prisma_migrations`, esquema e protocolo de restore |
| Manuais | `docs/entregavel/`, pasta oficial do Drive | Índice, versão, revisão técnica, capturas reais e aceite |

O manifesto `release-manifest.json` pode citar migration antiga em seu metadado. A quantidade de arquivos de migração atuais é maior: **não afirmar que todas foram aplicadas** nem interpretar um campo `migrationApplied: false` como diagnóstico da instância. O único registro aplicável é a verificação no banco autorizado.

## 3. Direitos e distribuição de fonte

O repositório é acessível no GitHub, mas **publicação do código não significa licença irrestrita para copiar, vender, sublicenciar ou redistribuir**. Antes de fornecer arquivo-fonte ou build a terceiro:
1. Identificar titulares de autoria de software, componentes gráficos, dados e documentação.
2. Confirmar contratos/cessões/autorizações do projeto e direitos da empresa/cliente.
3. Inventariar dependências diretas e transitivas, licenças e avisos de copyright, incluindo assets e fontes; gerar SBOM formal a partir de lockfiles no SHA congelado.
4. Revisar obrigações de licenças copyleft/notice, termos de terceiros, telemetria e distribuição de runtime.
5. Confirmar confidencialidade, marcas e permissão de compartilhar resultados de testes.
6. Gerar pacote de fonte/compilado com hash SHA-256 de cada arquivo, sem `.env`, tokens, certificados, banco, logs reais, `node_modules`, `dist` não revisado e cópia de chaves.

**Estado deste documento:** checklist de licenças ainda pendente de auditoria; não declarar o software “open source” ou “software comercial licenciado” apenas porque o repositório é público.

## 4. Manifesto candidato (modelo, não artefato já assinado)

```json
{
  "deliverable_id": "M1-DOC1-20261125",
  "package_status": "pre_release_documentation",
  "product": "ANDON Web Industrial",
  "installer_version": "1.0.0-pilot.3",
  "source_commit": "PREENCHER_SHA_CONGELADO",
  "doc_revision": "PREENCHER_EDICAO",
  "database_migrations_verified_at_destination": false,
  "notebook_hml_approved": false,
  "real_mobile_hml_approved": false,
  "industrial_deployment_approved": false,
  "license_review_approved": false,
  "evidence_index": "PREENCHER",
  "sha256_manifest": "PENDENTE",
  "signatures": []
}
```

Não emitir inventário de hashes fictício nem substituir `PREENCHER` por dados não verificados.

## 5. Segurança do pacote

O ZIP final deverá ser gerado em diretório limpo e conferido com scanner de segredos, revisão de diff, inventário de binários e hashes, privilégios de compartilhamento e teste de reextração. **Nunca** incluir material de rede industrial ou dados pessoais em repositório público. Entregar código somente após confirmação de direitos e aprovação do termo.

Referências: [Marco M1](00_MARCO_GOVERNANCA.md), [Release notes](01_RELEASE_NOTES.md), [Manual suporte](15_MANUAL_TI_SUPORTE.md), [Termo e checklist](20_ACEITE_TERMO_E_FORMULARIOS.md).
