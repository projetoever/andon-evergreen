# HUB — Identificação de build e comparação com GitHub (29/10/2026)

## Local
Administração do Hub → **Visão geral** → **Versão e rastreabilidade**. Somente renderizado após validação de acesso administrativo (comportamento atual da página).

## Informações exibidas
- Versão declarada do produto no `package.json` de raiz (atualmente `1.0.0-pilot.3`).
- **SHA completo do commit usado na compilação do frontend** (copiável, com link para commit). SHA abreviado só deve ser usado na conversa, nunca para identificar exatamente uma compilação.
- Branch do repositório no momento do build, quando disponível, sem inventar `main` para checkout destacado.
- PR da compilação somente quando o contexto CI disponibiliza `GITHUB_REF=refs/pull/N/merge`; compilação normal da `main` não tem um PR único atribuível.
- Data/hora de compilação UTC, link para comparar `SHA...main` e link para visualizar a `main` online no GitHub.

## Origem e integridade
O Vite injeta `__ANDON_BUILD_METADATA__` no build estático, sem consulta de internet no kiosk. Prioridade do SHA: `ANDON_BUILD_COMMIT` validado (40 caracteres hexadecimais) → `git rev-parse HEAD` no diretório da compilação → identificador **indisponível**. A branch vem de `ANDON_BUILD_BRANCH`, `GITHUB_HEAD_REF` ou `git symbolic-ref`. O script de instalação/atualização Windows passa **o mesmo commit fixado em `andon-config.json.installedCommit`**, removendo esse ambiente após a compilação para não afetar outras operações.

O SHA corresponde à compilação do **frontend**, e não comprova que o backend ou o serviço industrial estejam no mesmo commit. O link `Comparar com a main` consulta a situação atual apenas **quando clicado e com internet**. A interface não afirma estar sincronizada com a `main` em tempo real.

## Cenários para testar
1. Instalar/atualizar via installer pinado; confirmar SHA exibido = SHA registrado, sem internet.
2. Rodar build direto com Git disponível; confirmar SHA = HEAD local.
3. Compilar sem Git nem `ANDON_BUILD_COMMIT`; informar indisponibilidade em vez de exibir o último SHA conhecido.
4. Branch de feature/PR via CI deve aparecer como origem; compilação na main deve ser identificada como main quando a origem for conhecida.
5. Abrir no notebook e comparar o SHA com o GitHub; testar o botão copiar em HTTPS, responsividade e PT/EN/ZH.

Sem deploy automático, sem migrations, sem alteração de certificados, banco, Node-RED/GPIO, Máquina 37 ou permissão operacional central.

## Expansão recomendada
Em fase posterior, disponibilizar um campo separado **Backend em execução** por endpoint administrativo protegido que leia metadados fixados no servidor — sem confundir com o frontend; acrescentar checagem de divergência entre versões quando houver homologação do backend.
