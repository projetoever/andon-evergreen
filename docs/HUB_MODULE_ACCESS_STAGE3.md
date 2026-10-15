# Hub e permissões por workstation — ETAPA 3

Candidata de código no PR #199, baseada em `cfa1d0d` (PR #198), release `1.0.0-pilot.3`. Revisão de 14/10/2026. Não representa implantação ou homologação do piloto. Consulte também o [guia do administrador](ANDON_HUB_GUIA_ADMINISTRADOR.md).

## Entrega nesta etapa

- `/hub` e seletor Módulos usam os tokens, cores, tipografia e componentes atuais do ANDON.
- `/`, `/bi`, `/machine-priorities` e rotas de máquinas são preservadas; nenhum launcher, kiosk ou atalho é alterado.
- Hub, recuperação administrativa e Prioridades não montam os providers operacionais, os snapshots de máquinas, as sessões de técnicos ou os sons.
- Registro canônico de módulos na API. Disponibilidade técnica, habilitação da instalação e permissão da estação são campos separados. Nesta versão os três módulos estão tecnicamente disponíveis/habilitados; não há licenciamento comercial.
- `allowOperational` e `allowBi` são independentes. Defaults `true` preservam estações existentes. Prioridades mantém autenticação própria no backend.
- `hubEnabled` inicia `false` e controla a navegação central. Ativação em `/hub/admin` exige Admin. Desativar a navegação não desativa a política de acesso; `/hub` continua sendo uma saída segura das telas restritas e `/hub/admin` permanece disponível para recuperação.
- A identidade é a do navegador (cookie UUID), não uma identidade inviolável do computador.
- Acesso por URL é verificado antes de montar providers. A API classifica suas próprias rotas e verifica cada requisição identificada, sem confiar em um cabeçalho de módulo do cliente.
- BI recebe apenas metadados de filtros em `/api/analytics/filter-options`, sem depender do snapshot operacional. Prioridades usa sua API de ordenação.
- `/hub/admin` reúne quatro seções: visão geral, estações e acessos, segurança e acesso de Prioridades. O parâmetro `section` permite abrir cada seção diretamente; valores desconhecidos mostram a visão geral. Somente o formulário selecionado é montado.
- Senha global, geração de recuperação e provisionamento de Prioridades foram transferidos das configurações operacionais para o Hub. As entradas antigas encaminham à seção correspondente usando a mesma sessão administrativa.
- A política continua sendo consultada a cada mudança de rota e a cada 30 segundos. O registro/heartbeat do navegador é deduplicado e limitado ao intervalo existente de 15 minutos; isso não armazena nem posterga a verificação de permissão no servidor.
- Nenhum chamado, histórico, cálculo de tempo ou arquivo sonoro é modificado. A troca de rota não encerra atendimentos nem redefine timestamps.

## Divisão administrativa implementada

| Responsabilidade                                                     | Autoridade funcional                          | Situação nesta revisão                                                    |
| -------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| Estações, ativação geral e permissões ANDON/BI                       | Hub                                           | Gestão central; entrada antiga encaminha ao Hub                           |
| Navegação entre módulos e ativação do Hub                            | Hub                                           | Implementado                                                              |
| Senha global do Admin e código de recuperação                        | Hub / plataforma                              | Formulários centralizados; mesma credencial e validação existentes        |
| Credencial e sessão de Prioridades                                   | Prioridades, provisionadas pelo Admin central | Provisionamento no Hub; login e sessão próprios preservados               |
| Sequência visual de produção                                         | Prioridades                                   | Módulo independente do provider operacional                               |
| Modo de apresentação padrão/prioritário do dashboard                 | ANDON                                         | Preferência do consumidor da sequência                                    |
| Chamados, atendimento por nome/PIN/RFID, OS e restrição de conclusão | ANDON                                         | Regras e telas existentes preservadas                                     |
| Sons, silêncio e áudio por máquina/estação                           | ANDON                                         | Comportamento existente preservado                                        |
| Máquinas, conjuntos, subconjuntos, setores e classificações          | ANDON como fonte operacional compartilhada    | BI consulta dados; separar tela não deve duplicar catálogo nem regra      |
| Mantenedores, áreas técnicas e turnos                                | ANDON                                         | Continuam vinculados ao ciclo de atendimento                              |
| Teclado virtual e preferências atuais da interface operacional       | ANDON                                         | Permanecem junto às regras e preferências que as consomem                 |
| Indicadores, filtros, Machine 360, qualidade dos dados e relatórios  | BI                                            | Consulta e análise; correções operacionais permanecem auditáveis no ANDON |
| Backup de banco/configuração, serviços Windows e integrações físicas | Administração da instalação                   | Fora do navegador e desta etapa                                           |

