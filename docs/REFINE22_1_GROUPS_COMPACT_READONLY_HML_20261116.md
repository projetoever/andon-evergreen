# REFINE 22.1 — Grupos compactos e abertura por grupo sob controle

Data: 2026-11-16
Origem: feedback visual da aba Grupos de chamados e da máquina 9.
Ambiente: homologação no notebook, atualização pela main (opção 2).

## Diagnóstico confirmado no código

O grupo TESTE estava cadastrado e ativo com Elétrica e Mecânica. A rota GET /api/call-reasons/operational recusava fornecer até mesmo os grupos ativos quando ANDON_HIERARCHICAL_CALL_OPEN_ENABLED=0. O painel montava os botões somente após essa leitura, portanto nenhum botão de grupo aparecia. Isso confundia status do cadastro com permissão de abertura.

## Contrato corrigido

- Catálogo central ON + sessão central + permissão calls.open: GET /api/call-reasons/operational devolve apenas grupos e setores ativos, independentemente do flag de **abertura**. Sem catálogo ou autorização, acesso continua negado.
- Cada grupo recebe openingEnabled calculado **pelo servidor** a partir da configuração. Com openingEnabled=false, o botão aparece na grade dos setores originais, desabilitado e com mensagem visível; não abre modal ou chamado.
- Com abertura HML ON, o botão usa a mesma CSS/altura/grade dos setores, seleciona um setor do modal e usa a transação existente (revalidação de grupo, setor, revisões, status, direitos de acesso, OS, chamadas duplicadas e snapshot da origem).
- O POST de abertura mantém ANDON_HIERARCHICAL_CALL_OPEN_ENABLED obrigatório e valida tudo novamente no servidor; o GET nunca autoriza o POST por conta própria.
- O uso direto dos setores e sua cor, subtipo, sons/GPIO e indicadores permanece igual. Classificação por grupo continua aplicada apenas à abertura via grupo.

## UI admin

- Lista lateral de grupos em linhas compactas, com amostra de cor e status.
- Prévia reduzida no cabeçalho do editor.
- Formulário com espaçamento menor e duas colunas.
- Vínculos de setores em grade compacta (2 colunas em telas largas), sem herdar altura mínima de botão operacional.

## Homologação

1. Conferir backup, confirmar SHA instalado no instalador e SHA vivo no Health Check menu 6.
2. Configurar TESTE como ativo com Elétrica e Mecânica ativos.
3. Acessar /machines/9: botões originais continuam; TESTE aparece desabilitado com aviso se a abertura HML estiver OFF.
4. Apenas no notebook isolado, sem máquinas/sinais/dados reais, habilitar a abertura no script installer/configure-andon-security-validation.ps1, opção 3, confirmações NOTEBOOK_ISOLADO e TESTAR_HIERARQUIA. Iniciar pelo menu 4. **Não** aplicar em servidor de fábrica.
5. Acessar máquina 9: TESTE agora clicável, modal traz Elétrica/Mecânica; ao clicar em setor já ativo, seleciona chamado existente sem duplicar. Setor livre segue fluxo da OS e confirmação de produção, com política do grupo no snapshot.
6. Comparar setor direto × grupo no histórico e BI. Não promover se os testes de OS, CSRF, duplicidade, snapshot e no-audio/Node-RED não estiverem homologados.
7. Reverter a abertura via script opção 4, reiniciar menu 4; o grupo volta visível e desabilitado.

Nenhuma alteração de schema, seed, banco, política de login, firewall, TLS ou integração industrial.
