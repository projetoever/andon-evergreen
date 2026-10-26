# Etapa B — workstations compactas

Base: `main` `0e6fd1d`. Evidências do frontend de produção renderizado em Chromium; API HTTP de teste com estado em memória, sem banco ou dados do piloto. A persistência do nome foi conferida após reload nessa API de teste. As proteções reais da API permanecem no backend existente.

| Viewport | Recolhidas | Expandida |
| --- | --- | --- |
| 1366×768 | [Desktop](1366-collapsed.png) | [Desktop](1366-expanded.png) |
| 390×844 | [Celular](390-collapsed.png) | [Celular](390-expanded.png) |
| 360×800 | [Celular estreito](360-collapsed.png) | [Celular estreito](360-expanded.png) |

Capturas de página inteira, com rolagem vertical; o viewport de renderização é o indicado acima. [Resultados das interações e payloads](results.json).

Verificado nos três tamanhos: início recolhido, expansão individual/teclado, pesquisa por IP/estado vazio, filtros, normalização e persistência do nome, ANDON/BI/Prioridades, aprovação pendente, recusa HTTP 403 sem falsa atualização, proteção da estação atual/fixada, ausência de overflow horizontal e controles fora dos cartões. Troca PT/EN/繁體中文 pela interface também aprovada no desktop, preservando nomes cadastrados.

Checks locais: 42 testes direcionados aprovados (identidade, refinamento administrativo, feedback e autorização de workstation); typecheck e builds frontend/backend aprovados; ESLint do componente aprovado; lint geral mantém os 2.551 erros e 19 avisos da base. Sem mudanças de banco, atendimento ou indicadores.

Reprodução: com Playwright disponível externamente, rode `node tests/browser/compactWorkstations.mjs` contra o preview após build. Variáveis opcionais: `ANDON_PLAYWRIGHT_MODULE`, `ANDON_CHROMIUM_PATH`, `ANDON_BROWSER_URL` e `ANDON_EVIDENCE_DIR`. Não há dependência nova no projeto.

Limites: testes usam API de teste, não homologação física no notebook/celular nem gravação no PostgreSQL produtivo. Em teste adicional, recarregar com idioma EN/ZH já salvo gerou erro React #418; o mesmo foi reproduzido na `main` original, sem esta alteração ([registro](baseline-locale.json)). A troca pela interface funciona. Essa pendência geral de hidratação não foi incluída no escopo desta entrega.

Arquivamento, acessos do PR #209 e refinamento geral mobile do ANDON/BI continuam pendentes. Esta alteração só ficará visível na instalação após merge autorizado e atualização/build pelo procedimento oficial.
