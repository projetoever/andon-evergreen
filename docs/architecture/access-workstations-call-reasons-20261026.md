# ANDON — especificação de acessos, estações e motivos de chamado

**Tarefa 1 · revisão de 26/10/2026 · especificação para implementação.**

Base consultada: `main` em `64e0a82dde433e4c2d332cced968f2e621b78bab`, release `1.0.0-pilot.3`. Esta tarefa entrega decisões, contratos e critérios de aceite. As funcionalidades abaixo **não estão implementadas** por este documento. Nenhuma alteração de aplicação, banco ou produção faz parte desta entrega.

## 1. Decisão e ordem de execução

Construir primeiro a identidade e a auditoria; depois organizar as estações; em seguida introduzir motivos de chamado com tratamento analítico; finalizar a composição mobile sobre esses fluxos. Todas as novas telas já devem nascer responsivas. Não duplicar o sistema para celular.

| Tarefa | Entrega delimitada | Dependência e condição de saída |
| --- | --- | --- |
| 1 — esta especificação | Matriz de permissões, contratos, regras de BI, migração e aceite | Revisão do código e das referências; sem implementação |
| 2 — fundação de segurança | Schema aditivo, identidade do autor, autorização central, sessões, auditoria transacional e testes de API | Compatibilidade explícita; alterações novas rastreáveis; modo central ainda não imposto à instalação existente |
| 3 — usuários e provisionamento | Aba Acessos, senhas provisórias, primeiro acesso, recuperação, contas de kiosk, HTTPS e transição dos módulos | Fluxos completos testados em PostgreSQL e runtime Windows; possibilidade de ativação controlada |
| 4 — workstations | Arquivar/restaurar, lista recolhível, filtros, usuário/sessões e ações contextualizadas | Usa identidade e auditoria das tarefas 2–3; preserva bloqueios e atendimentos |
| 5 — categorias e BI | Motivo → especialidade, política capturada no chamado, transições e análises reconciliadas | Todos os cenários numéricos da seção 9; endpoints, filtros e PDF coerentes |
| 6 — revisão independente | Revisão crítica de permissões, migrações e cálculos | Nenhum bloqueador de segurança, perda histórica ou duplicidade analítica aberto |
| 7 — refinamento mobile | Hub, ANDON, máquina, BI, formulários e exportação | Evidência visual e funcional em celular; comparação desktop/kiosk |
| 8 — liberação | Guia de atualização, backup/restauração, piloto e revisão para merge | Evidência por tarefa; aviso explícito quando a `main` estiver pronta para atualização |

Antes de cada tarefa, indicar ao solicitante o modelo e o esforço recomendados e aguardar sua sinalização, conforme pedido. Não reunir segurança, BI e redesenho mobile em um único PR. Cada PR informa código entregue, verificações realizadas e o que ainda depende de ativação/homologação.

## 2. O que o código atual permite reaproveitar

| Evidência | Estado encontrado | Consequência para a implementação |
| --- | --- | --- |
| [`schema.prisma`](../../server/prisma/schema.prisma) | `Workstation` contém UUID, nome, bloqueio, aprovação, módulos, IP e máquina fixada | Acrescentar arquivamento e vínculos de acesso; não substituir identidades existentes |
| Mesmo schema | `KioskDevice` existe, mas a busca no código de aplicação não encontrou uso operacional | Não criar um terceiro cadastro nem presumir que essa tabela represente os browsers atuais; preservar eventuais registros |
| [`adminAuthorization.ts`](../../server/src/security/adminAuthorization.ts), [`moduleAuthorization.ts`](../../server/src/security/moduleAuthorization.ts) | Sessões em memória; credenciais administrativas e por módulo | Acrescentar usuários e sessões persistidas; definir transição explícita das credenciais antigas |
| [`adminAuth.ts`](../../server/src/routes/adminAuth.ts) | Admin aceita `123456` quando não há hash; recuperação por código | Restringir o padrão ao provisionamento inicial; preservar senha e recuperação já configuradas na atualização |
| [`technicianCredentials.ts`](../../server/src/security/technicianCredentials.ts) | Hash scrypt e PIN/RFID de mantenedores | Reaproveitar verificação legada; versionar parâmetros novos, sem reutilizar PIN como senha pessoal |
| [`workstations.ts`](../../server/src/routes/workstations.ts) | Proteções contra desativar a própria estação, estação fixada ou com atendimento ativo | Arquivamento deve respeitar as mesmas proteções no servidor |
| [`andonCalls.ts`](../../server/src/routes/andonCalls.ts) | Um chamado ativo por máquina/setor; abertura em lote; sessões técnicas e intervalos de impacto | Não duplicar Mecânica ao adicioná-la sob Setup; preservar concorrência e abertura em lote |
| [`schema.prisma`](../../server/prisma/schema.prisma) | `AndonCategory` também identifica áreas técnicas de mantenedores | Criar motivo de chamado separado da especialidade existente |
| [`analytics.ts`](../../server/src/routes/analytics.ts), [`causality.ts`](../../server/src/analytics/causality.ts) | Impactos consultam a responsabilidade atual do chamado | Transições de natureza exigem política por intervalo, para não reclassificar retroativamente toda a parada |
| [`BI_METODOLOGIA_E_QUALIDADE.md`](../BI_METODOLOGIA_E_QUALIDADE.md) | Disponibilidade global, MTBF/MTTR de manutenção, MTTA geral, exclusões e snapshots | Preservar os grãos; versionar as novas populações; não tratar setup como teste/falso chamado |
| [`WorkstationsSettingsTab.tsx`](../../src/components/settings/WorkstationsSettingsTab.tsx) | Formulários extensos com busca e filtros básicos | Reutilizar operações e substituir a apresentação por resumos expansíveis |

