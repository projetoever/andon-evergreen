# ANDON Hub — guia do administrador

Candidata do PR #199 para `1.0.0-pilot.3`, revisada em 14/10/2026. Este documento descreve o código da candidata, sem afirmar instalação ou homologação da fábrica.

## Entradas e navegação

Abra `/hub` no endereço da instalação para escolher ANDON operacional, ANDON BI ou Prioridades de produção. O Hub usa o tema, as cores e os componentes existentes do ANDON. Os endereços diretos dos módulos e das máquinas continuam disponíveis conforme as permissões da estação.

O botão **Módulos** aparece quando a navegação central está ativada. Em uma tela fixada em máquina, a navegação continua dedicada à máquina. A entrada administrativa `/hub/admin` permanece acessível para recuperação.

Entre no Admin com a credencial administrativa já existente. Esta revisão não redefine senhas nem cria uma segunda conta administrativa.

| Seção do Hub          | Endereço                          | Uso                                                          |
| --------------------- | --------------------------------- | ------------------------------------------------------------ |
| Visão geral           | `/hub/admin`                      | Ativar a navegação central e consultar as responsabilidades  |
| Estações e acessos    | `/hub/admin?section=workstations` | Identificar estações, ativar e ajustar permissões            |
| Segurança             | `/hub/admin?section=security`     | Alterar a senha global e gerar código de recuperação         |
| Acesso de Prioridades | `/hub/admin?section=priorities`   | Provisionar ou atualizar a credencial própria de Prioridades |

As entradas de administração da plataforma no painel operacional abrem essas mesmas seções. A sessão Admin é compartilhada entre as telas no mesmo navegador. **Sair do Admin** encerra essa sessão administrativa; a troca de módulo não finaliza atendimentos ou chamados.

## Quem administra cada função

| Área                        | Responsabilidades                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hub                         | Navegação central, estações, permissões, senha global, recuperação e provisionamento de Prioridades                            |
| Admin do ANDON              | Máquinas, conjuntos, subconjuntos, setores, classificações, mantenedores, áreas técnicas, turnos, sons e regras de atendimento |
| Configurações da operação   | Teclado virtual, exigência de OS, restrição de conclusão à estação de atendimento e modo padrão/prioritário do Dashboard       |
| BI                          | Indicadores, filtros, análises, qualidade dos dados e relatórios; usa os catálogos compartilhados                              |
| Prioridades                 | Login próprio e organização da sequência visual de produção                                                                    |
| Administração da instalação | Banco, backup, serviços Windows, runtime, kiosk e integrações físicas                                                          |

O Hub não substitui cadastros industriais nem fornece gestão corporativa de usuários. Os dados de chamados, nomes cadastrados e históricos permanecem na fonte existente. O Hub principal acompanha os três idiomas da interface; a administração central desta candidata permanece em português.

## Estações e permissões

Uma estação é identificada pelo UUID persistido no navegador. Outro navegador ou perfil pode gerar outra identidade. Confirme o nome e o identificador antes de restringir acesso; endereço IP é apenas uma informação auxiliar.

Para estações **ativas**:

| ANDON operacional | BI        | Resultado                                                 |
| ----------------- | --------- | --------------------------------------------------------- |
| Permitido         | Permitido | Acesso aos dois módulos                                   |
| Permitido         | Negado    | Operação disponível; BI restrito                          |
| Negado            | Permitido | BI disponível; operação restrita                          |
| Negado            | Negado    | Ambos restritos; Prioridades exige sua credencial própria |

Prioridades continua exigindo autenticação própria em todos os casos. Uma estação **inativa** não acessa os módulos, inclusive Prioridades. A credencial Admin permite somente a recuperação administrativa, sem liberar consultas ou operações negadas.

As permissões são verificadas pela API em cada requisição identificada. A interface também atualiza a política ao navegar e a cada 30 segundos. O heartbeat de identificação usa o intervalo existente de 15 minutos; não é o intervalo da autorização.

