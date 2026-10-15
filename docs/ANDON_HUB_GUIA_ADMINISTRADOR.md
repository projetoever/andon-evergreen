# ANDON Hub — guia do administrador

Evolução candidata baseada na `main` `c041478`, para `1.0.0-pilot.3`, revisada em 15/10/2026. Este documento descreve o código da candidata, sem afirmar instalação ou homologação da fábrica.

## Entradas e navegação

Abra `http://IP:8080/` (ou `/hub`) no endereço da instalação para escolher ANDON operacional, ANDON BI ou Prioridades de produção. O Hub usa o tema, as cores e os componentes existentes do ANDON. O painel operacional passa para `/andon`. Os endereços de BI, Prioridades e máquinas continuam disponíveis conforme as permissões e a exigência de senha.

O launcher/kiosk que abre a raiz passa a apresentar o Hub. O botão **Módulos** permite alternar entre os acessos liberados. Estações com máquina fixada também começam no Hub; ao selecionar ANDON, retornam à máquina fixada e mantêm sua navegação dedicada. A entrada `/hub/admin` permanece acessível para recuperação.

Entre no Admin com a credencial administrativa já existente. Esta revisão não redefine senhas nem cria uma segunda conta administrativa.

| Seção do Hub       | Endereço                          | Uso                                                         |
| ------------------ | --------------------------------- | ----------------------------------------------------------- |
| Visão geral        | `/hub/admin`                      | Consultar entradas e responsabilidades |
| Estações e acessos | `/hub/admin?section=workstations` | Identificar estações, ativar e ajustar permissões           |
| Segurança          | `/hub/admin?section=security`     | Alterar a senha global e gerar código de recuperação        |
| Módulos e senhas   | `/hub/admin?section=modules`      | Configurar os três acessos e a exigência de senha           |

As configurações globais ficam somente no Hub. A sessão Admin continua compartilhada entre as telas no mesmo navegador. **Sair do Admin** encerra essa sessão administrativa; a troca de módulo não finaliza atendimentos ou chamados.

## Quem administra cada função

| Área                        | Responsabilidades                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hub                         | Navegação central, estações, permissões, senha global, recuperação e credenciais dos três módulos                            |
| Admin do ANDON              | Máquinas, conjuntos, subconjuntos, setores, classificações, mantenedores, áreas técnicas, turnos, sons e regras de atendimento |
| Configurações da operação   | Teclado virtual, exigência de OS, restrição de conclusão à estação de atendimento e modo padrão/prioritário do Dashboard       |
| BI                          | Indicadores, filtros, análises, qualidade dos dados e relatórios; usa os catálogos compartilhados                              |
| Prioridades                 | Login próprio e organização da sequência visual de produção                                                                    |
| Administração da instalação | Banco, backup, serviços Windows, runtime, kiosk e integrações físicas                                                          |

O Hub não substitui cadastros industriais nem fornece gestão corporativa de usuários. Os dados de chamados, nomes cadastrados e históricos permanecem na fonte existente. O Hub principal acompanha os três idiomas da interface; a administração central desta candidata permanece em português.

## Estações e permissões

Uma estação é identificada pelo UUID persistido no navegador. Outro navegador ou perfil pode gerar outra identidade. Confirme o nome e o identificador antes de restringir acesso; endereço IP é apenas uma informação auxiliar.

Para estações **ativas**, habilite cada módulo separadamente:

| Exemplo de workstation | ANDON | BI  | Prioridades |
| ---------------------- | ----- | --- | ----------- |
| Terminal de produção   | Não   | Não | Sim         |
| Gestão/manutenção      | Sim   | Sim | Não         |
| Terminal operacional   | Sim   | Não | Não         |

O Hub e o seletor exibem somente os módulos liberados. Sem nenhuma permissão, a estação recebe uma orientação para solicitar liberação; o acesso administrativo permanece disponível. Uma estação **inativa** não usa os módulos. A credencial Admin permite somente sua administração/recuperação.

A exigência de senha é uma configuração separada, por módulo. Conhecer a senha não libera um módulo negado para a workstation. Os defaults preservam os acessos atuais; ajuste os três interruptores conforme a função de cada estação.

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

## Módulos e senhas

