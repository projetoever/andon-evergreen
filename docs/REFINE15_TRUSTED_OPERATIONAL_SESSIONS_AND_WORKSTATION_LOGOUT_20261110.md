# REFINE 15 — Sessões sem expiração operacional e Workstations (10/11/2026)

## Requisito do piloto

Telas ANDON de produção fixadas em máquinas precisam permanecer utilizáveis continuamente. Sessões humanas normais conservam limites de **30 minutos de inatividade e 12 horas absolutos**, mas **estações explicitamente confiáveis** podem emitir uma sessão operacional **sem expiração automática no servidor** para usuários não administrativos. O Admin principal precisa poder habilitar/desabilitar essa confiança e forçar o logout remoto na aba **Workstations**.

## Invariantes de segurança

- A função é **OFF por padrão** em todas as workstations; migração SQL aditiva não altera contas, chamadas, dados da produção ou certificados.
- Somente Admin principal, logado e reautenticado recentemente (5min), com CSRF e origem HTTPS exata, pode alterar confiança de uma workstation ou forçar logout da estação de outro usuário.
- Para ativar: estação **ativa, aprovada e com tela fixada em uma máquina**. Login sempre exige senha pessoal. O usuário deve ser pessoal, ativo, não Admin, senha definitiva, sem qualquer permissão fora da allowlist operacional/restrita. Outras funções de gerenciamento/Hub/segurança não se tornam permanentes, mesmo que estejam associadas ao perfil.
- A sessão persistente é revalidada no **servidor em toda requisição**: usuário e autorizaçãoVersion, workstation id, estação ativa/aprovada, confiança ainda ligada e máquina fixada. A requisição passa a ter **escopo exclusivamente da máquina fixada**, nunca herda acesso global.
- Revogação explícita, desativar confiança, bloquear workstation, desfixar máquina, inativar usuário, redefinir senha ou mudar permissões torna a sessão inválida.
- Troca de usuário numa estação confiável invalida sessões anteriores. Não modificar a regra de convivência de sessões em estações normais.
- Logout remoto de uma workstation diferente da atual exige motivo auditado e uma sessão Admin recente; **nunca expulsa Admin** e não altera estado físico da máquina, chamados, manutenção ou histórico.
- Cookie HTTPS HttpOnly SameSite Strict. Navegadores impõem limite para persistência de cookies (ex. cerca de 400 dias) e limpeza de dados, perfil anônimo, bloqueio de cookies ou mudança de navegador exigem login novamente. Isso **não contradiz a política sem expiração automática no servidor**, mas impede garantir login eterno independentemente do estado do browser.
- Heartbeat/polling não renova validade administrativa nem é prova de identidade física. Função kiosk R9-05/06 continua à parte (agente de identidade opcional e prova de posse); não usar IP, UUID do navegador ou hostname como credencial de login.

## Funcionalidades

- `Workstation.allowPersistentOperationalLogin` default FALSE; `AccessSession.persistentOperational` default FALSE.
- Switch `Não expirar login operacional` em Workstations e estado da sessão na aba.
- Botão `Forçar logout da workstation` com motivo (>=8 caracteres), apenas para outra estação, enquanto há sessão válida.
- Após habilitar, operador efetua logout/login com suas credenciais para receber sessão sem expiração. Limite de cookies do Chrome deve ser observado.
- Ao desativar confiança, sessões persistentes são revogadas imediatamente; sessões ordinárias continuam a seguir os limites normais.

## Homologação notebook — aceite esperado

1. Opção 2 na **main apenas depois de CI e merge**, com backup e restore isolado; opção 4 inicia e 6 verifica saúde.
2. Workstation piloto aprovada, tela fixada na máquina 37; Admin reautenticado habilita switch, Produção realiza novo login.
3. Simular tempo de inatividade e sessão >12h via banco de teste **isolado** (nunca mudar timestamps do andon_db original); confirmar acesso somente na máquina fixada e status de sessão.
4. Login Manutenção com grants operacionais pode persistir; usuário com administração, Gerente com grants sensíveis e Admin **não** ganham sessão permanente.
5. Admin consegue forçar logout remoto com motivo. Operador tem que autenticar de novo. Encerrar sessão não finaliza chamado em curso.
6. Desativar confiança invalida tokens duráveis; reativar exige novo login. Bloquear estação, desfixar tela e alterar credenciais também revogam/invalidam.
7. Validar dois navegadores, reinício do kiosk, cookie preservado e browser privado; verificar auditoria e distinção entre presença por heartbeat e sessão válida.

## Pendências de médio prazo

- Aceite operacional do notebook original, e teste pós-instalação de migrações.
- Se necessário, autenticação de dispositivo com prova de posse criptográfica (opcional, sem depender de GPIO ou mini PC) para reduzir a confiança na identidade apenas de navegador.
- Rotina industrial de rollout com rollback, comunicação e piloto máquina 37.
- Planejamento geral ANDON: S3-B motivos/subcategorias nos botões de abertura e histórico; S4 integração BI; inventário restante de 33 controles de segurança, permissions workstations e agente físico separados.

**Status desta PR:** Draft em validação; não mesclar nem atualizar a fábrica sem CI verde e documentação do aceite.
