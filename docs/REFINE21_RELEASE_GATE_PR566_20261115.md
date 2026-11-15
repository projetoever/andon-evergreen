# REFINE 21 — Gate de atualização pela main (pacote #566)
Data: 15/11/2026. Base original: `cc24d399af7255d68b8b3693a9f99f0d3974f28d`.

## Âmbito e limites
Integra código das PRs #561–#565 em uma única árvore. Este documento NÃO declara o notebook homologado, nem autoriza deploy industrial. **Não atualizar o notebook enquanto a PR #566 não tiver CI combinada verde e merge confirmado na main.** Sem alteração manual no `andon_db`, Docker real, volume, certificado, identidade/cookie do navegador, CLP, Node-RED ou GPIO.

## Gate CI obrigatório
- Windows PowerShell 5.1: instala/reutiliza Prisma Client, simula EPERM e geração que normaliza o schema; valida fingerprint com hash de schema e package-lock. Cliente stale, DLL ausente ou versões divergentes nunca passam silenciosamente.
- Linux/PostgreSQL efêmero: migrations e validações analíticas apenas no banco de CI, endpoints de acesso, Workstations, UI, build frontend/SSR e execução browser.
- Sessão normal não ganha permissão por duração 24h/persistente; dados de Workstation e escopo de máquina protegidos pelo servidor.
- Cores não tocam `--danger`, `--warning`, estado de máquina nem indicadores.

## Homologação no notebook APÓS SHA integrado
1. Anotar SHA instalado, opção 6 (saúde), porta 3001/8080, modo HTTPS e estado de tarefas Boot/Watchdog/Kiosk. Fazer backup validado antes do update; não executar instalação limpa.
2. Usar **opção 2 somente depois da liberação do SHA na main**. Confirmar exit code 0 e `prisma generate` validado/reutilizado; revisar log persistente. Se falhar, coletar log, não excluir DLL ou banco. Verificar também status das tarefas automáticas conforme escolha anterior de boot, não habilitá-las implicitamente.
3. Abrir Hub pelo mesmo endereço HTTPS. Com perfil de produção autorizado, estação aprovada e confiável, máquina fixada e política `Não expirar`, confirmar no Hub que o servidor marcou a sessão persistente. Fechar/reabrir Firefox sem limpar cookies, depois reiniciar Windows, acessar o mesmo HTTPS host e conferir Hub, máquina fixada e Histórico. Testar remotamente revogar sessão e desativar confiança.
4. No Hub, provocar falha de autenticação e tentativas de clicar duas vezes: apenas um POST por ação, nome de usuário mantido em falha e senhas/tokens nunca gravados em localStorage.
5. Em Configurações > Aparência e cores, testar seis presets e 10 cores, RGB 0–255 de R/G/B editado em sequência, cor preta no espectro, HEX, contraste claro/escuro, salvar globalmente com autorização e conferir em outra estação. Invalid RGB deve ser rejeitado sem salvar; alarmes de segurança inalterados.
6. No Android 360/390/412 px, abrir máquina, verificar botões completos `Produção Programada`/`Fora de Produção`, modal de autenticação, campos e CTAs; tocar repetidamente `Confirmar` não pode gerar POST duplicado. Sem permissão mostrar aviso, sem mudar a produção.
7. Em Workstations, testar Admin e pessoa com grant `workstations.manage` para ações autorizadas; usuário comum não edita. Forçar API offline durante carregamento e confirmar que acesso desconhecido não habilita edição. Modo legado só se confirmado pelo Hub.
8. Testar ciclo de chamado real de laboratório (abrir/atender/acompanhamento/finalizar, OS única, históricos e BI) e confirmar os indicadores não alteraram por cores ou sessão.

## Diagnóstico versus aceite
- CI PASS = testes automatizados da versão integrada.
- Merge `main` = pacote disponível para atualizar o notebook.
- Homologação notebook = necessária para confirmar correção física da validação Prisma, persistência no Firefox/reboot, e comportamento visual Android.
- Fábrica = **não autorizada**, depende de etapa específica, backup, avaliação de segurança de rede e aceite separado.

## Pendências gerais não encerradas
Este pacote **não** conclui automaticamente todas as issues #477 (11 abas), #467 (mobile), #480 (backlog mestre), #519 (temas avançados), nem os testes físicos de segurança, usuários/Workstations e ANDON BI.
