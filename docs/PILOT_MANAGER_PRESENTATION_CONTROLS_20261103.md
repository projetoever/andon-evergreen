# ANDON Evergreen — piloto S2B/2: ajustes de apresentação do Gerente

**Data:** 03/11/2026. **Status:** implementação em branch com CI obrigatória. **Ambiente industrial:** nenhuma alteração.

## Regra de acesso

- Na administração central, o Gerente com conta pessoal, `andon.read`, `workstations.read`, escopo de todas as máquinas e workstation ativa/aprovada pode **consultar** o Hub. O perfil não é autorização: os grants efetivos da conta, emitidos pela API, são obrigatórios.
- A permissão adicional `hub.settings.presentation.write` autoriza apenas `virtualKeyboardEnabled` e `dashboardMachineOrderMode` na rota `PATCH /api/system-settings`.
- Mesmo com a permissão, a escrita depende de `ANDON_CENTRAL_ACCESS_ENABLED=1` e `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED=1`. **As flags ficam OFF por padrão.**
- Guardas: HTTPS, origem, cookie central HttpOnly, workstation, escopo total, autorização do módulo, permissão por campo, CSRF e recusa de chaves extras. Dentro da transação PostgreSQL, ocorre bloqueio de conta/workstation, trava da configuração global e nova verificação de sessão/permissões antes de atualizar e auditar. Falha de auditoria deve reverter a mutação.
- O Admin principal preserva a autoridade já existente, sujeita à mesma flag de escrita central.

## Campos NÃO autorizados ao Gerente neste pacote

- OS obrigatória (`requireWorkOrderAtOpen`), restrição de conclusão por workstation, modo de atendimento, PIN/RFID, sirene, mute global, credenciais, perfis, aprovações de estação, usuários, catálogos, configuração de cliente ou alterações de módulos.
- Um PATCH misturando um campo permitido com outro negado deve falhar por inteiro. Nenhum nome de perfil pode substituir o grant explícito. Não é permitido bypass por `PATCH` genérico, rota legada ou URL direta.

## Homologação no notebook

1. Atualizar apenas o notebook HTTPS isolado após CI e merge. Não instalar no servidor Evergreen.
2. Em `Admin > Usuários e Acessos`, cadastrar um Gerente novo ou editar o Gerente antigo e aplicar novamente o perfil sugerido **somente depois de revisar privilégios atuais**; contas já existentes não recebem automaticamente a nova permissão. Usar escopo `Todas as máquinas`, preservando os registros anteriores.
3. No launcher local, conferir que o modo padrão mantém `ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED=0` e os controles aparecem desabilitados. Testes de escrita central exigem o switch existente `-EnableCentralOperationalWrites` e dados fictícios.
4. Com flag ON, verificar alterações de teclado e ordem visual da máquina com Gerente, persistência após recarga e auditoria; tentar modificar OS, RFID e campo misto e receber `403 permission_denied` sem alterar o banco.
5. Retirar `hub.settings.presentation.write` do Gerente e confirmar indisponibilidade imediata da operação, inclusive com navegador aberto. Repetir com workstation bloqueada, sessão expirada e origem/CSRF inválidos.
6. Repetir com Admin principal e com Produção/Manutenção para garantir isolamento. Sem autorização para integrar mini PC/Node-RED/GPIO neste pacote.

## Próximos gates

S1 migração da senha legada por rota; S2B ampliação individual de operações gerenciais; S3 retirada de senhas por módulo; S4 inventário dos clientes Node-RED/sirene e tokens de serviço; S5 heartbeat, presença e arquivamento auditável; S6 backup, rollback, testes de duas workstations e autorização explícita de produção.