`machineStatus`, `andonStatus`, `currentCallId`, horários, sessões técnicas, restrições de conclusão, OS e localização original/confirmada continuam independentes. Autenticar, sair ou bloquear uma conta não conclui um chamado nem encerra artificialmente uma sessão técnica.

## 3. Identidades, perfis e permissões

### 3.1 Identidades distintas

- **Usuário pessoal:** pessoa identificada; nome, login único, cargo/perfil, permissões, escopo de máquinas e situação.
- **Conta de produção/kiosk:** conta por terminal, por exemplo `producao.kiosk01`, vinculada à workstation aprovada. Os 15–20 kiosks compartilham o modelo de permissões, não a mesma credencial.
- **Workstation:** identidade do navegador, não identidade inviolável do hardware. IP serve para informação e diagnóstico; não autentica pessoa nem equipamento.
- **Técnico:** identidade profissional e habilitações existentes. Vínculo opcional e único com usuário pessoal, obrigatório para ações técnicas autenticadas no modo central. Não associar pessoas automaticamente por semelhança de nomes.
- **Serviço:** instalador, rotina automática ou integração explicitamente cadastrada. Nunca atribuir suas ações ao Admin ou a um operador fictício.

Cargo é apresentação e modelo inicial de permissões, não uma hierarquia que concede tudo automaticamente. “Gestor” e “Gerente” podem usar o mesmo modelo inicial. O cadastro mostra as permissões efetivas antes de salvar.

### 3.2 Matriz inicial

Legenda: **Sim** = habilitado inicialmente; **Opcional** = somente se Admin conceder; **Não** = indisponível para a conta de kiosk. Escopo de máquinas sempre se aplica. Admin tem as capacidades administrativas, mas não substitui habilitação ou identificação de mantenedor.

| Permissão | Admin principal | Gestor/Gerente | Líder | Manutenção | Produção/kiosk |
| --- | --- | --- | --- | --- | --- |
| Ver ANDON e máquinas autorizadas | Sim | Sim | Sim | Sim | Sim |
| Ver histórico operacional do escopo | Sim | Sim | Sim | Sim | Sim |
| Abrir chamado / informar condição da máquina | Sim | Sim | Sim | Sim | Sim |
| Cancelar chamado com justificativa | Sim | Opcional | Opcional | Opcional | Opcional limitado ao próprio kiosk |
| Atender, adicionar técnico e concluir etapa técnica | Com identidade técnica | Opcional + identidade técnica | Opcional + identidade técnica | Sim + habilitação | Somente ação pessoal de técnico autenticado |
| Confirmar produção, acompanhamento e retorno | Sim | Sim | Sim | Opcional | Opcional |
| Alterar programação de produção | Sim | Opcional | Opcional | Opcional | Opcional |
| Ver BI / exportar BI | Sim / Sim | Sim / Sim | Sim / Opcional | Opcional / Opcional | Opcional / Não |
| Ver / editar prioridades | Sim / Sim | Sim / Opcional | Sim / Opcional | Opcional / Opcional | Opcional / Não |
| Editar diagnóstico histórico | Sim + regra técnica | Opcional | Opcional | Opcional | Não |
| Reclassificar natureza/responsabilidade/tratamento no BI | Sim | Opcional | Opcional | Opcional | Não |
| Gerenciar máquinas, conjuntos e subconjuntos | Sim | Opcional | Opcional | Opcional | Não |
| Gerenciar motivos, especialidades e classificações | Sim | Opcional | Opcional | Opcional | Não |
| Gerenciar mantenedores e turnos | Sim | Opcional | Opcional | Opcional | Não |
| Ver / gerenciar estações e arquivamento | Sim / Sim | Opcional / Opcional | Opcional / Opcional | Opcional / Opcional | Apenas identificação da própria |
| Criar usuários com permissões limitadas | Sim | Opcional por delegação | Opcional por delegação | Opcional por delegação | Não |
| Redefinir senha alheia / conceder delegação / alterar permissões alheias | Sim | Não | Não | Não | Não |
| Consultar auditoria / exportar auditoria | Sim / Sim | Opcional / Opcional | Opcional / Opcional | Opcional / Opcional | Não |

Implementar chaves independentes, por exemplo: `andon.read`, `calls.open`, `calls.cancel.own`, `calls.cancel.any`, `calls.attend`, `calls.technicians.manage`, `calls.finishMaintenance`, `calls.finish`, `calls.followUp`, `calls.returnToMaintenance`, `machines.status.write`, `production.schedule.write`, `history.read`, `diagnosis.edit`, `analytics.reclassify`, `bi.read`, `bi.export`, `priorities.read`, `priorities.write`, `catalog.assets.manage`, `catalog.reasons.manage`, `catalog.classifications.manage`, `catalog.technicians.manage`, `workstations.read`, `workstations.manage`, `users.create`, `audit.read` e `audit.export`. A tabela agrupa ações apenas para leitura; a API e o formulário mantêm os controles separados.

Alteração de diagnóstico que também muda natureza, responsabilidade ou tratamento exige **as duas** permissões relevantes; `diagnosis.edit` não concede reclassificação analítica. Alterar política analítica de catálogo exige `analytics.policy.manage`, concedida separadamente pelo Admin, além da permissão daquele catálogo. Exportação exige também leitura. Edição de catálogo não concede edição de snapshots históricos. Permissões novas nascem negadas nos usuários existentes.

### 3.3 Regras obrigatórias do servidor