Em **Módulos e senhas**, configure uma credencial própria de ANDON operacional, BI e Prioridades. A opção **Exigir senha para abrir** pode ser definida por módulo. Configure usuário e senha antes de ativar a exigência. Para ANDON/BI, deixar a nova senha em branco mantém a senha atual.

Operação e BI começam sem exigência, até uma alteração explícita pelo Admin. Prioridades mantém a exigência anterior e reaproveita a credencial já cadastrada. Não há criação automática de novas senhas.

Essas credenciais são de entrada nos módulos. A senha administrativa global continua necessária para configurações administrativas, e o PIN do mantenedor continua sendo usado nos fluxos correspondentes.

As sessões de ANDON/BI são independentes, vinculadas ao navegador/estação e duram oito horas. **Sair do módulo** no seletor encerra esse acesso e volta ao Hub; não encerra chamados ou atendimentos. Expiração, alteração das credenciais ou reinício do backend podem exigir novo login.

Ao habilitar senha, confirme também os clientes HTTP e integrações que usam as APIs daquele módulo. A exigência passa a valer para essas requisições, inclusive clientes legados sem Origin/UUID.

A inicialização do kiosk e o watchdog usam uma verificação de prontidão própria (`/health/ready`), sem entrar nos módulos. Quando há senha operacional, o teste automático de escrita do instalador informa **SKIP**; faça essa validação pela interface de uma estação autorizada.

## Acesso e sequência de Prioridades

No cartão **Acesso de Prioridades**, dentro de **Módulos e senhas**, configure usuário, nova senha e confirmação. A credencial é independente da senha global do Admin e vale para os navegadores atendidos pelo mesmo servidor. Sua atualização invalida as sessões de Prioridades existentes.

Abra `/machine-priorities` e entre com essa credencial quando a senha for exigida. Se o administrador dispensar a senha, somente workstations identificadas e autorizadas podem editar, e o histórico registra o identificador da estação. O Hub provisiona o acesso; a sequência é salva no módulo Prioridades. Ao sair com alterações não salvas, confirme o descarte ou permaneça na tela para salvar.

Para o Dashboard consumir essa sequência, selecione a organização por prioridade nas **Configurações da operação** do ANDON. O modo padrão continua disponível. A interface exige confirmar que Prioridades está configurado com credenciais ou que sua senha foi explicitamente dispensada antes de ativar esse modo.

## Ativação, atualização e reversão

Nesta candidata, o Hub é a entrada padrão, independentemente do campo legado `hubEnabled`. A tela de administração não tem mais o antigo interruptor para ativar a navegação central. Para restringir um módulo, altere a permissão da estação.

A implantação requer backup confirmado do PostgreSQL, configuração instalada e código. Além da migration da primeira entrega (`20261014223000_hub_module_access`), aplique `20261015123000_hub_entry_credentials` antes de iniciar a API nova. Ela adiciona a permissão de Prioridades, sua política de senha e a tabela de credenciais de ANDON/BI. Não executa seed, reset ou conversão de históricos. Atualize frontend, backend e Prisma Client em conjunto pelo procedimento de atualização da instalação.

Os backups de código anteriores à candidata são:

- `backup/pre-hub-entry-20261015-main-c041478` (anterior a esta evolução);
- `backup/pre-hub-20261014-main-6fcae079`;
- `backup/pre-hub-20261014-i18n-cfa1d0d`.

O ZIP/bundle de código teve integridade e restauração verificadas. Ele não inclui o banco ou a configuração da instalação. Em uma reversão de código, as colunas aditivas podem permanecer; o código da primeira entrega do Hub não aplica a nova permissão de Prioridades nem as senhas de entrada de ANDON/BI. Não remova colunas como procedimento emergencial.

## Limites da validação

Builds, tipagem, testes de autorização, testes de interface, navegação com fixtures e integração em PostgreSQL isolado verificam o comportamento da candidata. Os resultados finais e o commit validado estão no PR desta evolução. Consulte também [entrada e credenciais](HUB_ENTRY_MODULE_CREDENTIALS.md).

A Máquina 37 e a apresentação ficam para verificação manual pelo responsável. Chrome kiosk, Windows Server 2016, PostgreSQL 17 e integrações físicas dependem de evidência do ambiente instalado. Nenhum merge, deploy, reinício de serviço ou alteração de banco produtivo é executado por esta revisão.