O Hub administra o acesso aos três módulos. Não duplica os catálogos industriais, não altera a sequência de produção e não cria usuários corporativos ou novas funções de BI. A seção antiga de workstations permanece como encaminhamento, evitando dois locais de edição da mesma política.

## Recuperação e proteções

`/hub/admin` funciona fora do gate operacional, inclusive para estação inativa. A sessão Admin permite somente os endpoints de recuperação da plataforma: lista/edição de estações, configuração do Hub, autenticação administrativa, leitura do estado de acesso de Prioridades e provisionamento de sua credencial. Isso não libera APIs operacionais, analíticas ou a edição da sequência de Prioridades. Login, recuperação e alteração de senha continuam validando credenciais no servidor.

O backend impede desativar a própria estação administrativa. Também impede retirar operação/desativar estação com tela fixada ou atendimento ativo. A leitura de permissão é repetida após o lock transacional na associação de atendimentos, evitando uma sessão nova depois de revogação concorrente. É necessário desbloquear a máquina ou concluir/transferir os atendimentos pelos fluxos existentes antes de restringir a estação.

O seletor usa o Dialog existente (Escape, foco contido e devolução do foco). A tela fixada não oferece Módulos. Acesso a outras rotas retorna à máquina fixada; recuperação administrativa permanece disponível. Prioridades pede confirmação ao sair com alterações não salvas e protege o fechamento do navegador.

Compatibilidade legada: requisições sem Origin e sem UUID continuam no fluxo existente. Clientes com UUID são sujeitos à política. Essa compatibilidade não é uma barreira de autenticação corporativa e não deve ser anunciada como tal.

## Migração e reversão

Migration aditiva `20261014223000_hub_module_access` adiciona três booleanos. Não há seed, exclusão ou conversão de históricos. Aplicação somente após backup do banco e autorização de implantação. A migração deve preceder o início do backend novo.

Para reverter a experiência: desativar navegação do Hub no Admin. Para reverter restrições: restaurar as permissões de cada estação no Admin. Reversão de código pode manter as colunas adicionais; o código antigo não conhece nem aplica as restrições novas. Não remover colunas no banco como parte de uma reversão emergencial.

Backups de código preservados: `backup/pre-hub-20261014-main-6fcae079` e `backup/pre-hub-20261014-i18n-cfa1d0d`. O ZIP/bundle anterior foi testado por restauração. Isso não substitui backup do PostgreSQL, configuração instalada, perfis dos navegadores ou integrações da fábrica.

## Validação e limites

A suíte de autorização testa quatro combinações de ANDON/BI, leitura/escrita direta, tentativa de cabeçalho falso, recuperação sem liberar operação e integração sem Origin. O fluxo PostgreSQL/API cobre defaults da migração, permissões persistentes, independência de filtros e Prioridades, auto bloqueio e atendimento ativo. Evidências finais de build, UI, navegador e CI ficam no PR.

A revisão corrige os bloqueios anteriores de tipagem do frontend, preservando a normalização legada de estado e o snapshot persistido dos tempos. `npm run typecheck` passa a integrar a CI antes do build. O lint global mantém pendências anteriores de formatação; registrar seu resultado real sem declarar aprovação global.

Testes com fixtures e PostgreSQL isolado não homologam Chrome kiosk, PostgreSQL 17, Windows Server 2016, Máquina 37 ou integração física. A verificação da Máquina 37 e a apresentação serão realizadas manualmente pelo responsável. Merge, reinício de serviços e implantação não estão incluídos nesta revisão.
