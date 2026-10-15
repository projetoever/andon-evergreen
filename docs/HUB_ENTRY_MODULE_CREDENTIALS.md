# Hub: entrada, permissões e credenciais por módulo

Candidata baseada na `main` `c041478`, release `1.0.0-pilot.3`, revisada em 15/10/2026. Sem merge ou implantação nesta etapa. O PR e sua CI registram o commit final validado.

## Fluxo de entrada

`http://IP:8080/` renderiza o Hub sem inicializar providers de operação, polling de máquinas, sessões de mantenedores ou áudio. `/hub` continua como endereço equivalente. O launcher/kiosk existente já abre a raiz e passa a apresentar o Hub após a atualização do frontend. Não é necessário mudar porta, tarefa Windows ou argumentos do Chrome.

O painel operacional passa para `/andon`. Links internos de retorno ao painel foram ajustados. `/bi`, `/machine-priorities` e `/machines/:id` são preservados. Endereços diretos continuam sujeitos à permissão e à autenticação do módulo.

Uma workstation com tela fixada também começa no Hub. Ao selecionar ANDON, retorna à máquina fixada. A fixação é uma preferência operacional: não redireciona automaticamente o Hub, BI ou Prioridades. No módulo operacional fixado, o seletor continua oculto, conforme o comportamento da tela dedicada.

O campo legado `hubEnabled` permanece no banco/API para compatibilidade com versões anteriores. A candidata não depende dele para exibir o Hub ou navegar entre módulos e retira o antigo interruptor de ativação da interface.

Instalador, watchdog e abertura do kiosk verificam `/health/ready`, independente da senha operacional. Esse endpoint faz somente leituras de prontidão do banco/schema e não retorna máquinas, credenciais ou dados de chamados. Falha de banco/schema retorna HTTP 503. O teste automático de escrita do instalador retorna **SKIP**, explicitamente, quando o ANDON exige senha; a escrita deve então ser validada pela interface autorizada. Não existe bypass de senha para health checks.

## Permissão e visibilidade

As permissões `allowOperational`, `allowBi` e `allowPriorities` são independentes e administradas no Hub. A ativação geral da estação prevalece sobre as três.

| Exemplo              | Operação | BI  | Prioridades |
| -------------------- | -------- | --- | ----------- |
| Terminal de produção | Não      | Não | Sim         |
| Gestão/manutenção    | Sim      | Sim | Não         |
| Terminal operacional | Sim      | Não | Não         |

Cartões e atalhos não autorizados ficam ausentes da interface. A API também rejeita as requisições diretas com `403 module_forbidden`. A tela vazia mantém o acesso administrativo para recuperação. A política é consultada a cada navegação e a cada 30 segundos; o servidor verifica cada requisição identificada.

O registro preserva a identidade UUID do navegador, o nome e o IP visto pelo servidor. Estações existentes mantêm suas permissões; o novo campo de Prioridades tem default `true`. O cadastro automático continua com os defaults compatíveis: o administrador deve restringir cada estação conforme sua função. UUID identifica navegador/perfil, não hardware inviolável.

## Autenticação dos módulos

Operação e BI possuem credenciais próprias na tabela `module_credentials`. Prioridades conserva a credencial existente em `dashboard_priority_config`. Não há cópia da senha global, recadastro obrigatório de Prioridades ou gestão corporativa de usuários.

Cada módulo permite configurar usuário/senha e a exigência de autenticação. Defaults:

| Módulo            | Exigir senha após migration                            |
| ----------------- | ------------------------------------------------------ |
| ANDON operacional | Não, até configuração explícita pelo Admin             |
| ANDON BI          | Não, até configuração explícita pelo Admin             |
| Prioridades       | Sim, preservando a regra anterior e a credencial atual |

O backend recusa habilitar a exigência sem uma credencial configurada. Senhas têm de 6 a 128 caracteres, usuários de 3 a 80. Senhas são normalizadas sem espaços externos, persistidas como hash scrypt e nunca retornadas pela API. Nas configurações de ANDON/BI, deixar a nova senha vazia mantém o hash atual.

Sessões de operação/BI duram oito horas, são independentes da sessão Admin e vinculadas ao módulo, UUID da estação e versão da credencial. Tokens ficam em `sessionStorage`; o servidor guarda as sessões em memória. Reiniciar o backend ou expirar a sessão exige novo login. Atualizar a configuração de acesso invalida sessões anteriores por versão. A troca de senha de Prioridades e a mudança de sua exigência também invalidam suas sessões existentes.

Uma credencial válida não supera a permissão negada ou a inativação da estação. A senha do módulo não concede poderes administrativos nem substitui a identificação do mantenedor por nome/PIN/RFID.

