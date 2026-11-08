# REFINE12 / R12-03 | Segurança do atualizador LAB legado (#372)

08/11/2026. Issue #372. Branch independente derivada de main; **não inclui nem libera novos módulos**.

## Falha original confirmada
`ATUALIZAR_NOTEBOOK.ps1` selecionava `main` e sincronizava arquivos para `C:\web-andon-industrial\installer` mesmo quando chamado a partir de uma cópia de homologação. Na HML isto violava o isolamento e poderia sobrescrever os arquivos de instalação original.

## Correção cirúrgica nesta PR
- Logo após obter `$repoRoot`, **antes de git/status, Docker, Stop, mkdir, Copy-Item ou update**, exige o caminho canônico **exatamente** `C:\web-andon-industrial\andon`.
- Rejeita junction/symlink no diretório-base; rejeita outros repositórios Git, clones secundários e diretórios de LAB; falha com orientação para usar apenas atualizador isolado.
- Mantém o comportamento atual do instalador de notebook ORIGINAL quando invocado do diretório esperado. Não altera scripts, menu ou banco industrial nesta PR.
- Adiciona teste Windows PowerShell 5.1 `installer/tests/installer-lab-updater-isolation.ps1` que executa a entrada real da rotina em clone de CI para comprovar falha antecipada sem acionar comandos de instalação. O próprio teste recusa rodar na pasta industrial. O workflow `pr-validate.yml` obriga esse teste.

## Limites / pendências
- Não converte `ATUALIZAR_NOTEBOOK.ps1` em atualizador universal de LAB; **continua PROIBIDO na homologação**.
- O procedimento aprovado para o notebook é **o arquivo standalone V2** `ATUALIZAR_ANDON_HML_E034_REFINE12_V2.ps1`, fornecido em ZIP na conversa, fixado em PR #385 E034 SHA `92debbe57d96f452cc2d72082e3fd6787294b246`, com banco isolado `andon_https_hml` e backup/restore.
- Não há merge, deploy ou modificação do usuário por esta PR; CI e revisão ainda requeridas. O fechamento completo #372 pede homologação Windows real e posterior criação de instalador LAB integrado autônomo (não como atualização silenciosa do industrial).
- Nunca acessar `andon_db`, fábrica, máquina 37, Node-RED, GPIO ou PLC.