1. Autorizar pela interseção de usuário ativo, sessão válida, estação aprovada/ativa/não arquivada, módulo permitido, permissão de ação, escopo do recurso e regras industriais.
2. Resolver o autor pela sessão; nunca confiar em `createdBy`, login, cargo, permissão ou natureza analítica enviados como autoridade pelo navegador.
3. Escopo inicial: todas as máquinas ou lista explícita de IDs. Lista vazia não significa todas. Filtrar também históricos, totais do BI, buscas, metadados e exportações; esconder botão não é proteção.
4. Somente Admin principal concede delegação. O criador delegado recebe um teto explícito de perfis, permissões e máquinas. O novo usuário fica limitado pela interseção desse teto com o escopo do delegante. Não pode criar Admin, delegar novamente, se elevar ou conceder auditoria. Uma redução do teto revalida os acessos derivados; a prévia informa os usuários afetados.
5. Cadastro delegado gera senha provisória somente para a conta nova. Redefinição de contas existentes continua exclusiva do Admin, como solicitado.
6. Mudança de senha, bloqueio, redefinição e alteração de privilégios invalidam as sessões pertinentes. Revalidar versão de autorização no servidor; não esperar o próximo refresh da tela.
7. Manter um Admin recuperável; impedir sua exclusão/desativação pela interface. Recuperação é fluxo mínimo de segurança, sem acesso automático aos chamados ou ao BI de uma estação bloqueada.
8. Rotas recebem política explícita; em modo central, uma rota sem política não fica aberta. Respostas sem autenticação: `401`; sem permissão: `403`; conflito de estado/versão: `409`. A UI oferece recuperação sem apagar formulários nem repetir mutações silenciosamente.

### 3.4 Técnico atuando num kiosk

O kiosk abre chamados como “Produção · Kiosk 01”. Para atendimento técnico, o mantenedor apresenta sua credencial e o servidor valida identidade, usuário associado, habilitação, escopo e permissão da ação. Registrar **conta de origem e pessoa que executou**. A autorização técnica é curta e vinculada à ação/chamado/estação; não transforma a sessão de produção em Admin ou usuário pleno.

PIN/RFID existentes não equivalem a MFA nem a prova inviolável de presença. O modo legado de seleção somente por nome permanece identificado como não verificado até a migração; não será apresentado como auditoria pessoal autenticada. Ativar o modo central exige resolver esse vínculo e a autenticação dos mantenedores. Troca de usuário nunca troca retroativamente o autor de atendimento já registrado.

## 4. Senhas, sessões e instalação

### 4.1 Fluxo de acesso

Admin cadastra → servidor gera senha provisória → entrega fora do log → primeiro login abre somente troca de senha → usuário define a própria → senha provisória e sessão limitada são invalidadas → nova sessão normal.

Redefinição: Admin reautentica → informa motivo → servidor revoga sessões e credenciais provisórias anteriores → gera nova provisória → repete o primeiro acesso. Não há recuperação de usuários por perguntas pessoais, senha antiga em tela ou senha enviada automaticamente por email.

| Parâmetro inicial proposto | Decisão |
| --- | --- |
| Login | Único, normalizado sem distinção de maiúsculas; nomes exibidos preservados. Não reutilizar login de conta desativada para outra pessoa |
| Senha provisória | Aleatória criptográfica, 20 caracteres, sem caracteres visualmente ambíguos; validade de 24 h; exibida uma vez; armazenar somente hash |
| Sessão de primeiro acesso | Até 10 min; somente trocar senha ou sair; consumo atômico da provisória ao emitir essa sessão. Se expirar sem concluir, Admin emite outra |
| Senha pessoal nova | 15–128 caracteres, aceitar frases, espaços e colagem; bloqueio local de senhas comuns; sem composição artificial nem troca periódica obrigatória |
| Sessão pessoal | Máximo 12 h; expira após 30 min sem interação humana. Polling de dados não renova inatividade; aviso antes do bloqueio |
| Ação administrativa sensível | Reautenticação realizada há no máximo 5 min para redefinição de terceiros, delegação, permissões e ativação do modo central; recuperação do próprio Admin usa o código offline |
| Kiosk provisionado | Sessão restrita persistente, renovação controlada, limite inicial de 30 dias; aviso de renovação 7 dias antes. Reboot não exige senha a cada turno; não ganha sessão administrativa persistente |
| Tentativas inválidas | Limites por conta e origem, atraso progressivo e respostas genéricas; valores calibrados com 20 kiosks, sem bloquear toda a fábrica por compartilhar IP |

Os tempos acima são decisões de produto propostas para a primeira versão, não exigências atribuídas às referências. Renovação do kiosk exige sessão válida; ultrapassado o limite, reprovisionar. Revogação impede renovação. Expiração de acesso nunca muda cronômetros, condição da máquina ou registros de atendimento.

### 4.2 Armazenamento e transporte

- Sessão opaca aleatória de 256 bits; hash do segredo no PostgreSQL, com usuário, workstation, versão de autorização, criação, atividade, expiração e revogação. Sessão persistida substitui os mapas em memória para acessos centrais.
- Navegador usa cookie `HttpOnly`, `Secure`, `SameSite`, escopo de host e proteção CSRF nas mutações. Sessões e senhas não vão para LocalStorage, URLs, logs ou exportações. Desenvolvimento em loopback tem configuração isolada.
- Preferir frontend e API sob a mesma origem HTTPS. Provisionar certificado confiável nos kiosks/celulares; não exigir internet para autenticação. Não basta ignorar o alerta de certificado. Mapear proxy/runtime/portas antes da alteração e atualizar instalador, atalhos e manifesto quando o comportamento entregue mudar.
- O backend atual usa `request.ip` e não configura `trustProxy` no construtor Fastify. Só confiar em proxies explicitamente cadastrados; não aceitar qualquer `X-Forwarded-For`. IP nunca é chave de acesso.
- Reutilizar scrypt do Node, com formato versionado contendo custo e salt. Perfil inicial: `N=2^17, r=8, p=1`, limite de memória explícito e concorrência limitada; medir no servidor Windows alvo antes de homologar. Verificar hashes antigos e atualizar após autenticação válida; não alterar PIN/RFID em massa nem aplicar o custo novo indiscriminadamente a todas as rotinas.
- Nunca armazenar senha provisória recuperável. Se a resposta de criação for perdida, emitir outra por fluxo autorizado; não introduzir cache em texto puro para reexibi-la.

