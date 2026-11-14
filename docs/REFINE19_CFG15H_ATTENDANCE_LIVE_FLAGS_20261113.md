# REFINE19 — CFG-15H | Modo de atendimento: controle de gravação e nome declarativo

Data: 13/11/2026. Referência #477/#345.

## Falha de consistência
A aba Modo de atendimento usava as flags `centralOperationalSettingsWriteEnabled` e `centralDeclaredAttendanceEnabled` do mesmo snapshot inicial do formulário. Após mudança da política no servidor, o aviso superior das 11 abas atualizava (#521), mas os cartões, o seletor PIN/RFID e o botão Salvar podiam permanecer desatualizados.

## Alteração
Separar a leitura de capacidades da leitura do formulário. Revalidar ambas as flags via GET real do servidor ao montar após carregamento, recuperar foco ou receber SYSTEM_SETTINGS_CHANGED_EVENT. Enquanto pendente ou em erro, negar gravação de modo conservador. Descartar respostas antigas via requestVersion, limpar eventos no unmount e preservar rascunhos de PIN/RFID sem sobreescrever `settings`/`savedSettings`. Quando o modo do formulário for `name`, Salvar exige adicionalmente a flag independente declarativa; não autorizar somente por `centralOperationalSettingsWriteEnabled`.

## Segurança e aceite
Nenhuma alteração de rota, PIN, autenticação, workstation, API, ACL, migrations, flags ativas, CLP ou máquina industrial. O servidor continua exigindo credenciais e gates específicos. Teste CFG-15H no pacote de regressão das 11 abas. CI Windows PowerShell5.1 + Linux/PostgreSQL/UI/SSR antes de merge. Teste manual notebook: alternar entre PIN/RFID, editar termo RFID e recuperar foco com rascunho; simular capabilities restritas apenas em instalação de testes autorizada. Não homologado até retorno do responsável.
