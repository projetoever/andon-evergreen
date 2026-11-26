# MAN-INS-001 / MAN-SUP-001 — Instalação, suporte e contingência

**Edição:** 0.1 · Marco M1 (pré-entrega, não homologada) · **Público:** TI, suporte e engenharia.  
**Escopo:** orientação de laboratório e planejamento da implantação. **Proibido aplicar estes procedimentos diretamente no servidor industrial sem mudança formal aprovada, backup e rollback.**  
**Fontes:** `release-manifest.json`, `installer/`, `docs/INSTALACAO.md`, `docs/HTTPS_ASSISTED_SETUP.md`, [critérios REFINE15](../REFINE15_PRODUCT_GRADE_INSTALLER_HTTPS_GATES_20261112.md).

## 1. Arquitetura de referência

O ANDON utiliza frontend web compilado com React/TanStack, backend Node.js/Fastify, persistência PostgreSQL e Prisma, com instalador/runtimes Windows. O manifesto `1.0.0-pilot.3` informa Node `22.23.2`, API `3001` e frontend `8080` como valores padrão. **Não** assumir que o banco, porta, endereço, host ou certificados de um cliente coincidem com os exemplos.

| Ambiente | Uso | Observação essencial |
|---|---|---|
| Desenvolvimento | Testes unitários, CI, alterações isoladas | `docker-compose.yml` da raiz usa PostgreSQL 16 de laboratório |
| Notebook HML | Validação do instalador, frontend/API, autorização e dados sintéticos | Há registros de uso PostgreSQL 17; conferir no local |
| Fábrica/servidor | Operação produtiva | Nunca alterar sem autorização, inventário, janela e backup restaurável |

## 2. Inventário obrigatório antes de uma mudança

Registrar, sem divulgar segredos: pessoa responsável e janela; estação/servidor abstrato; SHA atual e candidato; versão do instalador; serviços/estado; banco e migration; saúde da API/UI; política de HTTPS; estado dos usuários/workstations; volume livre; backup e restore testado; ponto de retorno do código; plano de comunicação à operação. Não copiar senha de DB, cookie, token, certificado privado nem arquivo completo de configuração em documentação pública.

## 3. Instalação limpa em laboratório

1. Confirmar que o destino é **isolado** e não contém dados produtivos.
2. Selecionar perfil apropriado para instalação nova (`empty`, `starter` ou `demo`) conforme manifesto do piloto. Seeds de demonstração não podem ser usados em upgrade de base com dados.
3. Validar Node/runtime, Docker/PostgreSQL e pré-requisitos pelo instalador oficial, sem improvisar scripts destrutivos.
4. Executar o fluxo de instalação previsto pelo instalador e registrar logs.
5. Iniciar serviços e executar Health para API, frontend e banco.
6. Validar cadastro inicial e fluxo de autenticação com dados fictícios.
7. Conferir portas, certificados e trabalho em navegador antes de marcar “instalado”.
8. Criar registro com versão, SHA real, migrations e verificações.

**Regra:** `npm run db:reset` ou seed manual é comando **de desenvolvimento** que não deve ser sugerido para “corrigir” a base industrial.

## 4. Atualizar notebook de homologação

**Somente mediante autorização de atualização do notebook.**
1. Antes: registrar SHA existente e realizar backup com restauração isolada.
2. Acionar a **opção 2 do menu oficial — Atualizar pela main** quando a `main` for o destino explicitamente escolhido; em release comercial futura, preferir SHA/tag congelado e registrado.
3. Conferir a identidade do banco e migrations planejadas; o campo `migration` do manifesto de release pode estar desatualizado frente aos arquivos atuais, por isso confrontar `_prisma_migrations`.
4. Deixar o instalador validar Prisma, dependências, serviços e modo HTTPS; não remover query engine, banco ou volumes diante de erro EPERM.
5. Se houver falha, preservar log e plano de recuperação; uma atualização parcial é **FALHA**, mesmo que serviços retornem.
6. Executar **opção 6 — Verificar saúde**; ela é somente leitura e não deve iniciar/parar serviços, criar dados de testes, alterar TLS/firewall ou aplicar migração.
7. Confirmar SHA exibido pela instalação, acesso no navegador e execução de casos `DOC1-QA-H01..H28`.
8. Só considerar HML aprovada após parecer dos responsáveis, inclusive backup/restauração, Chrome/Firefox e mobile real.

## 5. Contrato de menu do piloto

| Opção conhecida | Função | Restrições |
|---|---|---|
| 2 | Atualizar pela main | Backup/restore; migrações sem seed; preservação; log; falha segura |
| 4 | Iniciar ANDON | Somente serviços do produto; prontidão real |
| 5 | Parar ANDON | Não parar processos terceiros ou banco indevidamente |
| 6 | Verificar saúde | Somente leitura; diferenciar 401/403 normal de API caída |
| 14 | Assistente HTTPS | HTTP legado quando autorizado, HTTPS local/rede e transação reversível |

