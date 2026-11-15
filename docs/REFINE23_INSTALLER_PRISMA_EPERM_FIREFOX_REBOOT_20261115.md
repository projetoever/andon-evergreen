# REFINE 23 — WIN-EPERM | Atualização robusta e login operacional após reinicialização
Data: 15/11/2026. Base inicial da branch: `a0ad3cfbad9475e1d0844697a1736b89955b71ea`.

## Falha reportada (log real do notebook)
Atualização pela opção 2 chegou a sincronizar `origin/main`, registrar SHA `a0ad3cf...`, validar backup restaurando isoladamente, preservar Docker/PostgreSQL e parar Boot/Watchdog/Kiosk. Após `npm install`, o comando `prisma generate` falhou com `EPERM rename query_engine-windows.dll.node.tmp9492 -> query_engine-windows.dll.node`. A aplicação e as tarefas ficaram paradas; isto não implica migration ou perda de dados. A falha pode envolver processo Node ainda carregando a DLL (inclusive processo fora dos marcadores tradicionais do instalador), antivírus ou um lock temporário do filesystem. Não se deve excluir a DLL, diretórios do banco, containers, volumes ou perfil do navegador para corrigir.

## Correções no menu principal
1. Antes de regenerar, `Test-AndonPrismaClientReusable` verifica existência e tamanho positivo do engine Windows e arquivos de execução, versões idênticas de `prisma`/`@prisma/client` e a correspondência exata entre schema usado e schema gerado (normaliza apenas BOM/quebra de linha). Se estiver íntegro, **não executa prisma generate** e não renomeia DLL.
2. Se schema ou dependências realmente mudaram, `Invoke-AndonPrismaClientEnsure` executa gerador, verifica artefatos e limita retries a **3**. Após falha transiente, espera intervalo curto e tenta novamente. Nunca faz `Remove-Item` da engine nem supõe que uma geração incompleta vale.
3. `Stop-AndonPrismaEngineNodeOwners` procura apenas processos `node.exe` que tenham carregado **exatamente** `<projeto>\server\node_modules\.prisma\client\query_engine-windows.dll.node` conforme `Get-Process -Module`. Processos que não podem ser identificados com segurança não são encerrados. Docker, banco e serviços Node de terceiros ficam preservados.
4. Se o update falhar **após Stop-AndonRuntime**, há tentativa de recuperar API/frontend com runtime existente sem seed/migration adicionais, restaurando o estado das tarefas previamente desativadas. A operação ainda retorna código de falha e mantém o log; não declara instalação concluída. Se recuperação falhar, o operador deve usar opção 4 ou 6 e revisar o log; não executar instalação limpa.
5. Teste Windows `installer/tests/installer-prisma-eperm-regression.ps1` simula cliente íntegro, schema alterado, `EPERM` transiente, divergência de versões, engine ausente, owner cleanup limitado e recuperação. Rodado na CI Windows PowerShell 5.1.

## Duração "Não expirar" e reboot da workstation
- Sessão de produção efetivamente `persistentOperational: true` está registrada no PostgreSQL e é associada ao cookie `__Host-andon-access`, `HttpOnly; Secure; SameSite=Strict; Max-Age=34560000` (400 dias) com renovação na verificação autenticada; fecha/reabre Firefox sem perder a sessão quando o navegador preserva cookies.
- Identidade da workstation mantém cookie independente de longa duração e espelho `localStorage` na origem, sem armazenar senhas, tokens em JavaScript ou autorização baseada somente no UUID.
- Após reiniciar Windows, o serviço ANDON deve ser iniciado pelas tarefas Boot/Watchdog quando estiverem habilitadas; manter apenas sessão autenticada não liga automaticamente o serviço. A configuração da opção 8 (desativar inicialização automática) deve ser respeitada.
- **Limites reais:** perfil privativo, preferência de limpar cookies ao fechar, limpeza manual, políticas do Firefox, mudança de hostname/IP/protocolo, bloqueio de cookies, estação revogada, senha/ACL alterada ou logout remoto exigem novo login. Não é seguro gerar novo cookie a partir do UUID sem autenticação.
- Teste `tests/persistentSessionEligibility.test.ts` registra invariantes do cookie durável, identidade e boot. O teste físico após reinicialização continua obrigatório.

## Plano de homologação
1. Após CI verde e merge, faça backup, rode opção 2 pela main e verifique o SHA publicado. O novo instalador reutiliza Prisma válido; se stale, faz até 3 tentativas, sem exclusões.
2. Confira API/Frontend 3001/8080, backup e log, sem alterar banco. Verifique status das tarefas automáticas e habilite via menu 9 apenas se quiser subir ANDON após reiniciar o Windows.
3. No Firefox normal, acesse **sempre o mesmo HTTPS host**. No Hub confirme `Sessão sem expiração confirmada pelo servidor`. Reinicie Firefox e Windows sem limpar cookies. Verifique Hub, máquina fixada, Histórico e abertura/atendimento.
4. Confira que revogação administrativa, estação desativada, permissão removida e desfixação ainda fazem o servidor negar sessões anteriores.

**Não houve acesso ao notebook, servidores da fábrica, produção, banco real ou CLP** durante este desenvolvimento. Testes são somente em código/CI; rollout físico é do operador.
