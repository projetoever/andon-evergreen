# REFINE 19 — UX-MAQ-01 | Simplificar cadastro de máquinas e exigir OS sem redundância

Data: 13/11/2026. Evidência: imagem enviada do notebook com duas listas simultâneas na aba Máquinas do painel ANDON.

## Entrega
- Retirar da renderização da aba o componente `MachineConfigurationInventoryCard` que repetia as máquinas à direita. Mantém-se a lista principal com busca, filtros, edição de metadados e estrutura de máquinas; o endpoint separado do inventário global permanece no backend (sem alteração de ACL/flags), apenas não é mais chamado por essa interface.
- A regra de abertura de OS permanece **global OU por máquina**, inalterada no servidor e em ambos os modais de abertura. Se o global estiver **ligado**, a interface mostra um aviso conciso de obrigatoriedade geral e não apresenta controle de OS individual. Se o global estiver **desligado**, a configuração de OS por máquina aparece tanto em criar quanto editar; filtro de OS da lateral aparece apenas nessa condição. Quando a regra global não é verificável, a opção individual fica oculta em modo conservador com mensagem de status.
- Não apagar, redefinir nem migrar o valor individual já salvo quando a regra global está ligada; se o global for desativado no futuro, a configuração individual reaparece com seu valor anterior. Na criação de nova máquina com regra global ligada ou indisponível, o valor individual inicial é `false`, evitando redundância futura.
- Reduzir o bloco repetido de três colunas (global/local/efetivo) ao aviso breve. A edição da programação e o estado ativo permanecem nas rotas/proteções originais.
- Tradução dos novos avisos PT/EN/zh-TW e testes da interface.

## Segurança e validação
Somente frontend/UX e textos/testes. Sem alteração de `requireWorkOrderAtOpen` persistida para máquinas existentes, Prisma/Postgres, API, Workstations, autenticação, flags industriais, PLC, GPIO, Node-RED ou servidor de produção. Exigir CI Windows 5.1, frontend e PostgreSQL. Homologação manual no notebook: global ON/OFF; máquina local ON/OFF; troca de global ON→OFF e persistência; seleção/filtros sem duplicação; abertura de chamado respeitando global OU local. Não marcar como homologado até retorno do responsável.