Não afirmar que opção do menu em outra release mantém exatamente o mesmo número sem confirmar arquivo do instalador correspondente.

## 6. HTTPS: domínio, certificado e navegador

- HTTPS local por `mkcert` atende **homologação local**, não uma CA corporativa.
- Em rede, confirmar se IP/FQDN pertence ao certificado SAN, se o cliente confia na cadeia e se a porta está acessível.
- Verificar separadamente `/health` API e `/hub` UI; timeout de TCP, aviso TLS, 401 e 403 são problemas diferentes.
- Não abrir endpoint de máquina anonimamente para corrigir 403. Não criar regra de firewall ampla ou aceitar certificado inválido.
- Ao alterar TLS, preservar `centralAccessEnabled`, dados e configuração anterior. Testar recuperação, inclusive quando o usuário cancela a operação.

## 7. Diagnóstico por sintoma

| Sintoma | Verificação inicial de leitura | Resposta controlada |
|---|---|---|
| Frontend indisponível | Processo/porta UI, certificado, servidor compilado e Health API | Coletar log, reiniciar apenas serviço autorizado |
| API responde mas não lista máquinas | Verificar 401/403 de ACL, escopo e conexão com PostgreSQL | Não tornar endpoint público |
| Banco indisponível | Health DB, container/serviço e volume no destino isolado | Não formatar ou resetar; proteger dados |
| Firefox perde sessão | Cookies, `Secure`, origem HTTPS, política de limpeza e revogação | Testar em browser real; não desativar autenticação |
| Update `prisma generate` EPERM | Processo Node carregando DLL, dependências e antivírus | Usar recuperação oficial limitada; não excluir engine |
| Celular não abre Hub | Wi-Fi, rota, CA, IP atual, firewall, SAN e porta | Testar confiança e rede sem bypass de TLS |
| Login Hub exibe falha transitória | Status API, timeout e comportamento de retry | Distinguir 503 de 401/403 |
| KPI sem amostra | Filtros, causas, paradas, programa e cobertura | Não editar DB diretamente para forçar indicadores |
| CSV acima do limite | Filtros de auditoria e total de eventos | Particionar período; não truncar silenciosamente |

## 8. Procedimento de incidente

1. Detectar o impacto e classificar severidade (segurança, disponibilidade, integridade, usabilidade).
2. Identificar ambiente e componente: browser, UI, API, banco, certificado ou dispositivo.
3. Preservar logs pertinentes sem segredos, registrar hora, SHA, usuário de teste e ação executada.
4. Se houver risco a dados produtivos, interromper somente a atividade de atualização autorizada e acionar TI.
5. Não limpar dados nem restaurar backup sem política e responsável definidos.
6. Executar diagnóstico read-only (menu 6) e comparar com estado anterior.
7. Criar issue com reprodução sanitizada, plano de contenção e ligação à homologação.
8. Revalidar após correção, repetir gates atingidos e registrar aprovação.

## 9. Backup, restauração e rollback

- **Backup:** comprovar arquivo, integridade/hash, data e retenção. Backup sem teste de restauração não é suficiente.
- **Restore:** realizar primeiro em ambiente isolado, confrontando esquema e migrations; não restaurar por cima da fábrica para testar.
- **Rollback de código:** manter SHA/binários e configuração de referência, verificar se o banco migrado é compatível. Não assumir reversibilidade de migrations aditivas.
- **Rollback de certificado:** preservar identidade/chain e configuração; não fazer downgrade de TLS para restabelecer login central.
- **RTO/RPO:** **a definir com TI**, não inventar SLAs para a documentação.
- **Pós-ação:** conferência de chamados, históricos, acesso, BI, Workstations, Health, log e integridade de volumes.

## 10. Casos de aceite e assinatura

Obrigatórios: `DOC1-QA-H21/H23/H25/H26/H27/H28`. Registrar: ambiente isolado, SHA UI/API, schema/migration, backup hash, restore outcome, navegador, falhas induzidas, parecer TI e exceções. **Nenhum teste é marcado como executado nesta edição.**

[Instalação](../INSTALACAO.md) · [Assistente HTTPS](../HTTPS_ASSISTED_SETUP.md) · [Proteção do instalador](../REFINE15_PRODUCT_GRADE_INSTALLER_HTTPS_GATES_20261112.md) · [Termo de aceite](20_ACEITE_TERMO_E_FORMULARIOS.md).

**Publicação industrial:** proibida sem aprovação formal da janela, backup e liberação específica.
