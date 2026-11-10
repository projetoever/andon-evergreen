# REFINE 12 — R12-04H1 | Auditoria das 10 abas e proteção de ações físicas no cadastro de máquinas

Data: 09/11/2026. Base PR #412 R12-04G2 → #410 R12-04G1 → #408 tipos → #406 subconjuntos → #404 conjuntos → E034 #385.

## Contrato de navegação
As **10 abas** em `src/components/settings/AdminSettingsModal.tsx` já ficam visíveis para qualquer conta humana normal com autorização central `andon.settings.open` (e `andon.read` para o módulo operacional), independentemente de perfil/rótulo: `general`, `appearance`, `sounds`, `attendance`, `technicians`, `shifts`, `categories`, `classifications`, `assetCatalogs`, `machines`. Visibilidade não é uma autorização de escrita. Cada rota efetiva exige ACL + flags + validação do payload, sessão e estação. Não envolver Hub, BI, Prioridades, administração de usuário ou dispositivos.

## Matriz de inventário (código verificado, NÃO é homologação de HML)

| Aba | Segurança/funcionalidade atual | Limites ainda pendentes |
| --- | --- | --- |
| Configurações gerais | `PATCH /api/system-settings` restrito por `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED`, auditoria PG | revisão manual de toda regra, inclusive modo de atendimento por nome separado |
| Aparência | `PATCH /api/andon-visual-palette` flag própria, revisão/CSRF/auditoria | teste visual de salvar globalmente, #370, no notebook |
| Sons | R12-04G1 temporizadores auditados; R12-04G2 mute navegador local sem API de sirene | banco de áudios personalizados continua **IndexedDB por navegador**, não um catálogo global central; não prometer propagação/auditoria entre máquinas |
| Atendimento | modos PIN/RFID existem; seleção por nome possui feature flag independente | #345 funcionalidade declarativa por nome ainda não homologada |
| Mantenedores | cadastro/edição central em PRs anteriores sob flags próprias | credenciais e seleção por nome não devem escapar do fluxo central nem permitir duplicação |
| Turnos | PATCH central auditado em R12-04B | UI e horários reais não homologados |
| Categorias/setores | POST/PATCH central auditado em R12-04C | histórico, ordenação e exclusão exigem confirmação de UI |
| Classificações | criação/edição central auditada por flag | desativação/reuso e KPI devem ser validados na HML |
| Catálogos de ativos | R12-04E tipos; D1 conjuntos e D2 subconjuntos, sem DELETE/reparenting, flags OFF | cadastro cruzado entre máquinas, lista, referências históricas, navegação em HML |
| Máquinas | criação e PATCH metadados centrais: nome/exigir OS, sem poder físico | ativar/inativar e trocar modo de produção são operações separadas ainda **não migradas**; leitura de lista continua limitada por `machineScope` mesmo quando existe grant global de configuração |

## Correção cirúrgica H1
Em `AdminSettingsModal` o modo `centralAccess` é encaminhado para `MachineAdminPanel`. O cadastro mantém criação, nome e exigência de OS acessíveis segundo a autorização do backend, mas a interface **desabilita a troca de modo de produção e a ativação/inativação da máquina no acesso central** e explica que essas ações precisam de fluxo operacional independente. Evita o usuário selecionar uma opção que o servidor já bloqueia e receber erro de API. O modo legado segue inalterado. Nenhuma ACL ou rota de comando foi ampliada.

Teste `tests/adminUxRefinementA.test.ts` garante as 10 abas, propagação do modo central, desabilitação explícita de controles físicos, preservação da guarda backend da edição cadastral e a permissão `andon.settings.open`.

## Bloqueadores R12-04H2/H3 para concluir a segurança
1. Diferenciar catálogo global de máquinas das leituras operacionais filtradas pelo `machineScope`. **NUNCA** ampliar `GET /api/machines` de chamados/telemetria para uma pessoa com acesso de configuração. Se necessário, criar endpoint próprio de inventário sanitizado + UI específica sob ACL e teste PostgreSQL de privacidade.
2. Inspecionar a UI das 10 abas com perfis reais (Admin, Gerente, Líder, Manutenção, Produção) e dois terminais: acesso visível, campos autorizados salvos, operações negadas com mensagem clara, nenhum acesso Hub/BI/workstation por transitividade.
3. Esclarecer política de mídia sonora customizada em IndexedDB (hoje por navegador, sem sincronização global) antes de propor qualquer upload central para todas as máquinas; não atribuir ao GPIO.
4. Validar E034 HML real #351 histórico, #352 cancelamento, #373 mute, alteração de máquinas/mantenedores, desfixar, #370 salvar global, #345 atendimento por nome. Testes CI não substituem navegação do usuário.

**SEM MERGE/DEPLOY, SEM FLAG DE HML, SEM BANCO DA FÁBRICA.** PR funcional DRAFT empilhada; CI-only NUNCA MERGIR. Notebook do usuário permanece E034 #385 SHA `92debbe57d96f452cc2d72082e3fd6787294b246`. Não alterar `C:\web-andon-industrial\andon`, `andon_db`, M37, PLC/Node-RED/GPIO.