### 4.3 Admin principal e compatibilidade

Instalação limpa cria `admin` com `123456` **apenas como credencial de primeiro provisionamento**, limitado à troca obrigatória. Concluir essa configuração localmente no servidor antes de liberar acesso de rede. Não criar uma conta operacional com privilégios plenos usando esse padrão.

Atualização preserva o hash do Admin e o código de recuperação existentes. Se a instalação ainda usa o padrão, o assistente exige sua troca para ativar o modo central. Nenhuma atualização, reparação, falha de consulta ou ausência inesperada de registro deve recriar `123456` automaticamente.

Recuperação do Admin é exceção separada da redefinição de usuários: código offline de uso único, guardado pelo responsável da instalação; revoga sessões e gera evento auditável. Sem código, procedimento local controlado de recuperação, nunca senha universal oculta. Preservar o verificador legado até a transição desse mecanismo.

## 5. Workstations compactas e arquivamento

Lista padrão: não arquivadas, com contagem de ativas, bloqueadas e pendentes. Filtros: Todas as não arquivadas, Ativas, Bloqueadas, Pendentes e Arquivadas. Busca por nome, UUID, IP, máquina e login. Paginação no servidor; limite padrão de 25 linhas.

**Linha recolhida:** nome/identificador curto, situação de acesso, máquina fixada ou “livre”, conta/perfil da sessão válida e último contato. IP e identificação completa ficam legíveis em uma segunda linha no celular e em colunas no desktop. Expandir mostra UUID completo, permissões, sessões, renomear/salvar, fixação e ações autorizadas. Salvar fica habilitado apenas quando há alteração; bloquear/arquivar têm confirmação contextual e motivo. Usar controle acessível de expansão, foco visível e alvos de toque adequados.

Se houver mais de uma sessão válida, indicar quantidade e listar identidades ao expandir. Exibir “último usuário” quando não existir sessão válida; não afirmar que alguém está fisicamente presente. “Último contato” é informação distinta de “sessão válida” e “estação autorizada”. O heartbeat atual de estação não comprova disponibilidade em tempo real.

| Operação | Regra e efeito |
| --- | --- |
| Bloquear | Preservar proteções atuais de estação administrativa, tela fixada e atendimento ativo; revogar acessos quando o bloqueio for efetivado |
| Arquivar | Exigir estação bloqueada, sem aprovação pendente, sem tela fixada e sem sessão técnica ativa; transação com lock da workstation; registrar autor, data e motivo |
| Registro/heartbeat de arquivada | Pode registrar contato para diagnóstico; não reativa, desarquiva ou devolve módulos/dados operacionais |
| Restaurar | Retira arquivamento; continua bloqueada e exige liberação explícita |
| Liberar | Recusar enquanto arquivada; conceder acesso somente por ação autorizada posterior |

Persistir `archivedAt`, `archivedByUserId` e `archiveReason`; validar no banco `archivedAt != null ⇒ active = false e pendingApproval = false`. Revisão de versão impede salvar formulário antigo sobre alteração concorrente. Não excluir chamados, sessões, som configurado ou histórico. Arquivar uma workstation **não arquiva nem remove a máquina do painel operacional**.

Emergência de segurança: revogar uma conta/sessão é possível sem fingir encerramento técnico. A transferência operacional de atendimento continua explícita e auditada; arquivar não será atalho para contornar as proteções atuais.

## 6. Auditoria central

`AuditEvent` registra data/hora do servidor, tipo de autor, ID e snapshot de login/nome/perfil, identidade técnica quando presente, workstation, IP observado, identificador público de sessão, request/correlation ID, ação, recurso/ID, máquina, valores anteriores/novos permitidos, resultado, motivo e versão do evento. O identificador público de sessão não é o token de autenticação.

Cobertura: criação/edição/inativação de cadastros; acessos e permissões; emissão/reset de credenciais (somente metadados); login, logout e revogação; bloqueio/restauração/arquivo de estação; programação e condição da máquina; abertura/cancelamento/atendimento/retorno/conclusão; localização; diagnóstico/reclassificação; prioridades; preferências operacionais persistidas; consultas e exportações de auditoria. Ações automáticas têm autor de serviço e origem.

- Alteração de negócio e evento de sucesso na **mesma transação**. Se não puder persistir auditoria, a alteração falha de forma explícita; não devolver sucesso e descartar o log. Leituras permanecem disponíveis conforme permissões. Logs de diagnóstico técnico são separados dessa garantia.
- Negativas de acesso e tentativas inválidas geram eventos sem executar a mutação. Limitação de taxa pode consolidar ataques repetidos por janela, preservando contagem e intervalo; não agrupar nem descartar alterações de negócio bem-sucedidas.
- Heartbeats e leituras de atualização de tela não geram um evento de alteração a cada polling. Usar metadados de atividade; consultas de auditoria e exportações continuam registradas.
- Antes/depois usa lista de campos permitidos e saneamento. Nunca incluir senha, PIN, RFID bruto, hash de credencial, token, cookie, connection string ou payload integral de autenticação.
- `audit.read` e `audit.export` separados, concedidos pelo Admin. Filtros por período, login, máquina, estação, ação e resultado; paginação por cursor. Exportação CSV UTF-8 e JSON com fuso, filtros, limite temporal e versão do schema; CSV protegido contra fórmulas. Registrar pedido e conclusão/falha de exportação; exportações grandes em lote, sem carregar toda a tabela no navegador.
- Sem editar/apagar eventos pela aplicação. Separar privilégios de migração e execução, com escrita de auditoria limitada a inserção. Isso não é garantia de inviolabilidade contra o administrador do banco; cópia externa protegida é evolução recomendada.
- Retenção inicial sem limpeza automática; monitorar volume e incluir auditoria em backup/restauração. Política de retenção e arquivo externo deve ser definida pela empresa antes de ativar qualquer descarte. Não prometer prazo legal universal.
- Preservar `FailureDiagnosisAudit`; novos eventos o referenciam por ID para consulta integrada sem contar a mesma alteração duas vezes. Registros antigos não ganham autor pessoal inventado.

