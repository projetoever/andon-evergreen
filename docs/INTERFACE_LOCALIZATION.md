# Localização da interface — pilot.3

Revisão de 15/10/2026, a partir da main `c99e802`. Português do Brasil continua sendo o idioma inicial; English e chinês tradicional (`zh-TW`) são as alternativas.

## Cobertura

A seleção é compartilhada pelo Hub, administração do Hub, ANDON, configurações industriais, modais de chamado/atendimento, históricos, Prioridades e BI. Inclui títulos, campos, opções, estados vazios, carregamento, ajuda, acessibilidade, notificações e mensagens de validação conhecidas. Relatórios executivos, fichas individuais em PDF e cabeçalhos do CSV acompanham a seleção. Backups JSON conservam o contrato original de dados.

A preferência usa a chave existente `andon.interfaceLanguage` no navegador da workstation e sobrevive à atualização da página. Outro navegador/perfil tem sua própria preferência. Hub e Dashboard mantêm o seletor; BI, Prioridades e administração do Hub também permitem alternar o idioma. Seletores compactos têm identificação acessível.

## Dados que permanecem originais

Nomes cadastrados, identificação de máquinas, setores, conjuntos, subconjuntos, turnos, mantenedores, classificações, OS, diagnósticos, observações e justificativas são apresentados conforme armazenados. Uma classificação chamada “Qualidade”, por exemplo, conserva esse nome mesmo que a palavra também exista no dicionário de rótulos da interface.

Datas e números usam a convenção do idioma escolhido. A fonte autoritativa do horário, o fuso operacional, os instantes gravados e os cálculos de duração permanecem iguais. A tradução não altera chamadas HTTP, payloads, credenciais, identificadores, reconhecimento de estação ou autorização.

## Manutenção do código

- `src/i18n/language.ts`: idiomas, chave de persistência e locale de apresentação.
- `baseMessages.json`, `messages.ts` e `contextMessages.ts`: textos próprios da aplicação. Contextos distinguem “Ativo” como equipamento, cadastro habilitado ou chamado em andamento.
- `LanguageProvider`: preferência e atualização dos componentes. Textos calculados na renderização usam `t` ou `ui`; componentes que usam `ui` observam `useLanguage`.
- Templates usam parâmetros: `ui("Máquina {0}", {0: machineId})`. Os parâmetros não são traduzidos nem interpolados novamente. Nunca passe texto livre do usuário como chave de tradução.
- Metadados visuais definidos fora de componentes usam getters, evitando congelar os rótulos no idioma inicial. Valores internos de grupos e enums continuam estáveis.
- `systemMessage` traduz mensagens conhecidas somente na apresentação. Erros brutos continuam disponíveis para regras de negócio e diagnóstico. Diagnósticos desconhecidos são preservados; mensagens novas devem entrar no catálogo, em vez de serem traduzidas automaticamente por correspondência de palavras.
- A camada de notificações localiza mensagens ao exibir o toast. Validação nativa dos formulários acompanha o idioma; erros próprios do formulário não são sobrescritos.
- HTML dos relatórios traduz apenas a cópia produzida pelo sistema e mantém o escape dos dados cadastrados. Não traduzir o HTML completo ou os registros retornados pela API.

Não há serviço externo de tradução nem exigência de internet. O navegador utiliza as fontes locais disponíveis para chinês tradicional; a pilha inclui Microsoft JhengHei, PingFang TC e Noto Sans CJK TC.

## Verificação

`tests/i18nCoverage.test.ts` verifica existência de chaves, traduções e parâmetros, proíbe cópia fixa em JSX sem localização, testa preservação de conteúdo livre e mensagens de erro e cobre a validação de formulários. Os testes de PDF conferem tradução e escape sem modificar os dados.

A verificação no Chromium em modo API com respostas controladas cobre alternância English/繁體中文, persistência após reload, BI, cadastro de classificação e tela operacional. A classificação mantém seu texto original e envia `responsibility: process` e `analyticsDisposition: test` sem tradução. Os PDFs executivos foram renderizados nos três idiomas: três páginas em cada relatório, com conteúdo acima do rodapé. Essa verificação visual não substitui a validação no notebook do piloto.

Não há alteração de banco, migration, rotas de API ou implantação nesta revisão. A aplicação no ambiente da empresa continua pelo procedimento de atualização existente após o merge aprovado.