Sem senha em Prioridades, a sequência só pode ser usada por estação identificada, ativa e autorizada. O responsável registrado é `workstation:<UUID>`, derivado pelo servidor, sem inventar nome de pessoa. Com senha, a identificação da sessão de Prioridades continua sendo utilizada.

## Contratos e recuperação

| Método e endpoint                             | Finalidade                                 | Autoridade                                         |
| --------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| GET `/api/modules/access`                     | Visibilidade, exigência e estado da sessão | Estação identificada; sem hashes/tokens no retorno |
| GET `/api/modules/credentials`                | Estado de configuração de ANDON/BI         | Admin                                              |
| PUT `/api/modules/:module/credentials`        | Configurar acesso de `operational` ou `bi` | Admin                                              |
| POST `/api/modules/:module/login`             | Criar sessão de operação/BI                | Credencial válida e estação autorizada             |
| POST `/api/modules/:module/logout`            | Revogar token apresentado                  | Sessão do módulo                                   |
| PATCH `/api/dashboard-priority/access-policy` | Exigir ou dispensar senha de Prioridades   | Admin                                              |
| PUT `/api/dashboard-priority/credentials`     | Atualizar credencial existente             | Admin                                              |

A API resolve o módulo pela família da rota. Cabeçalhos `X-Andon-Operational-Token` e `X-Andon-Bi-Token` carregam sessões distintas, sem substituir o Bearer Admin ou o Bearer de Prioridades. CORS aceita explicitamente os novos cabeçalhos. Um token de ANDON não autentica BI, e o token não pode ser reutilizado com outro UUID.

`/hub/admin` permanece fora dos providers/gates dos módulos. A sessão administrativa autoriza somente os endpoints de gestão/recuperação previstos, inclusive credenciais e política de Prioridades. Não libera operação ou análises restritas. Proteções contra auto inativação, revogação operacional com máquina fixada e atendimento ativo permanecem.

Clientes legados sem Origin/UUID conservam a compatibilidade de autorização anterior **enquanto o módulo não exigir senha**. Ao habilitar senha de operação ou BI, as respectivas APIs passam a exigir a sessão também nesses clientes. Integrações HTTP e terminais que usem essas APIs precisam ser considerados antes da ativação dessa opção. `/health`, identificação e recuperação administrativa permanecem acessíveis conforme seus contratos existentes.

## Divisão administrativa

O Hub concentra estações, permissões, credenciais dos módulos, senha global e recuperação. Sua seção **Módulos e senhas** reúne os três acessos. O link legado `section=priorities` continua aceito para compatibilidade.

O Admin do ANDON remove a aba da plataforma e seus atalhos de provisionamento. Conserva máquinas, ativos, setores, classificações, mantenedores, turnos, sons, atendimento, teclado virtual, OS, restrição de conclusão e modo padrão/prioritário do Dashboard. A preferência de ordenação aceita Prioridades configurado com credenciais ou com exigência explicitamente dispensada.

## Migration, backup e reversão

Migration aditiva `20261015123000_hub_entry_credentials` adiciona `allowPriorities`, a política de senha de Prioridades e a tabela de credenciais de operação/BI. Não contém seed/reset, exclusão ou conversão de dados históricos.

Backup de código anterior à candidata: `backup/pre-hub-entry-20261015-main-c041478`. Backups anteriores à primeira entrega do Hub continuam preservados. Isso não é backup do banco instalado.

Antes de atualizar uma instalação, confirme backup do banco e da configuração. Aplique migrations e gere o Prisma Client antes de iniciar a API nova; frontend e backend devem ser atualizados juntos. A instalação permanece em modo API. Nenhum fallback local é acionado por falha de rede.

Para reversão, use o código anterior preservando as colunas aditivas. A versão anterior ignora `allowPriorities` e as novas senhas de ANDON/BI: essa reversão deixa de aplicar essas proteções. Prioridades volta à exigência antiga. Não remova tabelas/colunas nem execute seed/reset como procedimento emergencial.

## Evidências e limites

Testes locais abrangem oito combinações de permissões, sessão por módulo/estação, expiração, troca de senha, recuperação e regressões operacionais. O navegador usa fixtures e verifica a raiz, formulários, ocultação, login, logout, navegação e layouts até 320 px. A CI aplica migrations no PostgreSQL 16 isolado e percorre a API real, incluindo credenciais persistidas e CORS.

O lint global contém pendências anteriores de formatação; o resultado real é registrado no PR. Windows Server 2016, PostgreSQL 17, kiosk instalado, Máquina 37 e integrações físicas dependem de validação no ambiente correspondente. Nenhuma homologação da fábrica é inferida dos testes isolados.