## 7. Categorias, subcategorias e tratamento analítico

### 7.1 Modelo funcional

Na interface, **categoria** representa o motivo: Manutenção, Setup, Apoio à produção etc. **Subcategoria** escolhe a especialidade/destino: Elétrica, Mecânica, Afiação etc. Internamente, `CallReason` e `CallReasonOption` são novos; a especialidade mantém o ID de `AndonCategory` e seu vínculo com os mantenedores.

Exemplo: `Manutenção → Mecânica` e `Setup → Mecânica` apontam para a mesma especialidade Mecânica. O campo legado `category` continua representando o grupo de atendimento (`maintenance` ou `production`), não a nova natureza analítica. Um Setup atendido por Mecânica conserva o fluxo técnico de manutenção, responsável obrigatório e habilitação do mantenedor.

Cadastro do motivo: nome, cor, ordem, ativo, natureza padrão, responsabilidade sugerida e opções. Cada opção vincula uma especialidade, com nome/ordem próprios e política herdada ou exceção explicitamente configurada. A tela mostra a política efetiva antes de salvar. Naturezas iniciais: `corrective_failure`, `planned_setup`, `production_support` e `unclassified`; outras naturezas exigem política explícita, não inferência pelo texto do botão.

Política de manutenção: `eligible`, `excluded` ou `pending`. `eligible` significa candidato aos indicadores corretivos, condicionado à responsabilidade e evidência física; não significa criar falha ao clicar. `planned_setup` e `production_support` não podem ser `eligible`. `analyticsDisposition` mantém `include/test/false_call/duplicate`: **setup legítimo usa `include`**.

Precedência: isolamento de `isSystemTest` e invalidade comprovada → snapshot de tratamento da ocorrência → política vigente no intervalo → responsabilidade confirmada → critérios da métrica. Nenhuma categoria pode reintroduzir teste nos indicadores comuns. Antes de invalidar um chamado ligado a uma parada real, preservar a evidência física independente; o rótulo do chamado não deve apagar uma parada comprovada.

Ao abrir o chamado, o servidor captura IDs, nomes, natureza, responsabilidade sugerida, política e versão. Políticas posteriores do catálogo não alteram esse snapshot. A responsabilidade sugerida não se torna diagnóstico técnico confirmado automaticamente. Para setup, sugestão inicial Operação; ajustável pelo Admin conforme o processo da empresa.

O botão pai abre o seletor e não cria chamado. Escolher opção confirma **um** chamado. Cancelar/voltar no seletor não grava. Uma categoria com única opção pode permitir abertura direta, configurável. Abertura em lote preserva um chamado por especialidade selecionada, nunca um chamado adicional do pai.

### 7.2 Duplicidade e alterações

- Manter a trava atual: um chamado real ativo por máquina/especialidade, mesmo sob pais distintos. Se Mecânica já estiver ativa, mostrar o chamado e permitir selecioná-lo; não criar outro via Setup. Especialidades diferentes continuam simultâneas.
- Proteger abertura unitária e em lote com locks atuais e chave de idempotência. Mesma chave/mesmo conteúdo retorna a operação existente; mesma chave/conteúdo diferente retorna conflito. Repetição não gera segundo chamado nem segundo evento de sucesso. Configurações de idempotência não devem armazenar senhas provisórias.
- Chamados existentes mantêm suas especialidades, nomes históricos e regras. Mapear a UI antiga para opções de compatibilidade; não atribuir retrospectivamente natureza corretiva com base apenas no setor.
- Catálogo inativo continua visível no histórico e no atendimento já aberto. Não apagar opção referenciada nem mover sua identidade para outra especialidade. Alterações de fluxo com chamados ativos respeitam os bloqueios existentes.
- Reclassificação de uma ocorrência exige permissão própria, motivo, antes/depois e horário efetivo. Divergência entre diagnóstico e natureza deve ser resolvida explicitamente; escolher diagnóstico de manutenção não transforma setup em falha automaticamente.

## 8. BI: regras fechadas para implementação

### 8.1 Quatro medidas que não podem ser somadas entre si

1. **Chamado:** solicitação a uma especialidade, contado por ID.
2. **Episódio físico:** união de intervalos parados da mesma máquina, inclusive intervalos que se tocam sem operação comprovada.
3. **Impacto causal:** fatia temporal atribuída ao motivo/responsabilidade que efetivamente mantém a máquina parada.
4. **Trabalho técnico:** união dos intervalos de cada pessoa; pessoas diferentes podem trabalhar simultaneamente.

Abrir um chamado com máquina rodando não cria parada. Setup não altera automaticamente o modo de produção para “não programada”. Modo de produção é registro separado, com permissão e auditoria próprias.

### 8.2 Populações dos indicadores

