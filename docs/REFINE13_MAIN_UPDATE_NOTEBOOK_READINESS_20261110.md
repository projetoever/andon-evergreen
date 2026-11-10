# REFINE 13 — Atualização pela main para testes no notebook com banco original

**Estado:** candidato de integração, NÃO executar até PR consolidada aprovada na main, CI verde e confirmação do ambiente local. O servidor industrial não foi atualizado.

## Pacotes incluídos

- REFINE 12 R12-04A/H3: cadastros de máquinas, mantenedores, turnos, categorias, conjuntos, subconjuntos e tipos; políticas centrais; inventário sanitizado; som local independente de sirene externa e controles visuais
- REFINE 13 PR #420: seleção por nome declarada no login central para iniciar, adicionar e encerrar atendimentos, com auditoria e fallback PIN/RFID
- Demais controles de sessão, workstation, Admin, escopo e auditoria previamente presentes na main

**Não declarar todos os 33 itens de segurança concluídos pela mera presença do código.** Agente físico opcional, GPIO/Node-RED, acesso remoto, confiança kiosk e validação de campo têm seus próprios aceites.

## Antes da opção 2

1. No notebook, confirmar diretório realmente configurado, banco original de teste, host PostgreSQL local, porta, container e identidade do servidor. Não usar IP nem banco da fábrica.
2. Guardar a versão anterior, arquivos de configuração/certificados e backup externo. Confirmar espaço de armazenamento suficiente para backup e clone restaurado.
3. Verificar working tree limpo e estado dos serviços. A operação usa main; não aplicar se a PR consolidada não estiver integrada.
4. A opção 2 pára o ANDON, executa pg_dump custom, protege pasta com ACL de SYSTEM/Administradores, copia o dump, valida SHA256 e restaura em novo banco temporário. Migrações só prosseguem se a restauração terminar com sucesso. O clone é apagado.
5. A evidência é salva em backups/update-<id>/restore-proof.json. Não postar o dump/configuração/segredos em chats, PRs ou Drive. Guardar o backup até homologar completamente.

## Caminho da atualização

- Menu ANDON **2 — Atualizar pela main** (backup e teste de restore obrigatórios antes das migrations). Após instalar, o sistema é iniciado e passa pelo health check.
- Para habilitar escritas centrais apenas no notebook isolado, executar como Administrador o script externo: C:\web-andon-industrial\installer\configure-andon-security-validation.ps1. Escolher ativar e confirmar NOTEBOOK_ISOLADO. O script interrompe a aplicação, grava centralSecurityValidationEnabled na configuração, regenera flags da API e instrui reiniciar.
- Menu **4 — Iniciar ANDON**; menu **6 — Verificar saúde**.
- Para seleção por nome, confirmar no painel que attendanceMode = name. O login central continua obrigatório; a seleção do nome NÃO autentica o mantenedor por PIN/RFID e fica identificada como declaração no log.
- Para desativar as escritas centrais de homologação, executar o configurador externo e escolher desativar; depois 4/6. Esse perfil é OFF por padrão para não modificar fábrica automaticamente.
- A opção 15 do menu principal **permanece removida** por requisito de regressão do instalador.

## Aceite funcional no notebook (banco original de teste)

1. Login central Admin/Gerente/Líder/Manutenção/Produção, módulos e permissões, workstation pendente/aprovada
2. Segurança de sessão, logout, desbloqueio de tela com auditoria, workstation confiável
3. Mantenedores: cadastrar/editar, turnos, áreas, PIN/RFID, selecionar nome, adicionar/encerrar individualmente; bloqueio 1→0
4. Máquinas: cadastrar/editar; conjuntos/subconjuntos/tipos; exigência de OS global/máquina; inventário sem expor dados operacionais
5. Chamados: abertura, atendimento, acompanhamento, retorno à manutenção, histórico, cancelamento e encerramento; testar chamadas simultâneas
6. Sons: mute de navegador independente de GPIO/sirene; temporizadores; persistência
7. BI: MTTA, MTTR, MTBF, disponibilidade e downtime antes/depois; comparação no mesmo período de referência
8. PT/EN/ZH-TW; interface e APIs sem erros; verificar política de HTTPS, Origin e CSRF

## Bloqueios e recuperação

- A validação por CI/restore em clone prova consistência do dump, **não** prova que o banco original migrado está homologado funcionalmente.
- O atualizador não faz rollback automático de todas as migrações após o início do pipeline. Em falha após migrations, interromper a aplicação, preservar logs e usar procedimento de restauração supervisionado a partir do backup protegido; não reiniciar repetidamente nem executar db:seed.
- Não aplicar na fábrica até homologação explícita dos testes no notebook e planejamento de janela operacional.