Proteções existentes nesta candidata:

- O administrador não pode desativar a própria estação atual; pode reativá-la caso já esteja inativa.
- Não é possível desativar ou retirar o acesso operacional de uma estação com tela fixada ou atendimento ativo. Resolva o vínculo pelos fluxos normais antes de restringir a estação.
- O acesso por URL direta aplica a mesma política do menu.
- Clientes legados sem Origin e sem UUID continuam no fluxo compatível anterior. A identidade do navegador não deve ser tratada como autenticação inviolável do computador.

## Senha global e recuperação

Na seção **Segurança**, informe a senha atual, a nova senha e a confirmação. A credencial continua sendo validada e persistida pelo servidor. Ela vale para o Admin e para o desbloqueio das máquinas, conforme o fluxo existente.

Para preparar a recuperação, confirme a senha atual e clique em **Gerar novo código**. Guarde o código fora do ANDON, em local controlado. O valor aparece nessa geração e o servidor armazena apenas seu hash. Ao sair da seção, o valor exibido deixa a tela. Gerar outro código substitui o anterior.

Se esquecer a senha, use **Esqueci a senha** na tela de acesso administrativo e informe o código. Após uma recuperação bem-sucedida, o código é invalidado; gere e guarde outro. Não inclua senhas ou códigos em URLs, documentação, capturas compartilhadas ou chamados de suporte.

Sessão expirada ou invalidada exige novo login. As sessões do backend seguem o comportamento existente e não são garantidas após reinício do serviço.

## Acesso e sequência de Prioridades

Em **Acesso de Prioridades**, configure usuário, nova senha e confirmação. A credencial é independente da senha global do Admin e vale para os navegadores atendidos pelo mesmo servidor. Sua atualização invalida as sessões de Prioridades existentes.

Abra `/machine-priorities` e entre com essa credencial para editar a sequência. O Hub provisiona o acesso; a sequência é salva no módulo Prioridades. Ao sair com alterações não salvas, confirme o descarte ou permaneça na tela para salvar.

Para o Dashboard consumir essa sequência, selecione a organização por prioridade nas **Configurações da operação** do ANDON. O modo padrão continua disponível. A interface exige confirmar que o acesso de Prioridades está configurado antes de ativar esse modo.

## Ativação, atualização e reversão

Na candidata, `hubEnabled` inicia desativado. Em **Visão geral**, **Navegação do Hub ativa** controla a exibição da navegação central. Desativar essa opção preserva as permissões e não impede abrir `/hub/admin` para recuperação. Para restaurar acesso de um módulo, ajuste a permissão da estação.

A implantação requer backup confirmado do PostgreSQL, configuração instalada e código, seguido da migration `20261014223000_hub_module_access` **antes** de iniciar o backend novo. Ela adiciona `allowOperational` e `allowBi` às estações, ambos com default `true`, e `hubEnabled` às configurações, com default `false`. Não executa seed, reset ou conversão de históricos.

Os backups de código anteriores à candidata são:

- `backup/pre-hub-20261014-main-6fcae079`;
- `backup/pre-hub-20261014-i18n-cfa1d0d`.

O ZIP/bundle de código teve integridade e restauração verificadas. Ele não inclui o banco ou a configuração da instalação. Em uma reversão de código, as colunas aditivas podem permanecer; o código anterior não aplica as novas permissões. Não remova colunas como procedimento emergencial.

## Limites da validação

Builds, tipagem, testes de autorização, testes de interface, navegação com fixtures e integração em PostgreSQL isolado verificam o comportamento da candidata. Os resultados finais e o commit validado estão no PR #199.

A Máquina 37 e a apresentação ficam para verificação manual pelo responsável. Chrome kiosk, Windows Server 2016, PostgreSQL 17 e integrações físicas dependem de evidência do ambiente instalado. Nenhum merge, deploy, reinício de serviço ou alteração de banco produtivo é executado por esta revisão.