| Medida | Regra nova |
| --- | --- |
| Falhas / MTBF de manutenção | Apenas episódios físicos inteiramente corretivos, política elegível e responsabilidade de manutenção comprovada. Denominador conta inícios de episódios elegíveis dentro da janela e da programação; nunca quantidade de chamados |
| Numerador do MTBF | Tempo programado realmente em operação, descontadas **todas** as paradas reais, inclusive setup. Excluir setup da contagem de falhas não o transforma em tempo de funcionamento |
| MTTR de manutenção | Duração integral dos episódios elegíveis encerrados na janela / quantidade desses episódios; exclui abertos, setup, apoio, causas mistas e pendências da amostra |
| MTTA corretivo | Abertura até primeiro atendimento dos chamados com natureza corretiva e política elegível; coorte pelo primeiro atendimento na janela; exige atribuição de manutenção para amostra confirmada |
| MTTA geral e MTTA de setup/apoio | Preservar MTTA geral existente; acrescentar recortes rotulados. Não mudar silenciosamente a população de `mttaMinutes` |
| Chamados reais, duração e atendimento | Setup/apoio continuam no total e em recortes próprios, com amostras explícitas |
| Parada física global | União temporal por máquina; conserva minutos reais de setup, falha e causa pendente. Nunca somar pai+filho ou especialidades simultâneas |
| Disponibilidade programada | `(tempo programado − parada coincidente) / tempo programado`. Setup dentro da programação reduz disponibilidade; fora dela não entra no denominador nem na perda coincidente |
| Horas técnicas | Incluem trabalho legítimo em setup/apoio; mesma pessoa não duplica minutos por registros sobrepostos; pessoas distintas somam pessoa-minuto |
| Retorno, reincidência e Pareto de falhas | Recorte corretivo explícito; setup não vira falha repetida. Retorno do fluxo de apoio pode existir, com rótulo separado |
| Testes/falsos/duplicados | Preservar política de exclusão atual e rastreabilidade. Não usar essas exclusões para remover setup legítimo |

Denominador vazio continua `null`/travessão com amostra, nunca MTTR zero ou MTBF infinito. Janelas semiabertas e fuso operacional permanecem; arredondar só após agregar. Filtros de motivo/especialidade não transformam uma disponibilidade de população completa em disponibilidade artificialmente melhor; quando o denominador não for demonstrável, indicar indisponibilidade do indicador e explicar o recorte.

Manter exportações e todas as áreas analíticas sob a mesma resolução de política. Acrescentar versão proposta `bi-reasons-1`, populações/amostras, quantidade de legados e pendências. Preservar chaves antigas quando a semântica for igual; novas métricas têm chaves próprias. Atualizar a metodologia e avisar mudanças deliberadas dos recortes corretivos.

### 8.3 Setup que encontra uma falha real

Registrar transição com horário efetivo, justificativa e autor. Persistir `CallPolicyInterval` com natureza/política e a atribuição aplicável ao trecho; cruzar com `CallImpactInterval`. O último diagnóstico do chamado não pode reescrever automaticamente todos os intervalos anteriores. Mudança de catálogo também não reescreve esses trechos.

Exemplo: máquina parada de 10:00 a 10:50; setup até 10:30; falha comprovada de 10:30 a 10:50. Resultado: **50 min físicos, 30 min setup e 20 min corretivos**, sem sobreposição. Se falha e setup estiverem presentes simultaneamente e não houver evidência de qual impediu a produção, a parcela fica pendente; não atribuir por ordem de chegada ou duplicar os minutos.

**Decisão conservadora desta versão:** sem retomada entre os trechos, existe um episódio físico misto. Mostrar os 20 min corretivos no detalhamento, mas não inventar um novo episódio de falha independente. O episódio misto fica fora do MTTR de episódios inteiramente corretivos e impede declarar MTBF conclusivo na população afetada, com motivo e contagem visíveis. Um futuro indicador de reparo por segmento precisará de nome/fórmula próprios. Essa regra preserva a metodologia atual de episódios, em vez de fabricar precisão.

Separar intervalos contíguos de política não separa a parada física. Intervalos não podem ter duração negativa, sobreposição da política do mesmo chamado ou início fora da vida do chamado. Correções retroativas são explícitas, auditadas e limitadas a usuários autorizados; recalcular as visões a partir da versão corrigida, mantendo a evidência anterior.

### 8.4 Legados

Registros anteriores não recebem natureza inferida por nome. Preservar a política `bi-causal-1` como fallback explicitamente identificado para esses registros; mostrar contribuição e cobertura de legados. Na ativação de `bi-reasons-1`, capturar uma revisão imutável das exclusões de catálogo usadas pelo fallback legado. Assim, editar o catálogo depois não muda silenciosamente históricos sem snapshot; mudar essa revisão exige análise de impacto, permissão analítica e auditoria. Isso versiona a leitura, sem reescrever registros brutos. Dentro dos novos chamados, snapshot ausente ou política conflitante gera pendência, não fallback permissivo. Rever um legado é ação específica e auditada. Alterar catálogo não autoriza backfill automático.

## 9. Casos de aceite que bloqueiam a liberação

| ID | Cenário | Resultado obrigatório |
| --- | --- | --- |
| A01 | Senha provisória válida, vencida, reutilizada e reset em paralelo | Só a credencial atual permite troca; nenhuma provisória libera ANDON/BI antes da troca; consumo atômico |
| A02 | Reset, bloqueio ou redução de privilégios com sessão aberta | Próxima ação protegida negada; sem apagar chamado ou sessão técnica |
| A03 | Gerente sem delegação chama API de criação diretamente | Negado, sem usuário criado, tentativa registrada |
| A04 | Delegante tenta criar Admin, ampliar máquinas ou conceder auditoria | Negado inclusive por payload manipulado; teto também limita acessos derivados |
| A05 | Usuário troca ID de máquina, workstation ou chamado na URL | Sem leitura/escrita fora de escopo; BI/exportação e metadados respeitam o mesmo limite |
| A06 | Kiosks 01 e 02 com mesmo perfil | Identidades e revogações independentes; ação técnica identifica também a pessoa autenticada |
| A07 | Reinício da API, expiração, CSRF e repetição de token revogado | Persistência conforme política; CSRF negado; token revogado não volta a funcionar |
| A08 | Atualização com Admin e credenciais existentes | Senhas/histórico preservados; não criar padrão novo nem associar pessoa automaticamente |
| W01 | Arquivar ativa/pendente/fixada/com técnico ativo | Rejeição no servidor; formulário manipulado não contorna proteção |
| W02 | Arquivar bloqueada, registrar heartbeat, restaurar | Mantém bloqueio; histórico e máquina intactos; restauração não concede acesso |
| W03 | Renomear e bloquear em duas sessões simultâneas | Conflito detectável; não reverter estado com formulário antigo |
| L01 | Falha ao inserir auditoria durante mutação | Transação inteira desfeita; erro claro; nenhuma confirmação falsa |
| L02 | Consultar/exportar sem autorização e com campos maliciosos | Negado sem permissão; CSV seguro; segredos ausentes inclusive dos logs técnicos |
| C01 | Selecionar pai, cancelar modal, selecionar folha, clique duplo/retry | Pai/cancelamento não gravam; folha cria um; retry idempotente |
| C02 | Manutenção/Mecânica ativa e tentativa Setup/Mecânica | Seleciona/informa chamado existente; não cria duplicidade; especialidade/habilitação preservada |
| C03 | Alterar nome/política de catálogo após abrir chamado | Snapshot histórico estável; só futuras aberturas usam versão nova |
| B01 | Janela 480 min programados; apenas setup de 30 min | 30 min físicos; disponibilidade 93,75%; zero falhas corretivas; MTBF/MTTR sem amostra; setup e horas técnicas presentes |
| B02 | 480 min programados; setup de 30 min fora da programação | Disponibilidade 100% se não houver outras perdas e cobertura completa; 30 min no histórico global; nenhuma falha corretiva |
| B03 | Setup 30 min; retomada; depois falha de manutenção de 20 min, tudo em 480 min | 50 min físicos; 430 min operando; disponibilidade 89,58%; 1 falha elegível; MTBF 430 min; MTTR 20 min, com episódios completos na janela |
| B04 | Elétrica e Mecânica em setup simultâneo por 30 min, uma pessoa distinta por setor | 2 chamados, zero falhas corretivas, 30 min físicos e 60 pessoa-minuto; nunca 60 min de parada |
| B05 | Setup 10:00–10:30 e falha 10:30–10:50 sem retomada | 50 min físicos; repartição 30/20; episódio misto explicitado; nenhum MTBF/MTTR puro fabricado |
| B06 | Chamado com máquina rodando, teste automático, cancelamento e legado | Sem parada inventada; testes não ocupam chamado real; cancelamento não apaga parada comprovada; legado identificado |
| B07 | Eventos/IDs sobrepostos, janela parcial, parada aberta e mudança de dia | União temporal correta; sem médias de zero por ausência; coortes e fuso preservados |
| B08 | Mesmos filtros em overview, demais abas, detalhe e PDF | Totais, amostras e versão conciliados; categoria e especialidade não multiplicam resultados |
| M01 | 360/390/412 px; tablet; notebook 1366×768; kiosk 1920×1080 | Todas as ações alcançáveis; sem sobreposição/corte; desktop preservado |
| M02 | Teclado móvel, rotação, zoom de texto, nomes longos e muitos chamados | Foco/ações visíveis, rolagem vertical natural; somente tabelas extensas têm rolagem horizontal local |
| P01 | 20 kiosks consultando e abrindo chamados; falhas de rede e retry | Sem duplicidade nem perda; medir latência p95, CPU/memória e banco frente à base, com carga e hardware registrados |

Cenários numéricos são exemplos verificáveis, não resultados medidos no piloto. Executar unidade/integrados em PostgreSQL isolado, fluxos reais em modo API e validação visual com dados representativos. Emulação não substitui verificação física Android/iOS; manter status de cada evidência.

## 10. Contratos de dados e API a implementar

Nomes são contratos de arquitetura; migrations concretas serão revisadas na tarefa correspondente.

| Entidade | Campos/relações essenciais e proteção |
| --- | --- |
| `User` | ID estável, login normalizado único, nome, tipo pessoal/kiosk, cargo, modelo de perfil, ativo, hash versionado, troca obrigatória, expiração provisória, versão de autorização, autoria/timestamps; inativar sem exclusão histórica |
| `UserPermission`, `UserMachineAccess` | Permissões explícitas e modo de escopo; unicidade por usuário/chave ou usuário/máquina; negação prevalece sobre modelo |
| `UserDelegation` | Admin concedente, delegado, teto de permissões/perfis/máquinas, versão; rastrear criador e origem delegada dos acessos |
| `UserSession` | Hash único de token, ID público, usuário, workstation, finalidade, versão, expiração/atividade/revogação; índices para consulta e revogação |
| `KioskEnrollment` | Usuário kiosk e workstation únicos, provisionador, data e revogação; não fundir automaticamente `KioskDevice` |
| `Workstation` | Campos de arquivo, revisão de concorrência; índices para arquivo/situação/ordenação; invariantes de bloqueio |
| `AuditEvent` | Campos da seção 6; índices por data/ID, autor, recurso e máquina; sem cascata destrutiva de usuários/estações |
| `CallReason`, `CallReasonOption` | Catálogo pai e ligação com especialidade existente, ativos, ordem, revisão e política; vínculo pai/especialidade único |
| `AndonCall` | IDs de motivo/opção, snapshots de exibição/política, autor autenticado e versão; conservar campos legados |
| `CallPolicyInterval` | Chamado, início/fim efetivos, natureza/política/responsabilidade, revisão/autoria; política imutável por versão e correção rastreável |
| `AnalyticsPolicyRevision` | Versão, snapshot das regras de fallback legado, ativação, autor e motivo; revisões anteriores preservadas |
| `Technician` | Relação única opcional com usuário pessoal; preservar IDs, PINs e sessões existentes |
| `MutationRequest` | Chave idempotente, autor/estação/operação, hash do comando, recurso/resultado sem segredo e expiração; não duplicar gravações em retries |

Rotas planejadas: `/api/auth/login`, `/api/auth/me`, `/api/auth/change-password`, `/api/auth/logout`; `/api/users` e operações de reset/delegação; `/api/audit-events` e exportação; `/api/workstations/:id/archive` e `/restore`; `/api/call-reasons`; transição de política em `/api/andon-calls/:id/policy-transitions`. Manter endpoints existentes quando compatíveis; a listagem paginada nova não substitui silenciosamente um array esperado por clientes antigos.

O servidor fornece capacidades efetivas à UI; formulários não calculam autorização por cargo. API e UI validam versões para impedir alteração perdida. Dados de ação técnica e metadados de sistema são produzidos pelo servidor. `isSystemTest` e origem de instalador exigem identidade de serviço/autoridade específica no modo central, não apenas campos convencionados no corpo.

## 11. Migração e publicação

1. **Expansão:** migrations aditivas, campos opcionais nos legados, auditoria e novos contratos; sem seed/reset/backfill de autoria/natureza. Código legado continua operando sob seu modo declarado. Nessa fase, registrar autor legado conhecido ou `legacy_unidentified`, sem prometer auditoria pessoal completa.
2. **Preparação:** mapear Admin, usuários, técnicos e kiosks; testar HTTPS, recuperação, runtime Windows, instalador e consumidores de API. Inventariar scripts/integradores em uso; não assumir homologação de PLC/Node-RED/Raspberry Pi.
3. **Homologação isolada:** backup restaurado em ambiente de teste; comparar contagens/IDs/timestamps/hashes e casos da seção 9; comprovar que upgrade e reparo não executam seed.
4. **Ativação controlada:** assistente de prontidão e janela operacional; começar por estação de teste. Modo central só ativa após Admin seguro, transporte, contas/vínculos e recuperação validados. Habilitar aprovação obrigatória de novos browsers; trocar UUID ou limpar cookies não concede acesso.
5. **Substituição de credenciais:** no modo central, credenciais compartilhadas de módulos e Admin antigo não constituem rota alternativa. Desabilitar emissão/aceitação desses tokens para recursos centrais; manter somente adaptadores explicitamente restritos durante a janela de transição. Consumidor antigo recebe erro claro de atualização, nunca bypass anônimo por ausência de `Origin` ou UUID.
6. **BI e categorias:** ativar a organização por motivos depois de validados os cálculos; clientes novos recebem versão da política. Clientes anteriores incompatíveis com motivos novos devem ser atualizados antes da ativação. Nenhuma instalação existente muda histórico por simples atualização do catálogo.
7. **Publicação:** revisão e verificações do repositório, PR por etapa e autorização de merge conforme solicitado. Avisar o SHA da `main` liberada e roteiro de verificação no notebook/celular. Merge não equivale a atualização do servidor piloto.
8. **Reversão:** backup de banco, configuração e código antes de deploy. Migrations aditivas não autorizam rodar código antigo sobre dados novos sem avaliação. Depois de ativar acesso central, código antigo poderia ignorar permissões; rollback deve ocorrer em manutenção, com plano de preservação/reconciliação das operações posteriores ao backup. Não restaurar backup antigo sobre chamados novos sem reconciliação.

## 12. Mobile e melhorias incorporadas

As fotos mostram KPIs comprimidos, cabeçalho sobreposto e painéis com altura insuficiente. Refinamento final deve liberar altura natural e rolagem vertical da página no mobile, reorganizar cabeçalhos/filtros, preservar unidade junto do valor do KPI, dimensionar gráficos e modais para toque e teclado. Painéis fixos de desktop/kiosk continuam restritos aos seus breakpoints. Conferir versão efetivamente servida antes de comparar evidências; não atribuir o problema a cache sem comprovação.

Melhorias incluídas no escopo: contas independentes de kiosk, permissões por máquina, identidade técnica separada, idempotência, conflito de edição, política histórica de BI, lista de estações expansível e exportação auditada. Próximas evoluções opcionais: MFA para administração, diretório/SSO corporativo, agrupamento de máquinas por unidade, cópia externa de auditoria e provisionamento em lote de kiosks. Não exigir essas integrações para operar localmente nesta etapa.

## 13. Referências e limites

Consultadas em 26/10/2026. São referências de desenho; não constituem certificação de segurança, OEE ou conformidade.

- [OWASP — Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): menor privilégio, negação por padrão e validação de cada acesso.
- [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): transporte, cookies, expiração e revogação de sessões.
- [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): credenciais temporárias aleatórias, expiração e uso único; adaptação para redefinição exclusivamente administrativa.
- [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): hash e custo; compatibilidade e medição no runtime real.
- [OWASP — Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): autoria, proteção, saneamento e restrição de acesso aos logs.
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): referência para senhas pessoais longas e aceitação de frases; não altera o PIN operacional legado por inferência.
- [Vorne — OEE Factors](https://www.oee.com/oee-factors/): changeover dentro da produção planejada pode reduzir disponibilidade. ANDON continua apresentando disponibilidade, não OEE completo.
- [Metodologia atual do ANDON](../BI_METODOLOGIA_E_QUALIDADE.md): fonte das regras preservadas de episódio, tempo técnico, programação e legados.

### Registro de conclusão da tarefa 1

Entregue: levantamento estático na `main` indicada, decisões de arquitetura, matriz de acesso, contratos de dados/API, regras numéricas e plano de validação. Implementação, migrations, medição de carga, homologação física, merge e deploy permanecem nas tarefas seguintes. Resultados dos checks desta alteração documental ficam em [validação da tarefa 1](../validation/access-bi-spec-20261026.md).
